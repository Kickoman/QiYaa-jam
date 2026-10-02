import { describe, expect, it } from "vitest";
import { isServerMessage } from "../../src/protocol/validate.js";
import { GUESTS_PER_ROOM, QUEUE_LENGTH, SEARCH_CACHE_MS } from "../../src/room/limits.js";
import { stateFor } from "../../src/room/view.js";
import {
  HOST,
  HOST_CONNECTION,
  HOST_SECRET,
  JOIN_SECRET,
  PUBLIC_URL,
  ROOM_ID,
  RoomHarness,
  hasState,
  participantId,
  reasonOf,
  sent,
  toHost,
  track,
} from "../support/room-harness.js";

describe("create", () => {
  it("ROOM-01 creates the room with defaults, the host as its only participant, and version 1", () => {
    const jam = new RoomHarness({ order: "fifo" });
    expect(sent(jam.effects, HOST_CONNECTION)).toEqual([
      {
        type: "created",
        id: "h1",
        roomId: ROOM_ID,
        hostSecret: HOST_SECRET,
        joinSecret: JOIN_SECRET,
        joinUrl: `${PUBLIC_URL}/j/${ROOM_ID}#${JOIN_SECRET}`,
        publicId: HOST,
      },
    ]);
    expect(hasState(jam.effects)).toBe(true);
    const state = stateFor(jam.room, HOST, jam.now);
    expect(state.version).toBe(1);
    expect(state.room.settings).toEqual({
      order: "fifo",
      guestsCanSkip: false,
      joinOpen: true,
      maxPendingPerGuest: 10,
    });
    expect(state.room.participants).toEqual([
      { publicId: HOST, name: "Маша", kind: "host", online: true, pending: 0 },
    ]);
    expect(state.room.nowPlaying.source).toBe("idle");
    expect(state.room.queue).toEqual([]);
    expect(state.room.fallback).toEqual({ seeds: [], seedsVersion: 0 });
  });
});

describe("join", () => {
  it("ROOM-04 admits a new participant with its kind, online and nothing waiting", () => {
    const jam = new RoomHarness();
    const effects = jam.join("Аня", "qiyaa");
    expect(effects[0]).toEqual({ kind: "admit", connection: "c-Аня", publicId: "g00001" });
    expect(sent(effects, "c-Аня")).toEqual([{ type: "joined", id: "g1", publicId: "g00001" }]);
    expect(hasState(effects)).toBe(true);
    expect(stateFor(jam.room, "g00001", jam.now).room.participants[1]).toEqual({
      publicId: "g00001",
      name: "Аня",
      kind: "qiyaa",
      online: true,
      pending: 0,
    });
  });

  it("ROOM-05 the same participantId gets the same publicId and new name, even closed, full or with an old secret", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    jam.add(anya, "100");
    jam.send(HOST, { type: "settings", id: "h2", settings: { joinOpen: false } });
    const effects = jam.join("Анечка", "web", {
      participant: 1,
      secret: "WrongSecretWrongSecret",
      connection: "c-second",
    });
    expect(sent(effects, "c-second")).toEqual([{ type: "joined", id: "g1", publicId: anya }]);
    const participant = jam.room.participants.find((candidate) => candidate.publicId === anya);
    expect(participant).toMatchObject({ name: "Анечка", connections: 2 });
    expect(jam.itemIds()).toEqual(["i1"]);
  });

  it("ROOM-06 a new participant with a wrong secret gets bad-secret", () => {
    const jam = new RoomHarness();
    expect(reasonOf(jam.join("Аня", "web", { secret: "WrongSecretWrongSecret" }))).toBe(
      "bad-secret",
    );
    expect(jam.room.participants).toHaveLength(1);
  });

  it("ROOM-08 a kicked participant gets kicked, with any secret", () => {
    const jam = new RoomHarness();
    const borya = jam.guest("Боря");
    jam.send(HOST, { type: "kick", id: "h3", publicId: borya });
    expect(reasonOf(jam.join("Боря", "web", { participant: 1 }))).toBe("kicked");
  });

  it("ROOM-09 a closed room refuses new participants with join-closed", () => {
    const jam = new RoomHarness({ joinOpen: false });
    expect(reasonOf(jam.join("Аня"))).toBe("join-closed");
  });

  it("ROOM-10 a room with its maximum of guests, offline ones counted, refuses a new one", () => {
    const jam = new RoomHarness();
    for (let guest = 0; guest < GUESTS_PER_ROOM; guest++) {
      const publicId = jam.guest(`guest${guest}`);
      jam.apply({ kind: "disconnected", publicId });
    }
    expect(reasonOf(jam.join("late"))).toBe("room-full");
    const first = jam.room.participants[1]?.publicId ?? "";
    jam.send(HOST, { type: "kick", id: "h4", publicId: first });
    expect(
      jam.join("late", "web", { participant: 99 }).some((effect) => effect.kind === "admit"),
    ).toBe(true);
  });

  it("ROOM-11 a guest whose last connection closes goes offline and keeps its items", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    jam.add(anya, "100");
    const effects = jam.apply({ kind: "disconnected", publicId: anya });
    expect(hasState(effects)).toBe(true);
    expect(stateFor(jam.room, HOST, jam.now).room.participants[1]).toMatchObject({
      online: false,
      pending: 1,
    });
  });
});

