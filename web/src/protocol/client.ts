import type { ClientMessage, ServerMessage } from "../../../server/src/protocol/generated/types.js";

export type ConnectionStatus = "connecting" | "online" | "offline" | "stopped";

export type SocketLike = {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: ((event: { readonly code: number }) => void) | null;
  send(data: string): void;
  close(code?: number): void;
};

export type ClientEnvironment = {
  readonly openSocket: (url: string) => SocketLike;
  readonly now: () => number;
  readonly setTimer: (callback: () => void, ms: number) => unknown;
  readonly clearTimer: (timer: unknown) => void;
};

export type ClientOptions = {
  readonly url: string;
  readonly appVersion: string;
  readonly onMessage: (message: ServerMessage) => void;
  readonly onStatus: (status: ConnectionStatus) => void;
  readonly onWelcome: () => void;
};

const OPEN = 1;
export const RECONNECT_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export class JamConnection {
  private socket: SocketLike | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private stopped = false;
  private offsetMs = 0;
  private status: ConnectionStatus = "connecting";

  constructor(
    private readonly options: ClientOptions,
    private readonly environment: ClientEnvironment,
  ) {}

  get clockOffsetMs(): number {
    return this.offsetMs;
  }

  serverNow(): number {
    return this.environment.now() + this.offsetMs;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.cancelTimer();
    this.socket?.close(1000);
    this.socket = null;
    this.setStatus("stopped");
  }

  networkBack(): void {
    if (this.stopped || this.status === "online") {
      return;
    }
    this.cancelTimer();
    this.attempt = 0;
    this.connect();
  }

  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== OPEN || this.status !== "online") {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private setStatus(status: ConnectionStatus): void {
    if (status !== this.status) {
      this.status = status;
      this.options.onStatus(status);
    }
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.environment.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private connect(): void {
    this.socket?.close(1000);
    this.setStatus("connecting");
    const socket = this.environment.openSocket(this.options.url);
    this.socket = socket;
    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: "hello",
          protocol: 1,
          app: "web",
          appVersion: this.options.appVersion,
        }),
      );
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || typeof event.data !== "string") {
        return;
      }
      this.receive(JSON.parse(event.data) as ServerMessage);
    };
    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.scheduleReconnect();
    };
  }

  private receive(message: ServerMessage): void {
    if (message.type === "welcome" || message.type === "state") {
      this.offsetMs = message.serverTime - this.environment.now();
    }
    if (message.type === "welcome") {
      this.attempt = 0;
      this.setStatus("online");
      this.options.onWelcome();
      return;
    }
    this.options.onMessage(message);
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      return;
    }
    this.setStatus("offline");
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
    this.attempt++;
    this.timer = this.environment.setTimer(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }
}

export function browserEnvironment(): ClientEnvironment {
  return {
    openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    now: () => Date.now(),
    setTimer: (callback, ms) => window.setTimeout(callback, ms),
    clearTimer: (timer) => {
      window.clearTimeout(timer as number);
    },
  };
}
