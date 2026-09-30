import type { ClientEnvironment, SocketLike } from "../../src/protocol/client.js";

export class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: ((event: { readonly code: number }) => void) | null = null;
  readonly sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }

  messages(): Record<string, unknown>[] {
    return this.sent.map((data) => JSON.parse(data) as Record<string, unknown>);
  }
}

export type FakeTimer = { callback: () => void; ms: number; cancelled: boolean };

export function fakeEnvironment() {
  const sockets: FakeSocket[] = [];
  const timers: FakeTimer[] = [];
  const clock = { now: 1_000_000 };
  const environment: ClientEnvironment = {
    openSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    now: () => clock.now,
    setTimer: (callback, ms) => {
      const timer: FakeTimer = { callback, ms, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      (timer as FakeTimer).cancelled = true;
    },
  };
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
  return { environment, sockets, timers, clock, last, fire };
}

export function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
