import { describe, expect, it } from "vitest";
import {
  JamConnection,
  RECONNECT_DELAYS_MS,
  type ClientEnvironment,
  type ConnectionStatus,
} from "../src/protocol/client.js";
import { FakeSocket } from "./support/fake-environment.js";

function harness() {
  const sockets: FakeSocket[] = [];
  const timers: { callback: () => void; ms: number; cancelled: boolean }[] = [];
  const statuses: ConnectionStatus[] = [];
  let clock = 1_000_000;
  const environment: ClientEnvironment = {
    openSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    now: () => clock,
    setTimer: (callback, ms) => {
      const timer = { callback, ms, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      (timer as { cancelled: boolean }).cancelled = true;
    },
  };
  const connection = new JamConnection(
    {
      url: "wss://jam.example.org/ws",
      appVersion: "test",
      onMessage: () => undefined,
      onStatus: (status) => statuses.push(status),
      onWelcome: () => undefined,
    },
    environment,
  );
  const last = (): FakeSocket => {
    const socket = sockets.at(-1);
    if (!socket) {
      throw new Error("no socket");
    }
    return socket;
  };
  const fire = (): void => {
    const timer = timers.filter((candidate) => !candidate.cancelled).at(-1);
    if (!timer) {
      throw new Error("no timer");
    }
    timer.cancelled = true;
    timer.callback();
  };
  return {
    connection,
    sockets,
    timers,
    statuses,
    last,
    fire,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("JamConnection", () => {
  it("says hello on open and is online after welcome", () => {
    const jam = harness();
    jam.connection.start();
    jam.last().open();
    expect(JSON.parse(jam.last().sent[0] ?? "{}")).toEqual({
      type: "hello",
      protocol: 1,
      app: "web",
      appVersion: "test",
    });
    jam.last().receive({ type: "welcome", protocol: 1, serverTime: 1_000_500 });
    expect(jam.statuses).toEqual(["online"]);
    expect(jam.connection.clockOffsetMs).toBe(500);
    expect(jam.connection.serverNow()).toBe(1_000_500);
  });

  it("reconnects after 1, 2, 4 … 30 s, and starts over after a welcome", () => {
    const jam = harness();
    jam.connection.start();
    for (let drop = 0; drop < 8; drop++) {
      jam.last().drop();
      jam.fire();
    }
    expect(jam.timers.map((timer) => timer.ms)).toEqual([...RECONNECT_DELAYS_MS, 30_000, 30_000]);
    jam.last().open();
    jam.last().receive({ type: "welcome", protocol: 1, serverTime: 0 });
    jam.last().drop();
    expect(jam.timers.at(-1)?.ms).toBe(1_000);
  });

  it("reconnects at once when the network comes back", () => {
    const jam = harness();
    jam.connection.start();
    jam.last().drop();
    jam.last().drop();
    expect(jam.sockets).toHaveLength(1);
    jam.connection.networkBack();
    expect(jam.sockets).toHaveLength(2);
    expect(jam.timers.every((timer) => timer.cancelled)).toBe(true);
  });

  it("does not send before welcome, and stops for good after stop()", () => {
    const jam = harness();
    jam.connection.start();
    expect(jam.connection.send({ type: "skip", id: "g1", itemId: "i1" })).toBe(false);
    jam.last().open();
    jam.last().receive({ type: "welcome", protocol: 1, serverTime: 0 });
    expect(jam.connection.send({ type: "skip", id: "g1", itemId: "i1" })).toBe(true);
    jam.connection.stop();
    jam.last().drop();
    expect(jam.timers).toHaveLength(0);
    expect(jam.statuses.at(-1)).toBe("stopped");
  });

  it("takes the clock offset from every state", () => {
    const jam = harness();
    jam.connection.start();
    jam.last().open();
    jam.last().receive({ type: "welcome", protocol: 1, serverTime: 1_000_000 });
    jam.advance(10_000);
    jam.last().receive({ type: "state", version: 1, serverTime: 1_012_000, room: {} });
    expect(jam.connection.clockOffsetMs).toBe(2_000);
  });
});