describe("the link", () => {
  it("ROOM-12 rotateLink answers the host alone with the new secret and link, and the old secret stops admitting new people", () => {
    const jam = new RoomHarness();
    const effects = jam.send(HOST, { type: "rotateLink", id: "h5" });
    const [reply] = sent(effects, HOST_CONNECTION);
    expect(reply?.type).toBe("linkRotated");
    if (reply?.type !== "linkRotated") {
      return;
    }
    expect(reply.joinUrl).toBe(`${PUBLIC_URL}/j/${ROOM_ID}#${reply.joinSecret}`);
    expect(reply.joinSecret).not.toBe(JOIN_SECRET);
    expect(hasState(effects)).toBe(true);
    expect(reasonOf(jam.join("Аня"))).toBe("bad-secret");
    expect(
      jam
        .join("Боря", "web", { secret: reply.joinSecret })
        .some((effect) => effect.kind === "admit"),
    ).toBe(true);
  });

  it("ROOM-13 a guest who joined before comes back with the old secret after a rotation", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    jam.send(HOST, { type: "rotateLink", id: "h5" });
    expect(sent(jam.join("Аня", "web", { participant: 1 }))).toEqual([
      { type: "joined", id: "g1", publicId: anya },
    ]);
  });
});

describe("add", () => {
  it("ROOM-14 a web guest adds a track from its own results with their metadata; ack before state", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    jam.cacheResults(anya, [track("100", "Группа крови")]);
    jam.now += 5_000;
    const effects = jam.send(anya, { type: "add", id: "g2", trackId: "100" });
    expect(effects.map((effect) => effect.kind)).toEqual(["send", "state"]);
    expect(sent(effects)).toEqual([{ type: "ack", id: "g2" }]);
    expect(jam.room.queue).toEqual([
      {
        itemId: "i1",
        track: track("100", "Группа крови"),
        addedBy: anya,
        addedAt: jam.now,
        pinnedAt: null,
      },
    ]);
  });

  it("ROOM-15 unknown-track for another guest's results, results over 30 min old, and results beyond the latest 200", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    const borya = jam.guest("Боря");
    jam.cacheResults(borya, [track("100")]);
    expect(reasonOf(jam.send(anya, { type: "add", id: "g2", trackId: "100" }))).toBe(
      "unknown-track",
    );

    jam.cacheResults(anya, [track("200")]);
    jam.now += SEARCH_CACHE_MS + 1;
    expect(reasonOf(jam.send(anya, { type: "add", id: "g3", trackId: "200" }))).toBe(
      "unknown-track",
    );

    jam.cacheResults(anya, [track("300")]);
    for (let search = 0; search < 10; search++) {
      jam.cacheResults(
        anya,
        Array.from({ length: 20 }, (_, index) => track(`${1_000 + search * 20 + index}`)),
      );
    }
    expect(reasonOf(jam.send(anya, { type: "add", id: "g4", trackId: "300" }))).toBe(
      "unknown-track",
    );
    expect(reasonOf(jam.send(anya, { type: "add", id: "g5", trackId: "1199" }))).toBeUndefined();
  });

  it("ROOM-16 a QiYaa guest's track is checked by the host and added with the host's metadata", () => {
    const jam = new RoomHarness();
    const borya = jam.guest("Боря", "qiyaa");
    const effects = jam.send(borya, { type: "add", id: "q1", track: track("555", "guest title") });
    const [request] = toHost(effects);
    if (request?.type !== "validateRequest") {
      throw new Error(`no validateRequest: ${JSON.stringify(effects)}`);
    }
    expect(request).toEqual({
      type: "validateRequest",
      requestId: request.requestId,
      trackIds: ["555"],
    });
    expect(effects).toContainEqual({
      kind: "timer",
      requestId: request.requestId,
      at: jam.now + 10_000,
    });
    const answer = jam.send(HOST, {
      type: "validateResult",
      requestId: request.requestId,
      results: [{ trackId: "555", track: track("555", "canonical title") }],
    });
    expect(sent(answer, `c-${borya}`)).toEqual([{ type: "ack", id: "q1" }]);
    expect(jam.room.queue[0]?.track.title).toBe("canonical title");
  });

  it("ROOM-17 track-unavailable and failed from the host become track-unavailable and host-error", () => {
    for (const [reason, expected] of [
      ["track-unavailable", "track-unavailable"],
      ["failed", "host-error"],
    ] as const) {
      const jam = new RoomHarness();
      const borya = jam.guest("Боря", "qiyaa");
      const [request] = toHost(jam.send(borya, { type: "add", id: "q1", track: track("555") }));
      if (request?.type !== "validateRequest") {
        throw new Error("no validateRequest");
      }
      const answer = jam.send(HOST, {
        type: "validateResult",
        requestId: request.requestId,
        results: [{ trackId: "555", reason }],
      });
      expect(reasonOf(answer)).toBe(expected);
      expect(jam.room.queue).toEqual([]);
    }
  });

  it("ROOM-18 a QiYaa guest's add gets host-offline without the host, host-timeout without an answer", () => {
    const offline = new RoomHarness();
    const borya = offline.guest("Боря", "qiyaa");
    offline.apply({ kind: "disconnected", publicId: HOST });
    expect(reasonOf(offline.send(borya, { type: "add", id: "q1", track: track("555") }))).toBe(
      "host-offline",
    );

    const silent = new RoomHarness();
    const anya = silent.guest("Аня", "qiyaa");
    const [request] = toHost(silent.send(anya, { type: "add", id: "q1", track: track("555") }));
    if (request?.type !== "validateRequest") {
      throw new Error("no validateRequest");
    }
    silent.now += 10_000;
    expect(sent(silent.apply({ kind: "timeout", requestId: request.requestId }))).toEqual([
      { type: "rejected", id: "q1", reason: "host-timeout" },
    ]);
    const late = silent.send(HOST, {
      type: "validateResult",
      requestId: request.requestId,
      results: [{ trackId: "555", track: track("555") }],
    });
    expect(late).toEqual([]);
    expect(silent.room.queue).toEqual([]);
  });

  it("ROOM-19 the host's track is added as sent, without a per-person limit", () => {
    const jam = new RoomHarness({ maxPendingPerGuest: 1 });
    for (let number = 0; number < 5; number++) {
      jam.add(HOST, `${100 + number}`);
    }
    expect(jam.itemIds()).toEqual(["i1", "i2", "i3", "i4", "i5"]);
    expect(jam.room.queue[0]?.track).toEqual(track("100"));
  });

  it("ROOM-20 a waiting track cannot be added again, by anyone; once current it can", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    jam.add(anya, "100");
    expect(reasonOf(jam.add(anya, "100"))).toBe("duplicate");
    expect(reasonOf(jam.add(HOST, "100"))).toBe("duplicate");
    jam.send(HOST, { type: "started", itemId: "i1" });
    expect(reasonOf(jam.add(HOST, "100"))).toBeUndefined();
  });

  it("ROOM-21 a guest with maxPendingPerGuest waiting items gets queue-limit", () => {
    const jam = new RoomHarness({ maxPendingPerGuest: 2 });
    const anya = jam.guest("Аня");
    jam.add(anya, "1");
    jam.add(anya, "2");
    expect(reasonOf(jam.add(anya, "3"))).toBe("queue-limit");
  });

  it("ROOM-22 a full queue refuses anyone, the host included", () => {
    const jam = new RoomHarness();
    for (let number = 0; number < QUEUE_LENGTH; number++) {
      jam.add(HOST, `${number + 1}`);
    }
    expect(reasonOf(jam.add(HOST, "99999"))).toBe("queue-limit");
    expect(jam.room.queue).toHaveLength(QUEUE_LENGTH);
  });
});

