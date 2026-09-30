import { describe, expect, it } from "vitest";
import { nextFallback, pickSeeds } from "../../src/room/seeds.js";
import { HOST, RoomHarness, track } from "../support/room-harness.js";

function seeds(jam: RoomHarness): readonly string[] {
  return jam.room.fallback.seeds;
}

describe("wave seeds", () => {
  it("SEED-01 a new room has no seeds and seedsVersion 0", () => {
    expect(new RoomHarness().room.fallback).toEqual({ seeds: [], seedsVersion: 0 });
  });

  it("SEED-02 the first item makes the first seed and seedsVersion 1", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "100");
    expect(jam.room.fallback).toEqual({ seeds: ["track:100"], seedsVersion: 1 });
  });

  it("SEED-03 the tracks of the five highest item numbers, waiting, current or recent", () => {
    const jam = new RoomHarness();
    for (const id of ["1", "2", "3", "4", "5", "6", "7"]) {
      jam.add(HOST, id);
    }
    jam.send(HOST, { type: "started", itemId: "i1" });
    jam.send(HOST, { type: "started", itemId: "i2" });
    jam.send(HOST, { type: "started", itemId: "i5" });
    expect(seeds(jam)).toEqual(["track:7", "track:6", "track:5", "track:4", "track:3"]);
  });

  it("SEED-04 a track seen again is skipped and the next distinct one fills its place", () => {
    expect(
      pickSeeds([
        { itemId: "i5", trackId: "B" },
        { itemId: "i4", trackId: "A" },
        { itemId: "i3", trackId: "B" },
        { itemId: "i2", trackId: "C" },
      ]),
    ).toEqual(["track:B", "track:A", "track:C"]);
  });

  it("SEED-05 an item that starts or becomes recent keeps the set and seedsVersion", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "1");
    jam.add(HOST, "2");
    const version = jam.room.fallback.seedsVersion;
    jam.send(HOST, { type: "started", itemId: "i1" });
    jam.send(HOST, { type: "started", itemId: "i2" });
    jam.send(HOST, {
      type: "playing",
      source: "wave",
      track: track("9"),
      positionMs: 0,
      paused: false,
    });
    expect(jam.room.fallback).toEqual({ seeds: ["track:2", "track:1"], seedsVersion: version });
  });

  it("SEED-06 a removed item stops being a seed and seedsVersion grows", () => {
    const jam = new RoomHarness();
    for (const id of ["1", "2", "3", "4", "5", "6"]) {
      jam.add(HOST, id);
    }
    const version = jam.room.fallback.seedsVersion;
    jam.send(HOST, { type: "remove", id: "h1", itemId: "i6" });
    expect(jam.room.fallback).toEqual({
      seeds: ["track:5", "track:4", "track:3", "track:2", "track:1"],
      seedsVersion: version + 1,
    });
  });

  it("SEED-07 a new track comes first, the oldest drops out, and seedsVersion grows", () => {
    const jam = new RoomHarness();
    for (const id of ["1", "2", "3", "4", "5"]) {
      jam.add(HOST, id);
    }
    const version = jam.room.fallback.seedsVersion;
    jam.add(HOST, "6");
    expect(jam.room.fallback).toEqual({
      seeds: ["track:6", "track:5", "track:4", "track:3", "track:2"],
      seedsVersion: version + 1,
    });
  });

  it("SEED-08 a new item with a track that is already a seed keeps seedsVersion", () => {
    const before = { seeds: ["track:B", "track:A"], seedsVersion: 3 };
    expect(
      nextFallback(before, [
        { itemId: "i3", trackId: "A" },
        { itemId: "i2", trackId: "B" },
        { itemId: "i1", trackId: "A" },
      ]),
    ).toEqual({ seeds: ["track:A", "track:B"], seedsVersion: 3 });
  });

  it("SEED-09 a wave track is never a seed", () => {
    const jam = new RoomHarness();
    jam.add(HOST, "1");
    jam.send(HOST, { type: "started", itemId: "i1" });
    const fallback = jam.room.fallback;
    jam.send(HOST, {
      type: "playing",
      source: "wave",
      track: track("777"),
      positionMs: 0,
      paused: false,
    });
    expect(jam.room.fallback).toEqual(fallback);
  });
});
