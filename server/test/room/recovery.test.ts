import { describe, expect, it } from "vitest";
import { isSnapshotData } from "../../src/protocol/validate.js";
import { ROOM_MAX_AGE_MS, ROOM_WITHOUT_HOST_MS } from "../../src/room/limits.js";
import { isHostOnline, reduce } from "../../src/room/room.js";
import { fromSnapshot, snapshotProblem, toSnapshot } from "../../src/room/snapshot.js";
import type { RoomState } from "../../src/room/types.js";
import { stateFor } from "../../src/room/view.js";
import {
  HOST,
  HOST_SECRET,
  JOIN_SECRET,
  PUBLIC_URL,
  RoomHarness,
  hasState,
  participantId,
  reasonOf,
  sent,
} from "../support/room-harness.js";

function resume(
  jam: RoomHarness,
  outbox: readonly string[] = [],
  secret = HOST_SECRET,
  restored = false,
) {
  return jam.apply({
    kind: "resume",
    connection: "c-host-2",
    id: "h9",
    hostSecret: secret,
    outbox: outbox.map((itemId) => ({ itemId })),
    restored,
  });
}

function evening(): { jam: RoomHarness; anya: string } {
  const jam = new RoomHarness();
  const anya = jam.guest("Аня");
  for (const id of ["1", "2", "3"]) {
    jam.add(anya, id);
  }
  jam.send(HOST, { type: "started", itemId: "i1" });
  return { jam, anya };
}

describe("the host goes away and comes back", () => {
  it("REC-01 the host's last connection closing sets hostOnline false and starts the host timer", () => {
    const { jam, anya } = evening();
    const effects = jam.apply({ kind: "disconnected", publicId: HOST });
    expect(hasState(effects)).toBe(true);
    expect(isHostOnline(jam.room)).toBe(false);
    expect(jam.room.hostLeftAt).toBe(jam.now);
    expect(reasonOf(jam.send(anya, { type: "search", id: "g1", text: "x" }))).toBe("host-offline");
  });

  it("REC-01 web guests still add from their cached results while the host is away", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    jam.cacheResults(anya, [{ id: "7", title: "t", artists: [], durationMs: 1 }]);
    jam.apply({ kind: "disconnected", publicId: HOST });
    expect(sent(jam.send(anya, { type: "add", id: "g1", trackId: "7" }))).toEqual([
      { type: "ack", id: "g1" },
    ]);
  });

  it("REC-02 resume of a live room with the right secret brings the host back", () => {
    const { jam } = evening();
    jam.apply({ kind: "disconnected", publicId: HOST });
    jam.now += 60_000;
    const effects = resume(jam);
    expect(effects.slice(0, 2)).toEqual([
      { kind: "admit", connection: "c-host-2", publicId: HOST },
      {
        kind: "send",
        connection: "c-host-2",
        message: { type: "resumed", id: "h9", restored: false },
      },
    ]);
    expect(hasState(effects)).toBe(true);
    expect(isHostOnline(jam.room)).toBe(true);
    expect(jam.room.hostLeftAt).toBeNull();
  });

  it("REC-03 the outbox's started events apply in order, and the same outbox again changes nothing", () => {
    const { jam } = evening();
    jam.apply({ kind: "disconnected", publicId: HOST });
    resume(jam, ["i2", "i3", "i1"]);
    expect(jam.room.nowPlaying.itemId).toBe("i3");
    expect(jam.room.recent.map((item) => item.itemId)).toEqual(["i2", "i1"]);
    expect(jam.room.queue).toEqual([]);
    const before = {
      nowPlaying: jam.room.nowPlaying,
      recent: jam.room.recent,
      queue: jam.room.queue,
    };
    jam.apply({ kind: "disconnected", publicId: HOST });
    resume(jam, ["i2", "i3", "i1"]);
    expect({
      nowPlaying: jam.room.nowPlaying,
      recent: jam.room.recent,
      queue: jam.room.queue,
    }).toEqual(before);
  });

  it("REC-05 a room without its host ends as expired once the room-without-host time has passed", () => {
    const { jam } = evening();
    jam.apply({ kind: "disconnected", publicId: HOST });
    jam.now += ROOM_WITHOUT_HOST_MS - 1;
    expect(jam.apply({ kind: "tick" })).toEqual([]);
    jam.now += 1;
    expect(jam.apply({ kind: "tick" })).toEqual([{ kind: "end", reason: "expired" }]);
    expect(jam.ended).toBe(true);
  });

  it("ROOM-53 a room ends as expired at its maximum age, even with its host online", () => {
    const jam = new RoomHarness();
    jam.now += ROOM_MAX_AGE_MS;
    expect(jam.apply({ kind: "tick" })).toEqual([{ kind: "end", reason: "expired" }]);
  });

  it("REC-09 resume with a wrong host secret is bad-secret and changes nothing", () => {
    const { jam } = evening();
    const before = jam.room;
    expect(reasonOf(resume(jam, [], "WrongHostSecretWrongHostSecretWrongHost1234"))).toBe(
      "bad-secret",
    );
    expect(jam.room).toBe(before);
  });
});