describe("search", () => {
  it("ROOM-24 a web guest's search goes to the host normalized, and the results come back to that guest", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    const effects = jam.send(anya, { type: "search", id: "g7", text: "  кино   группа\tкрови " });
    const [request] = toHost(effects);
    if (request?.type !== "searchRequest") {
      throw new Error(`no searchRequest: ${JSON.stringify(effects)}`);
    }
    expect(request).toEqual({
      type: "searchRequest",
      requestId: request.requestId,
      text: "кино группа крови",
    });
    const answer = jam.send(HOST, {
      type: "searchResult",
      requestId: request.requestId,
      tracks: [track("100")],
    });
    expect(sent(answer, `c-${anya}`)).toEqual([
      { type: "searchResults", id: "g7", tracks: [track("100")] },
    ]);
    expect(hasState(answer)).toBe(false);
  });

  it("ROOM-25 host-offline, host-timeout, host-error, and a late or unknown answer is dropped", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    const [first] = toHost(jam.send(anya, { type: "search", id: "g1", text: "a" }));
    const [second] = toHost(jam.send(anya, { type: "search", id: "g2", text: "b" }));
    if (first?.type !== "searchRequest" || second?.type !== "searchRequest") {
      throw new Error("no searchRequest");
    }
    expect(
      reasonOf(
        jam.send(HOST, { type: "searchResult", requestId: first.requestId, error: "failed" }),
      ),
    ).toBe("host-error");
    expect(reasonOf(jam.apply({ kind: "timeout", requestId: second.requestId }))).toBe(
      "host-timeout",
    );
    expect(
      jam.send(HOST, { type: "searchResult", requestId: second.requestId, tracks: [] }),
    ).toEqual([]);
    expect(jam.send(HOST, { type: "searchResult", requestId: "nobody", tracks: [] })).toEqual([]);

    const [pending] = toHost(jam.send(anya, { type: "search", id: "g3", text: "c" }));
    expect(pending?.type).toBe("searchRequest");
    expect(sent(jam.apply({ kind: "disconnected", publicId: HOST }), `c-${anya}`)).toEqual([
      { type: "rejected", id: "g3", reason: "host-offline" },
    ]);
    expect(reasonOf(jam.send(anya, { type: "search", id: "g4", text: "d" }))).toBe("host-offline");
  });

  it("ROOM-27 a QiYaa guest may not search through the host", () => {
    const jam = new RoomHarness();
    const borya = jam.guest("Боря", "qiyaa");
    expect(reasonOf(jam.send(borya, { type: "search", id: "q2", text: "x" }))).toBe("not-allowed");
  });
});

