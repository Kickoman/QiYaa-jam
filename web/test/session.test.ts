import { describe, expect, it } from "vitest";
import { cleanName, JamSession } from "../src/session.js";
import { loadMembership, saveMembership } from "../src/storage.js";
import { fakeEnvironment, memoryStorage } from "./support/fake-environment.js";

const ROOM = "7k3m9q2x";
const SECRET = "JoinSecretJoinSecret12";
const PARTICIPANT = "3f6c1a2e-8b4d-4c7a-9e21-5d0b7f3a1c64";

function session(joinSecret: string | null = SECRET, storage = memoryStorage()) {
  const fake = fakeEnvironment();
  const jam = new JamSession({
    link: { roomId: ROOM, joinSecret },
    url: "wss://jam.example.org/ws",
    appVersion: "test",
    storage,
    environment: fake.environment,
    newParticipantId: () => PARTICIPANT,
  });
  const welcome = (): void => {
    fake.last().open();
    fake.last().receive({ type: "welcome", protocol: 1, serverTime: fake.clock.now });
  };
  return { jam, fake, storage, welcome };
}

function state(version: number, extra: object = {}): object {
  return { type: "state", version, serverTime: 1_000_000, room: { id: ROOM, ...extra } };
}

describe("JamSession", () => {
  it("asks for a name, then joins with the trimmed name, a new participantId and the secret", () => {
    const { jam, fake, storage, welcome } = session();
    expect(jam.view().phase).toEqual({ kind: "need-name" });
    expect(jam.join("   ")).toBe(false);
    expect(jam.join("  Аня   Петрова ")).toBe(true);
    expect(jam.view().phase).toEqual({ kind: "joining" });
    welcome();
    expect(fake.last().messages()[1]).toEqual({
      type: "join",
      id: "join",
      roomId: ROOM,
      joinSecret: SECRET,
      participantId: PARTICIPANT,
      name: "Аня Петрова",
    });
    fake.last().receive({ type: "joined", id: "join", publicId: "a4n8q1" });
    expect(jam.view().phase).toEqual({ kind: "in-room" });
    expect(loadMembership(storage, ROOM)).toEqual({
      participantId: PARTICIPANT,
      name: "Аня Петрова",
      joinSecret: SECRET,
    });
  });

  it("a guest who was here before joins at once, even from a link without the secret", () => {
    const storage = memoryStorage();
    saveMembership(storage, ROOM, { participantId: PARTICIPANT, name: "Аня", joinSecret: SECRET });
    const { jam, fake, welcome } = session(null, storage);
    expect(jam.view().phase).toEqual({ kind: "joining" });
    jam.start();
    welcome();
    expect(fake.last().messages()[1]).toMatchObject({
      type: "join",
      participantId: PARTICIPANT,
      joinSecret: SECRET,
    });
  });

  it("without a stored membership a link without the secret cannot join", () => {
    const { jam } = session(null);
    expect(jam.view().phase).toEqual({ kind: "no-secret" });
    expect(jam.join("Аня")).toBe(false);
  });

  it("ignores an older state on one connection, and takes the first state after a reconnect", () => {
    const { jam, fake, welcome } = session();
    jam.join("Аня");
    welcome();
    fake.last().receive(state(5, { hostName: "a" }));
    fake.last().receive(state(4, { hostName: "b" }));
    expect(jam.view().room?.hostName).toBe("a");
    fake.last().drop();
    fake.fire();
    welcome();
    expect(fake.last().messages()[1]).toMatchObject({ type: "join" });
    fake.last().receive(state(3, { hostName: "c" }));
    expect(jam.view().room?.hostName).toBe("c");
  });

  it("a refused join ends the session without reconnecting", () => {
    const { jam, fake, welcome } = session();
    jam.join("Аня");
    welcome();
    fake.last().receive({ type: "rejected", id: "join", reason: "bad-secret" });
    expect(jam.view().phase).toEqual({ kind: "refused", reason: "bad-secret" });
    fake.last().drop();
    expect(fake.timers.filter((timer) => !timer.cancelled)).toHaveLength(0);
  });

  it("ended and kicked end the session; other refusals become notices", () => {
    const first = session();
    first.jam.join("Аня");
    first.welcome();
    first.fake.last().receive({ type: "rejected", id: "w1", reason: "stale" });
    first.fake.last().receive({ type: "rejected", id: "w2", reason: "stale" });
    expect(first.jam.view().notice).toEqual({ reason: "stale", serial: 2 });
    first.fake.last().receive({ type: "ended", reason: "host-ended" });
    expect(first.jam.view().phase).toEqual({ kind: "ended", reason: "host-ended" });

    const second = session();
    second.jam.join("Боря");
    second.welcome();
    second.fake.last().receive({ type: "kicked" });
    expect(second.jam.view().phase).toEqual({ kind: "kicked" });
    expect(second.jam.view().status).toBe("stopped");
  });

  it("remove and skip send requests with their own ids", () => {
    const { jam, fake, welcome } = session();
    jam.join("Аня");
    welcome();
    jam.remove("i4");
    jam.skip("i3");
    expect(fake.last().messages().slice(2)).toEqual([
      { type: "remove", id: "w1", itemId: "i4" },
      { type: "skip", id: "w2", itemId: "i3" },
    ]);
  });
});

describe("cleanName", () => {
  it("trims, joins spaces, and allows 1 to 24 characters counted as code points", () => {
    expect(cleanName("  Аня  ")).toBe("Аня");
    expect(cleanName("a  b")).toBe("a b");
    expect(cleanName("")).toBeNull();
    expect(cleanName("x".repeat(24))).toBe("x".repeat(24));
    expect(cleanName("x".repeat(25))).toBeNull();
    expect(cleanName("🎵".repeat(24))).toBe("🎵".repeat(24));
  });
});
