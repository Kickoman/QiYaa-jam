import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Room, Track } from "../../server/src/protocol/generated/types.js";
import { addButton } from "../src/add-state.js";
import { reasonText, text } from "../src/i18n.js";
import { cleanSearch, JamSession, type AddState } from "../src/session.js";
import { fakeEnvironment, memoryStorage } from "./support/fake-environment.js";

function track(id: string): Track {
  return { id, title: `t${id}`, artists: ["a"], durationMs: 1 };
}

function room(
  queue: readonly { itemId: string; trackId: string; addedBy: string }[],
  limit = 10,
): Room {
  return {
    id: "7k3m9q2x",
    hostName: "Маша",
    hostOnline: true,
    settings: {
      order: "round-robin",
      guestsCanSkip: false,
      joinOpen: true,
      maxPendingPerGuest: limit,
    },
    you: { publicId: "anna01", isHost: false },
    participants: [],
    nowPlaying: { source: "idle", positionMs: 0, paused: true, reportedAt: 0 },
    queue: queue.map((item) => ({
      itemId: item.itemId,
      track: track(item.trackId),
      addedBy: item.addedBy,
      addedAt: 0,
      pinned: false,
    })),
    recent: [],
    fallback: { seeds: [], seedsVersion: 0 },
  };
}

const names = new Map([["borya1", "Боря"]]);
const none = new Map<string, AddState>();

describe("the add button", () => {
  it("offers + for a track that is not waiting", () => {
    expect(addButton(track("1"), room([]), none, names)).toEqual({ kind: "add" });
  });

  it("says whose it is when the track is already waiting", () => {
    const queue = [
      { itemId: "i1", trackId: "1", addedBy: "anna01" },
      { itemId: "i2", trackId: "2", addedBy: "borya1" },
    ];
    expect(addButton(track("1"), room(queue), none, names)).toEqual({ kind: "yours" });
    expect(addButton(track("2"), room(queue), none, names)).toEqual({
      kind: "queued-by",
      name: "Боря",
    });
  });

  it("shows sending, then the limit, then a failure the guest can retry", () => {
    expect(addButton(track("1"), room([]), new Map([["1", "sending" as const]]), names)).toEqual({
      kind: "sending",
    });
    const full = [{ itemId: "i1", trackId: "9", addedBy: "anna01" }];
    expect(addButton(track("1"), room(full, 1), none, names)).toEqual({ kind: "limit" });
    expect(
      addButton(track("1"), room([]), new Map([["1", "host-timeout" as const]]), names),
    ).toEqual({
      kind: "failed",
      reason: "host-timeout",
    });
  });
});

describe("search and add in the session", () => {
  function joined() {
    const fake = fakeEnvironment();
    const session = new JamSession({
      link: { roomId: "7k3m9q2x", joinSecret: "JoinSecretJoinSecret12" },
      url: "wss://jam.example.org/ws",
      appVersion: "test",
      storage: memoryStorage(),
      environment: fake.environment,
      newParticipantId: () => "3f6c1a2e-8b4d-4c7a-9e21-5d0b7f3a1c64",
    });
    session.join("Аня");
    fake.last().open();
    fake.last().receive({ type: "welcome", protocol: 1, serverTime: 0 });
    fake.last().receive({ type: "joined", id: "join", publicId: "anna01" });
    return { session, fake };
  }

  it("searches only when asked, and shows the results of the latest search only", () => {
    const { session, fake } = joined();
    expect(session.find("   ")).toBe(false);
    expect(session.find(" кино  группа ")).toBe(true);
    expect(fake.last().messages().at(-1)).toEqual({
      type: "search",
      id: "w1",
      text: "кино группа",
    });
    expect(session.view().search).toEqual({ kind: "searching", text: "кино группа" });
    session.find("queen");
    fake.last().receive({ type: "searchResults", id: "w1", tracks: [track("1")] });
    expect(session.view().search.kind).toBe("searching");
    fake.last().receive({ type: "searchResults", id: "w2", tracks: [track("2")] });
    expect(session.view().search).toEqual({ kind: "results", text: "queen", tracks: [track("2")] });
    session.closeSearch();
    expect(session.view().search).toEqual({ kind: "idle" });
  });

  it("a refused search shows its reason", () => {
    const { session, fake } = joined();
    session.find("x");
    fake.last().receive({ type: "rejected", id: "w1", reason: "host-offline" });
    expect(session.view().search).toEqual({ kind: "failed", text: "x", reason: "host-offline" });
  });

  it("tracks each add from sending to added or its refusal", () => {
    const { session, fake } = joined();
    session.add("5");
    session.add("6");
    expect(session.view().adds.get("5")).toBe("sending");
    fake.last().receive({ type: "ack", id: "w1" });
    fake.last().receive({ type: "rejected", id: "w2", reason: "unknown-track" });
    expect(session.view().adds.get("5")).toBe("added");
    expect(session.view().adds.get("6")).toBe("unknown-track");
    expect(session.view().notice).toEqual({ reason: "unknown-track", serial: 1 });
  });

  it("cleans the search text like the server and keeps it within 100 characters", () => {
    expect(cleanSearch("  a   b ")).toBe("a b");
    expect(cleanSearch("x".repeat(101))).toBeNull();
  });
});

describe("texts", () => {
  it("every reason of the protocol has its own text in Russian and English", () => {
    const defs = JSON.parse(
      readFileSync(
        new URL("../../spec/jam/protocol/schemas/defs.schema.json", import.meta.url),
        "utf8",
      ),
    ) as { $defs: { reason: { enum: string[] } } };
    const reasons = defs.$defs.reason.enum;
    expect(reasons.length).toBeGreaterThanOrEqual(18);
    for (const language of ["ru", "en"] as const) {
      const fallback = text(language, "reason.other");
      for (const reason of reasons) {
        expect(reasonText(language, reason), `${language} ${reason}`).not.toBe(fallback);
      }
    }
  });
});