describe("remove, pin, kick", () => {
  it("ROOM-28 a guest removes its own waiting item, pinned or not", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    jam.add(anya, "1");
    jam.add(anya, "2");
    jam.send(HOST, { type: "pin", id: "h1", itemId: "i2" });
    expect(sent(jam.send(anya, { type: "remove", id: "g1", itemId: "i2" }))).toEqual([
      { type: "ack", id: "g1" },
    ]);
    expect(hasState(jam.effects)).toBe(true);
    expect(jam.itemIds()).toEqual(["i1"]);
  });

  it("ROOM-29 a guest may not remove someone else's item", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    const borya = jam.guest("Боря");
    jam.add(anya, "1");
    expect(reasonOf(jam.send(borya, { type: "remove", id: "g1", itemId: "i1" }))).toBe(
      "not-allowed",
    );
  });

  it("ROOM-30 removing an item that is current, recent or unknown is stale", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "1");
    jam.add(HOST, "2");
    jam.send(HOST, { type: "started", itemId: "i1" });
    jam.send(HOST, { type: "started", itemId: "i2" });
    for (const itemId of ["i1", "i2", "i9"]) {
      expect(reasonOf(jam.send(HOST, { type: "remove", id: "h1", itemId }))).toBe("stale");
    }
  });

  it("ROOM-31 the host removes anyone's item", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    jam.add(anya, "1");
    expect(sent(jam.send(HOST, { type: "remove", id: "h1", itemId: "i1" }))).toEqual([
      { type: "ack", id: "h1" },
    ]);
    expect(jam.itemIds()).toEqual([]);
  });

  it("ROOM-32 a pinned item goes ahead of the unpinned ones, behind those pinned earlier", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    for (const id of ["1", "2", "3", "4"]) {
      jam.add(anya, id);
    }
    jam.send(HOST, { type: "pin", id: "h1", itemId: "i3" });
    jam.now += 1;
    jam.send(HOST, { type: "pin", id: "h2", itemId: "i4" });
    const queue = stateFor(jam.room, HOST, jam.now).room.queue;
    expect(queue.map((item) => [item.itemId, item.pinned])).toEqual([
      ["i3", true],
      ["i4", true],
      ["i1", false],
      ["i2", false],
    ]);
  });

  it("ROOM-33 pinning a pinned item again changes nothing", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "1");
    jam.send(HOST, { type: "pin", id: "h1", itemId: "i1" });
    const before = jam.room;
    jam.now += 5;
    const effects = jam.send(HOST, { type: "pin", id: "h2", itemId: "i1" });
    expect(effects).toEqual([
      { kind: "send", connection: HOST_CONNECTION, message: { type: "ack", id: "h2" } },
    ]);
    expect(jam.room).toBe(before);
  });

  it("ROOM-34 pinning an item that is not waiting is stale", () => {
    const jam = new RoomHarness();
    expect(reasonOf(jam.send(HOST, { type: "pin", id: "h1", itemId: "i7" }))).toBe("stale");
  });

  it("ROOM-35 a kicked guest is dropped and forgotten, its waiting items go, its current item stays", () => {
    const jam = new RoomHarness();
    const borya = jam.guest("Боря");
    jam.add(borya, "1");
    jam.add(borya, "2");
    jam.send(HOST, { type: "started", itemId: "i1" });
    const effects = jam.send(HOST, { type: "kick", id: "h1", publicId: borya });
    expect(effects).toContainEqual({ kind: "drop", publicId: borya });
    expect(sent(effects, HOST_CONNECTION)).toEqual([{ type: "ack", id: "h1" }]);
    expect(jam.room.participants.map((participant) => participant.publicId)).toEqual([HOST]);
    expect(jam.itemIds()).toEqual([]);
    expect(jam.room.nowPlaying).toMatchObject({ itemId: "i1", addedBy: borya });
    expect(jam.room.kicked).toHaveLength(1);
  });

  it("ROOM-36 kicking the host is not-allowed, kicking a stranger is stale", () => {
    const jam = new RoomHarness();
    expect(reasonOf(jam.send(HOST, { type: "kick", id: "h1", publicId: HOST }))).toBe(
      "not-allowed",
    );
    expect(reasonOf(jam.send(HOST, { type: "kick", id: "h2", publicId: "zzzzzz" }))).toBe("stale");
  });
});

