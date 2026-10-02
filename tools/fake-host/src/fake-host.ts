import { WebSocket } from "ws";
import type {
  ClientMessage,
  QueueItem,
  ServerMessage,
  SnapshotData,
  Track,
} from "../../../server/src/protocol/generated/types.js";
import { searchCatalog } from "./catalog.js";

export type FakeHostOptions = {
  readonly url: string;
  readonly name: string;
  readonly catalog: readonly Track[];
  readonly speed: number;
  readonly log?: (line: string) => void;
  /** Listening along (experimental): the file a guest may play for a track. */
  readonly listenUrl?: (track: Track) => string;
};

export type Session = {
  readonly roomId: string;
  readonly hostSecret: string;
  readonly joinUrl: string;
};

type Current =
  | { readonly kind: "item"; readonly itemId: string; readonly track: Track }
  | { readonly kind: "wave"; readonly track: Track };

const SEARCH_RESULTS = 20;
const RECONNECT_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export class FakeHost {
  readonly started: string[] = [];
  readonly waveTracks: string[] = [];
  session: Session | null = null;
  snapshot: SnapshotData | null = null;
  outbox: string[] = [];
  private socket: WebSocket | null = null;
  private online = false;
  private queue: QueueItem[] = [];
  private seeds: readonly string[] = [];
  private current: Current | null = null;
  private trackTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnects = 0;
  private waveCursor = 0;
  private stopped = false;
  private readonly waiters: {
    readonly matches: (message: ServerMessage) => boolean;
    readonly resolve: (message: ServerMessage) => void;
  }[] = [];

  constructor(private readonly options: FakeHostOptions) {}

  get isOnline(): boolean {
    return this.online;
  }

  get nowPlaying(): Current | null {
    return this.current;
  }

  async create(): Promise<Session> {
    await this.connect();
    this.send({
      type: "create",
      id: "create",
      hostName: this.options.name,
    });
    const created = await this.waitFor((message) => message.type === "created");
    if (created.type !== "created") {
      throw new Error("expected created");
    }
    this.online = true;
    this.session = {
      roomId: created.roomId,
      hostSecret: created.hostSecret,
      joinUrl: created.joinUrl,
    };
    return this.session;
  }

  async resume(): Promise<boolean> {
    const session = this.session;
    if (!session) {
      throw new Error("no session to resume");
    }
    await this.connect();
    this.send({
      type: "resume",
      id: "resume",
      roomId: session.roomId,
      hostSecret: session.hostSecret,
      snapshot: this.snapshot,
      outbox: this.outbox.map((itemId) => ({ type: "started", itemId })),
    });
    const answer = await this.waitFor(
      (message) =>
        message.type === "resumed" || (message.type === "rejected" && message.id === "resume"),
    );
    if (answer.type !== "resumed") {
      this.log(`resume refused: ${JSON.stringify(answer)}`);
      return false;
    }
    this.online = true;
    this.reconnects = 0;
    this.outbox = [];
    this.reportPlaying();
    return true;
  }

  drop(reconnectAutomatically: boolean): void {
    this.log("dropping the connection");
    this.goOffline(reconnectAutomatically);
    this.socket?.terminate();
    this.socket = null;
  }

  end(): void {
    this.send({ type: "end", id: "end" });
  }

  settings(settings: {
    readonly order?: "round-robin" | "fifo";
    readonly guestsCanSkip?: boolean;
  }): void {
    this.send({ type: "settings", id: "settings", settings });
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.trackTimer);
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  waitFor(matches: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    return new Promise((resolve) => {
      this.waiters.push({ matches, resolve });
    });
  }

  private log(line: string): void {
    this.options.log?.(line);
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.options.url);
      this.socket = socket;
      socket.on("message", (data: Buffer) => {
        this.receive(JSON.parse(data.toString("utf8")) as ServerMessage);
      });
      socket.on("close", () => {
        if (this.socket === socket) {
          this.socket = null;
          this.goOffline(true);
        }
      });
      socket.on("error", () => undefined);
      socket.once("error", reject);
      socket.once("open", () => {
        socket.send(
          JSON.stringify({ type: "hello", protocol: 1, app: "desktop", appVersion: "fake-host" }),
        );
      });
      void this.waitFor((message) => message.type === "welcome").then(() => {
        resolve();
      });
    });
  }

  private goOffline(reconnectAutomatically: boolean): void {
    if (!this.online) {
      return;
    }
    this.online = false;
    if (reconnectAutomatically) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    const delay = RECONNECT_MS[Math.min(this.reconnects, RECONNECT_MS.length - 1)] ?? 30_000;
    this.reconnects++;
    this.log(`offline; reconnecting in ${delay} ms`);
    this.reconnectTimer = setTimeout(() => {
      this.resume().then(
        (resumed) => {
          if (!resumed) {
            this.log("the server no longer knows the room; giving up");
          }
        },
        (failed: unknown) => {
          this.log(`reconnect failed: ${String(failed)}`);
          this.scheduleReconnect();
        },
      );
    }, delay);
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private receive(message: ServerMessage): void {
    const waiter = this.waiters.findIndex((candidate) => candidate.matches(message));
    if (waiter >= 0) {
      this.waiters.splice(waiter, 1)[0]?.resolve(message);
    }
    switch (message.type) {
      case "state":
        this.onState(message.room.queue, message.room.fallback.seeds);
        break;
      case "snapshot":
        this.snapshot = message.data;
        break;
      case "searchRequest":
        this.send({
          type: "searchResult",
          requestId: message.requestId,
          tracks: searchCatalog(this.options.catalog, message.text, SEARCH_RESULTS),
        });
        break;
      case "validateRequest": {
        const results = message.trackIds.map((trackId) => {
          const track = this.options.catalog.find((candidate) => candidate.id === trackId);
          return track ? { trackId, track } : { trackId, reason: "track-unavailable" as const };
        });
        const [first, ...rest] = results;
        if (first) {
          this.send({
            type: "validateResult",
            requestId: message.requestId,
            results: [first, ...rest],
          });
        }
        break;
      }
      case "command":
        if (this.current?.kind === "item" && this.current.itemId === message.itemId) {
          this.log(`skip ${message.itemId} by a guest`);
          this.playNext();
        }
        break;
      case "ended":
        this.log(`jam ended: ${message.reason}`);
        this.stopped = true;
        clearTimeout(this.trackTimer);
        break;
      default:
        break;
    }
  }

  private onState(queue: readonly QueueItem[], seeds: readonly string[]): void {
    const playing = this.current;
    this.queue = queue.filter(
      (item) => !(playing?.kind === "item" && playing.itemId === item.itemId),
    );
    this.seeds = seeds;
    if (this.current === null && this.queue.length > 0) {
      this.playNext();
    }
  }

  private playNext(): void {
    clearTimeout(this.trackTimer);
    if (this.stopped) {
      return;
    }
    const item = this.queue.shift();
    if (item) {
      this.current = { kind: "item", itemId: item.itemId, track: item.track };
      this.started.push(item.itemId);
      if (this.online) {
        this.send({ type: "started", itemId: item.itemId });
      } else {
        this.outbox.push(item.itemId);
      }
      this.log(`plays ${item.itemId}: ${item.track.artists.join(", ")} — ${item.track.title}`);
    } else {
      const track = this.waveTrack();
      if (!track) {
        this.current = null;
        this.send({ type: "playing", source: "idle", positionMs: 0, paused: true });
        return;
      }
      this.current = { kind: "wave", track };
      this.waveTracks.push(track.id);
      this.log(`jam wave: ${track.artists.join(", ")} — ${track.title}`);
    }
    this.reportPlaying();
    const durationMs = Math.max(1, this.current.track.durationMs / this.options.speed);
    this.trackTimer = setTimeout(() => {
      this.playNext();
    }, durationMs);
  }

  private waveTrack(): Track | null {
    const lastSeed = this.seeds[0]?.replace(/^track:/, "");
    if (lastSeed === undefined) {
      return null;
    }
    const catalog = this.options.catalog;
    const seedArtists = new Set(catalog.find((track) => track.id === lastSeed)?.artists ?? []);
    for (let step = 0; step < catalog.length; step++) {
      const candidate = catalog[(this.waveCursor + step) % catalog.length];
      if (
        candidate &&
        candidate.id !== lastSeed &&
        candidate.artists.some((artist) => seedArtists.has(artist))
      ) {
        this.waveCursor = (this.waveCursor + step + 1) % catalog.length;
        return candidate;
      }
    }
    this.waveCursor = (this.waveCursor + 1) % catalog.length;
    return catalog[this.waveCursor] ?? null;
  }

  private reportPlaying(): void {
    const current = this.current;
    if (!current || !this.online) {
      return;
    }
    const link = this.options.listenUrl?.(current.track);
    const listen = link === undefined ? {} : { listenUrl: link };
    if (current.kind === "item") {
      this.send({
        type: "playing",
        source: "item",
        itemId: current.itemId,
        positionMs: 0,
        paused: false,
        ...listen,
      });
    } else {
      this.send({
        type: "playing",
        source: "wave",
        track: current.track,
        positionMs: 0,
        paused: false,
        ...listen,
      });
    }
  }
}
