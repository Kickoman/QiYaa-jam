import { describe, expect, it } from "vitest";
import { newTally, roomChanges, roomSummary, type Tally } from "../../src/net/room-log.js";
import type { RoomState } from "../../src/room/types.js";
import { HOST, RoomHarness, track } from "../support/room-harness.js";

const LINK =
  "https://s963sas.storage.yandex.net/get-mp3/0123456789abcdef0123456789abcdef/00065cd937b03427/rmusic/one.mp3";

/** Applies one step to the harness and returns the log events it makes. */
function step(jam: RoomHarness, tally: Tally, act: () => void): { event: string }[] {
  const before: RoomState = jam.room;
  act();
  return roomChanges(before, jam.room, tally, jam.now).map((change) => ({
    event: change.event,
    ...change.fields,
  }));
}

describe("room events for the logs", () => {
  it("a host's own track, the jam vibe and shared audio, each counted once", () => {
    const jam = new RoomHarness();
    const tally = newTally(jam.now, false);
    expect(step(jam, tally, () => jam.add(HOST, "1"))).toEqual([
      { event: "track_added", by: "host", queue: 1 },
    ]);
    expect(step(jam, tally, () => jam.send(HOST, { type: "started", itemId: "i1" }))).toEqual([
      { event: "track_started", source: "item", by: "host", listen: false },
    ]);
    const playing = { type: "playing", source: "item", itemId: "i1", paused: false } as const;
    expect(
      step(jam, tally, () => jam.send(HOST, { ...playing, positionMs: 0, listenUrl: LINK })),
    ).toEqual([{ event: "listen_shared" }]);
    expect(
      step(jam, tally, () => jam.send(HOST, { ...playing, positionMs: 5_000, listenUrl: LINK })),
    ).toEqual([]);
    expect(
      step(jam, tally, () =>
        jam.send(HOST, {
          type: "playing",
          source: "wave",
          track: track("777"),
          positionMs: 0,
          paused: false,
        }),
      ),
    ).toEqual([{ event: "track_started", source: "vibe", listen: false }]);
    expect(tally).toMatchObject({ hostTracks: 1, playedItems: 1, playedVibe: 1, shared: true });
  });

  it("guests joining and kicked, the host away and back, and new settings", () => {
    const jam = new RoomHarness();
    const tally = newTally(jam.now, false);
    let anya = "";
    expect(
      step(jam, tally, () => {
        anya = jam.guest("Аня", "qiyaa");
      }),
    ).toEqual([{ event: "guest_joined", kind: "qiyaa", guests: 1 }]);
    expect(
      step(jam, tally, () => jam.send(HOST, { type: "kick", id: "h2", publicId: anya })),
    ).toEqual([{ event: "guest_kicked", guests: 0 }]);
    expect(
      step(jam, tally, () => jam.apply({ kind: "disconnected", publicId: HOST })),
    ).toContainEqual({ event: "host_left" });
    jam.now += 90_000;
    expect(
      step(jam, tally, () =>
        jam.apply({
          kind: "resume",
          connection: "c-host-2",
          id: "h3",
          hostSecret: "HostSecretHostSecretHostSecretHostSecret123",
          outbox: [],
          restored: false,
        }),
      ),
    ).toContainEqual({ event: "host_back", away_s: 90 });
    expect(
      step(jam, tally, () =>
        jam.send(HOST, { type: "settings", id: "h4", settings: { order: "fifo" } }),
      ),
    ).toEqual([
      {
        event: "settings_changed",
        order: "fifo",
        guests_can_skip: false,
        join_open: true,
        max_pending: 10,
      },
    ]);
    expect(roomSummary(tally, "expired", jam.now + 30 * 60_000)).toMatchObject({
      reason: "expired",
      minutes: 32,
      guests: 1,
      kicked: 1,
      listen_shared: false,
    });
  });
});
