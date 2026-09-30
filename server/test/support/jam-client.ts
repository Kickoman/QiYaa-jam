import { WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "../../src/protocol/generated/types.js";

export class JamClient {
  private readonly inbox: ServerMessage[] = [];
  private readonly waiting: ((message: ServerMessage) => void)[] = [];
  readonly closed: Promise<{ code: number }>;

  private constructor(readonly socket: WebSocket) {
    socket.on("message", (data: Buffer) => {
      const message = JSON.parse(data.toString("utf8")) as ServerMessage;
      const next = this.waiting.shift();
      if (next) {
        next(message);
      } else {
        this.inbox.push(message);
      }
    });
    this.closed = new Promise((resolve) => {
      socket.on("close", (code: number) => {
        resolve({ code });
      });
    });
  }

  static open(
    url: string,
    headers: Record<string, string> = {},
    autoPong = true,
  ): Promise<JamClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { headers, autoPong });
      socket.once("open", () => {
        resolve(new JamClient(socket));
      });
      socket.once("unexpected-response", (_request, response) => {
        reject(new Error(`HTTP ${response.statusCode}`));
      });
      socket.once("error", reject);
    });
  }

  static async hello(
    url: string,
    app: "desktop" | "android" | "web",
    headers: Record<string, string> = {},
  ): Promise<JamClient> {
    const client = await JamClient.open(url, headers);
    client.send({ type: "hello", protocol: 1, app, appVersion: "test" });
    const welcome = await client.next();
    if (welcome.type !== "welcome") {
      throw new Error(`expected welcome, got ${JSON.stringify(welcome)}`);
    }
    return client;
  }

  send(message: ClientMessage | Record<string, unknown>): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(data: string | Buffer, binary = false): void {
    this.socket.send(data, { binary });
  }

  next(): Promise<ServerMessage> {
    const queued = this.inbox.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("no message within 2 s"));
      }, 2_000);
      this.waiting.push((message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
  }

  async nextOf<T extends ServerMessage["type"]>(
    type: T,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    for (;;) {
      const message = await this.next();
      if (message.type === type) {
        return message as Extract<ServerMessage, { type: T }>;
      }
    }
  }

  async stateWhere(
    matches: (state: Extract<ServerMessage, { type: "state" }>) => boolean,
  ): Promise<Extract<ServerMessage, { type: "state" }>> {
    for (;;) {
      const state = await this.nextOf("state");
      if (matches(state)) {
        return state;
      }
    }
  }

  close(): void {
    this.socket.close();
  }
}