describe("what plays", () => {
  it("ROOM-37 started makes a waiting item current, sets its adder's lastServedAt, and moves the old one to recent", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    jam.add(anya, "1");
    jam.add(HOST, "2");
    jam.send(HOST, { type: "started", itemId: "i1" });
    jam.now += 60_000;
    const effects = jam.send(HOST, { type: "started", itemId: "i2" });
    expect(hasState(effects)).toBe(true);
    expect(jam.room.nowPlaying).toEqual({
      source: "item",
      itemId: "i2",
      track: track("2"),
      addedBy: HOST,
      positionMs: 0,
      paused: false,
      reportedAt: jam.now,
    });
    expect(jam.room.recent).toEqual([
      { itemId: "i1", track: track("1"), addedBy: anya, playedAt: jam.now },
    ]);
    expect(jam.room.participants.map((participant) => participant.lastServedAt)).toEqual([
      jam.now,
      jam.now - 60_000,
    ]);
  });

  it("ROOM-38 started for an item that is not waiting changes nothing and sends no state", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "1");
    jam.send(HOST, { type: "started", itemId: "i1" });
    const before = jam.room;
    expect(jam.send(HOST, { type: "started", itemId: "i1" })).toEqual([]);
    expect(jam.send(HOST, { type: "started", itemId: "i9" })).toEqual([]);
    expect(jam.room).toBe(before);
  });

  it("ROOM-39 playing for the current item updates position, pause and reportedAt", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "1");
    jam.send(HOST, { type: "started", itemId: "i1" });
    jam.now += 10_000;
    const effects = jam.send(HOST, {
      type: "playing",
      source: "item",
      itemId: "i1",
      positionMs: 9_500,
      paused: true,
    });
    expect(hasState(effects)).toBe(true);
    expect(jam.room.nowPlaying).toMatchObject({
      itemId: "i1",
      positionMs: 9_500,
      paused: true,
      reportedAt: jam.now,
    });
  });

  it("ROOM-40 playing for a waiting item starts it first", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "1");
    jam.send(HOST, {
      type: "playing",
      source: "item",
      itemId: "i1",
      positionMs: 1_000,
      paused: false,
    });
    expect(jam.itemIds()).toEqual([]);
    expect(jam.room.nowPlaying).toMatchObject({ source: "item", itemId: "i1", positionMs: 1_000 });
  });

  it("ROOM-41 playing for an item that is neither current nor waiting is ignored", () => {
    const jam = new RoomHarness();
    const before = jam.room;
    expect(
      jam.send(HOST, {
        type: "playing",
        source: "item",
        itemId: "i4",
        positionMs: 0,
        paused: false,
      }),
    ).toEqual([]);
    expect(jam.room).toBe(before);
  });

  it("ROOM-42 a wave track or idle replaces the current item, which goes to recent, without touching lastServedAt", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "1");
    jam.send(HOST, { type: "started", itemId: "i1" });
    const served = jam.room.participants[0]?.lastServedAt;
    jam.now += 1_000;
    jam.send(HOST, {
      type: "playing",
      source: "wave",
      track: track("777"),
      positionMs: 0,
      paused: false,
    });
    expect(jam.room.nowPlaying).toEqual({
      source: "wave",
      track: track("777"),
      positionMs: 0,
      paused: false,
      reportedAt: jam.now,
    });
    expect(jam.room.recent.map((item) => item.itemId)).toEqual(["i1"]);
    jam.send(HOST, { type: "playing", source: "idle", positionMs: 0, paused: true });
    expect(jam.room.nowPlaying.source).toBe("idle");
    expect(jam.room.recent).toHaveLength(1);
    expect(jam.room.participants[0]?.lastServedAt).toBe(served);
  });
});