describe("snapshots", () => {
  it("LISTEN-06 a snapshot leaves out the listening links, which expire within the hour", () => {
    const { jam } = evening();
    jam.send(HOST, {
      type: "playing",
      source: "item",
      itemId: "i1",
      positionMs: 1_000,
      paused: false,
      listenUrl:
        "https://s963sas.storage.yandex.net/get-mp3/0123456789abcdef0123456789abcdef/00065cd937b03427/rmusic/track.mp3",
      listenNextUrl:
        "https://s963sas.storage.yandex.net/get-mp3/0123456789abcdef0123456789abcdef/00065cd937b03427/rmusic/next.mp3",
    });
    expect(jam.room.nowPlaying.listenNextUrl).toBeDefined();
    const snapshot = toSnapshot(jam.room);
    expect(isSnapshotData(snapshot)).toBe(true);
    expect(snapshot.room.nowPlaying.listenUrl).toBeUndefined();
    expect(snapshot.room.nowPlaying.listenNextUrl).toBeUndefined();
  });

  it("the snapshot passes its schema and holds no secret", () => {
    const { jam } = evening();
    jam.send(HOST, { type: "kick", id: "h1", publicId: jam.room.participants[1]?.publicId ?? "" });
    const snapshot = toSnapshot(jam.room);
    expect(isSnapshotData(snapshot)).toBe(true);
    const text = JSON.stringify(snapshot);
    for (const secret of [HOST_SECRET, JOIN_SECRET, participantId(1)]) {
      expect(text).not.toContain(secret);
    }
    expect(snapshot.room.kicked).toHaveLength(1);
  });

  it("REC-06 a room raised from its snapshot is the same room, with every guest offline and the host back", () => {
    const { jam, anya } = evening();
    const snapshot = toSnapshot(jam.room);
    const later = jam.now + 30 * 60_000;
    const raised = fromSnapshot(snapshot, later);
    const outcome = reduce(
      raised,
      {
        kind: "resume",
        connection: "c-host-2",
        id: "h9",
        hostSecret: HOST_SECRET,
        outbox: [{ itemId: "i2" }],
        restored: true,
      },
      { now: later, publicUrl: PUBLIC_URL },
    );
    const room = outcome.room as RoomState;
    expect(sent(outcome.effects)).toEqual([{ type: "resumed", id: "h9", restored: true }]);
    expect(room.id).toBe(jam.room.id);
    expect(room.version).toBe(snapshot.room.version + 1);
    expect(room.createdAt).toBe(jam.room.createdAt);
    expect(
      room.participants.map((participant) => [participant.publicId, participant.connections]),
    ).toEqual([
      [HOST, 1],
      [anya, 0],
    ]);
    expect(room.nowPlaying.itemId).toBe("i2");
    expect(stateFor(room, anya, later).room.queue.map((item) => item.itemId)).toEqual(["i3"]);

    const back = reduce(
      room,
      {
        kind: "join",
        connection: "c-anya-2",
        id: "g1",
        participantId: participantId(1),
        joinSecret: JOIN_SECRET,
        name: "Аня",
        participantKind: "web",
        newPublicId: "zzzzzz",
      },
      { now: later, publicUrl: PUBLIC_URL },
    );
    expect(sent(back.effects)).toEqual([{ type: "joined", id: "g1", publicId: anya }]);
  });

  it("SEED-10 a raised room keeps seedsVersion when its set of seeds is the same", () => {
    const { jam } = evening();
    const raised = fromSnapshot(toSnapshot(jam.room), jam.now);
    expect(raised.fallback).toEqual(jam.room.fallback);
  });

  it("REC-07 REC-08 a snapshot that is too old or inconsistent cannot raise a room", () => {
    const { jam } = evening();
    const snapshot = toSnapshot(jam.room);
    expect(snapshotProblem(snapshot, jam.now)).toBeNull();
    expect(snapshotProblem(snapshot, jam.room.createdAt + ROOM_MAX_AGE_MS)).toMatch(
      /maximum room age/,
    );
    const broken = [
      { ...snapshot.room, hostPublicId: "zzzzzz" },
      {
        ...snapshot.room,
        participants: [...snapshot.room.participants, snapshot.room.participants[1]],
      },
      { ...snapshot.room, nextItemNumber: 2 },
      { ...snapshot.room, queue: [...snapshot.room.queue, ...snapshot.room.queue] },
    ];
    for (const room of broken) {
      expect(
        snapshotProblem({ format: 1, room: room as typeof snapshot.room }, jam.now),
      ).not.toBeNull();
    }
  });
});