describe("listening along", () => {
  const link = (name: string) =>
    `https://s963sas.storage.yandex.net/get-mp3/0123456789abcdef0123456789abcdef/00065cd937b03427/rmusic/${name}.mp3`;

  it("LISTEN-06 the host's links go into nowPlaying until a playing without them", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "1");
    jam.send(HOST, { type: "started", itemId: "i1" });
    const report = { type: "playing", source: "item", itemId: "i1", paused: false } as const;
    jam.send(HOST, {
      ...report,
      positionMs: 0,
      listenUrl: link("one"),
      listenNextUrl: link("two"),
    });
    expect(jam.room.nowPlaying).toMatchObject({
      listenUrl: link("one"),
      listenNextUrl: link("two"),
    });
    jam.send(HOST, { ...report, positionMs: 10_000, listenUrl: link("one") });
    expect(jam.room.nowPlaying.listenUrl).toBe(link("one"));
    expect(jam.room.nowPlaying.listenNextUrl).toBeUndefined();
    jam.send(HOST, { ...report, positionMs: 20_000 });
    expect(jam.room.nowPlaying).toMatchObject({ itemId: "i1", positionMs: 20_000 });
    expect(jam.room.nowPlaying.listenUrl).toBeUndefined();
  });

  it("LISTEN-06 a wave track carries its own links, and idle none", () => {
    const jam = new RoomHarness();
    jam.send(HOST, {
      type: "playing",
      source: "wave",
      track: track("777"),
      positionMs: 0,
      paused: false,
      listenUrl: link("wave"),
      listenNextUrl: link("after"),
    });
    expect(jam.room.nowPlaying).toMatchObject({
      listenUrl: link("wave"),
      listenNextUrl: link("after"),
    });
    jam.send(HOST, {
      type: "playing",
      source: "idle",
      positionMs: 0,
      paused: true,
      listenUrl: link("idle"),
      listenNextUrl: link("idle-next"),
    });
    expect(jam.room.nowPlaying.listenUrl).toBeUndefined();
    expect(jam.room.nowPlaying.listenNextUrl).toBeUndefined();
  });

  it("LISTEN-06 the next item starts without the previous item's links", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "1");
    jam.add(HOST, "2");
    jam.send(HOST, { type: "started", itemId: "i1" });
    jam.send(HOST, {
      type: "playing",
      source: "item",
      itemId: "i1",
      positionMs: 0,
      paused: false,
      listenUrl: link("one"),
      listenNextUrl: link("two"),
    });
    jam.send(HOST, { type: "started", itemId: "i2" });
    expect(jam.room.nowPlaying).toMatchObject({ itemId: "i2" });
    expect(jam.room.nowPlaying.listenUrl).toBeUndefined();
    expect(jam.room.nowPlaying.listenNextUrl).toBeUndefined();
  });
});

describe("skip", () => {
  function playing(settings = { guestsCanSkip: true }): { jam: RoomHarness; anya: string } {
    const jam = new RoomHarness(settings);
    const anya = jam.guest("Аня");
    jam.add(anya, "1");
    jam.send(HOST, { type: "started", itemId: "i1" });
    return { jam, anya };
  }

  it("ROOM-43 a guest's skip of the current item goes to the host as a command", () => {
    const { jam, anya } = playing();
    const effects = jam.send(anya, { type: "skip", id: "g1", itemId: "i1" });
    expect(toHost(effects)).toEqual([{ type: "command", kind: "skip", itemId: "i1" }]);
    expect(sent(effects)).toEqual([{ type: "ack", id: "g1" }]);
    expect(hasState(effects)).toBe(false);
  });

  it("ROOM-44 skipping is not-allowed when the host does not allow it", () => {
    const { jam, anya } = playing({ guestsCanSkip: false });
    expect(reasonOf(jam.send(anya, { type: "skip", id: "g1", itemId: "i1" }))).toBe("not-allowed");
  });

  it("ROOM-45 skipping an item that is not current, or a wave track, is stale", () => {
    const { jam, anya } = playing();
    expect(reasonOf(jam.send(anya, { type: "skip", id: "g1", itemId: "i2" }))).toBe("stale");
    jam.send(HOST, {
      type: "playing",
      source: "wave",
      track: track("9"),
      positionMs: 0,
      paused: false,
    });
    expect(reasonOf(jam.send(anya, { type: "skip", id: "g2", itemId: "i1" }))).toBe("stale");
  });

  it("ROOM-46 skipping while the host is offline gets host-offline", () => {
    const { jam, anya } = playing();
    jam.apply({ kind: "disconnected", publicId: HOST });
    expect(reasonOf(jam.send(anya, { type: "skip", id: "g1", itemId: "i1" }))).toBe("host-offline");
  });
});

describe("settings", () => {
  it("ROOM-47 changing the order reorders the waiting items at once; pinned and current stay", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    const borya = jam.guest("Боря");
    jam.add(anya, "1");
    jam.add(anya, "2");
    jam.add(borya, "3");
    jam.add(anya, "4");
    jam.send(HOST, { type: "started", itemId: "i1" });
    jam.send(HOST, { type: "pin", id: "h1", itemId: "i4" });
    const order = (): string[] =>
      stateFor(jam.room, HOST, jam.now).room.queue.map((item) => item.itemId);
    expect(order()).toEqual(["i4", "i3", "i2"]);
    const effects = jam.send(HOST, { type: "settings", id: "h2", settings: { order: "fifo" } });
    expect(sent(effects)).toEqual([{ type: "ack", id: "h2" }]);
    expect(hasState(effects)).toBe(true);
    expect(order()).toEqual(["i4", "i2", "i3"]);
    expect(jam.room.nowPlaying.itemId).toBe("i1");
  });

  it("ROOM-48 lowering maxPendingPerGuest keeps the items and refuses adds until below the new limit", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    for (const id of ["1", "2", "3"]) {
      jam.add(anya, id);
    }
    jam.send(HOST, { type: "settings", id: "h1", settings: { maxPendingPerGuest: 2 } });
    expect(jam.room.queue).toHaveLength(3);
    expect(reasonOf(jam.add(anya, "4"))).toBe("queue-limit");
    jam.send(anya, { type: "remove", id: "g1", itemId: "i1" });
    expect(reasonOf(jam.add(anya, "4"))).toBe("queue-limit");
    jam.send(anya, { type: "remove", id: "g2", itemId: "i2" });
    expect(reasonOf(jam.add(anya, "4"))).toBeUndefined();
  });

  it("ROOM-49 joinOpen and guestsCanSkip apply to the next join and skip; the same values change nothing", () => {
    const jam = new RoomHarness();
    const effects = jam.send(HOST, { type: "settings", id: "h1", settings: { joinOpen: false } });
    expect(hasState(effects)).toBe(true);
    expect(reasonOf(jam.join("Аня"))).toBe("join-closed");
    const same = jam.send(HOST, { type: "settings", id: "h2", settings: { joinOpen: false } });
    expect(same).toEqual([
      { kind: "send", connection: HOST_CONNECTION, message: { type: "ack", id: "h2" } },
    ]);
  });
});

describe("state", () => {
  it("ROOM-50 every change adds 1 to version and each participant gets its own you", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    expect(jam.room.version).toBe(2);
    jam.add(anya, "1");
    expect(jam.room.version).toBe(3);
    expect(stateFor(jam.room, anya, jam.now).room.you).toEqual({ publicId: anya, isHost: false });
    expect(stateFor(jam.room, HOST, jam.now).room.you).toEqual({ publicId: HOST, isHost: true });
  });

  it("ROOM-51 a refusal, or a report that changes nothing, sends no state and keeps version", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    const version = jam.room.version;
    expect(hasState(jam.send(anya, { type: "pin", id: "g1", itemId: "i1" }))).toBe(false);
    expect(hasState(jam.send(HOST, { type: "started", itemId: "i1" }))).toBe(false);
    expect(jam.room.version).toBe(version);
  });

  it("no state, for any participant, carries a secret, and every state passes the protocol schema", () => {
    const jam = new RoomHarness({ guestsCanSkip: true });
    const anya = jam.guest("Аня");
    const borya = jam.guest("Боря", "qiyaa");
    jam.add(anya, "1");
    jam.add(HOST, "2");
    jam.send(HOST, { type: "started", itemId: "i1" });
    jam.send(HOST, { type: "rotateLink", id: "h9" });
    const secrets = [HOST_SECRET, JOIN_SECRET, participantId(1), participantId(2)];
    for (const publicId of [HOST, anya, borya]) {
      const state = stateFor(jam.room, publicId, jam.now);
      expect(isServerMessage(state)).toBe(true);
      const text = JSON.stringify(state);
      for (const secret of secrets) {
        expect(text).not.toContain(secret);
      }
      for (const field of ["hostKey", "hostSecret", "joinSecret", "participantId", "idHash"]) {
        expect(text).not.toContain(`"${field}"`);
      }
    }
  });
});

describe("the end", () => {
  it("ROOM-52 end acknowledges the host, then ends the room for everyone", () => {
    const jam = new RoomHarness();
    const effects = jam.send(HOST, { type: "end", id: "h1" });
    expect(effects).toEqual([
      { kind: "send", connection: HOST_CONNECTION, message: { type: "ack", id: "h1" } },
      { kind: "end", reason: "host-ended" },
    ]);
    expect(jam.ended).toBe(true);
  });
});

describe("privacy and rights", () => {
  it("ROOM-64 the room keeps no secret itself, only hashes", () => {
    const jam = new RoomHarness();
    jam.guest("Аня");
    const text = JSON.stringify(jam.room, (_, value: unknown) =>
      value instanceof Map ? [...value] : value,
    );
    for (const secret of [HOST_SECRET, JOIN_SECRET, participantId(1)]) {
      expect(text).not.toContain(secret);
    }
    expect(jam.room.hostSecretHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ROOM-65 guests may not send host messages, and the host may not send guest ones", () => {
    const jam = new RoomHarness();
    const anya = jam.guest("Аня");
    jam.add(HOST, "1");
    const guestTries = [
      { type: "pin", id: "g1", itemId: "i1" },
      { type: "kick", id: "g2", publicId: HOST },
      { type: "settings", id: "g3", settings: { order: "fifo" } },
      { type: "rotateLink", id: "g4" },
      { type: "end", id: "g5" },
      { type: "add", id: "g6", track: track("5") },
    ] as const;
    for (const message of guestTries) {
      expect(sent(jam.send(anya, message))).toEqual([
        { type: "rejected", id: message.id, reason: "not-allowed" },
      ]);
    }
    for (const message of [
      { type: "started", itemId: "i1" },
      { type: "playing", source: "idle", positionMs: 0, paused: true },
    ] as const) {
      expect(sent(jam.send(anya, message))).toEqual([{ type: "rejected", reason: "not-allowed" }]);
    }
    expect(reasonOf(jam.send(HOST, { type: "search", id: "h1", text: "x" }))).toBe("not-allowed");
    expect(reasonOf(jam.send(HOST, { type: "skip", id: "h2", itemId: "i1" }))).toBe("not-allowed");
    expect(reasonOf(jam.send(HOST, { type: "add", id: "h3", trackId: "5" }))).toBe("not-allowed");
    expect(jam.itemIds()).toEqual(["i1"]);
  });
});
