import type {
  ClientMessage,
  RejectedMessage,
  Room,
  ServerMessage,
  Track,
} from "../../server/src/protocol/generated/types.js";
import type { JoinLink } from "./link.js";
import { JamConnection, type ClientEnvironment, type ConnectionStatus } from "./protocol/client.js";
import { loadMembership, saveMembership, type Membership } from "./storage.js";

export type Reason = RejectedMessage["reason"];

export type Phase =
  | { readonly kind: "no-secret" }
  | { readonly kind: "need-name" }
  | { readonly kind: "joining" }
  | { readonly kind: "in-room" }
  | { readonly kind: "refused"; readonly reason: Reason }
  | { readonly kind: "ended"; readonly reason: "host-ended" | "expired" }
  | { readonly kind: "kicked" }
  | { readonly kind: "update-required" };

export type Notice = { readonly reason: Reason; readonly serial: number };

export type Search =
  | { readonly kind: "idle" }
  | { readonly kind: "searching"; readonly text: string }
  | { readonly kind: "results"; readonly text: string; readonly tracks: readonly Track[] }
  | { readonly kind: "failed"; readonly text: string; readonly reason: Reason };

export type AddState = "sending" | "added" | Reason;

export type SessionView = {
  readonly phase: Phase;
  readonly status: ConnectionStatus;
  readonly room: Room | null;
  readonly notice: Notice | null;
  readonly name: string;
  readonly search: Search;
  readonly adds: ReadonlyMap<string, AddState>;
};

export type SessionDependencies = {
  readonly link: JoinLink;
  readonly url: string;
  readonly appVersion: string;
  readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  readonly environment: ClientEnvironment;
  readonly newParticipantId: () => string;
};

const NAME_LIMIT = 24;
const SEARCH_LIMIT = 100;

export function cleanSearch(text: string): string | null {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length >= 1 && Array.from(trimmed).length <= SEARCH_LIMIT ? trimmed : null;
}

export function cleanName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed.length >= 1 && Array.from(trimmed).length <= NAME_LIMIT ? trimmed : null;
}

export class JamSession {
  private phase: Phase;
  private status: ConnectionStatus = "connecting";
  private room: Room | null = null;
  private notice: Notice | null = null;
  private search: Search = { kind: "idle" };
  private searchId: string | null = null;
  private adds = new Map<string, AddState>();
  private readonly addIds = new Map<string, string>();
  private membership: Membership | null;
  private connection: JamConnection | null = null;
  private lastVersion = 0;
  private requests = 0;
  private readonly listeners = new Set<(view: SessionView) => void>();

  constructor(private readonly dependencies: SessionDependencies) {
    const { link, storage } = dependencies;
    this.membership = loadMembership(storage, link.roomId);
    if (this.membership) {
      this.phase = { kind: "joining" };
    } else if (link.joinSecret === null) {
      this.phase = { kind: "no-secret" };
    } else {
      this.phase = { kind: "need-name" };
    }
  }

  view(): SessionView {
    return {
      phase: this.phase,
      status: this.status,
      room: this.room,
      notice: this.notice,
      name: this.membership?.name ?? "",
      search: this.search,
      adds: this.adds,
    };
  }

  subscribe(listener: (view: SessionView) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  serverNow(): number {
    return this.connection?.serverNow() ?? this.dependencies.environment.now();
  }

  start(): void {
    if (this.membership) {
      this.connect();
    }
  }

  join(name: string): boolean {
    const clean = cleanName(name);
    const joinSecret = this.dependencies.link.joinSecret;
    if (clean === null || joinSecret === null) {
      return false;
    }
    this.membership = {
      participantId: this.membership?.participantId ?? this.dependencies.newParticipantId(),
      name: clean,
      joinSecret,
    };
    this.phase = { kind: "joining" };
    this.emit();
    this.connect();
    return true;
  }

  find(text: string): boolean {
    const clean = cleanSearch(text);
    if (clean === null) {
      return false;
    }
    const id = this.nextId();
    if (!this.connection?.send({ type: "search", id, text: clean })) {
      return false;
    }
    this.searchId = id;
    this.search = { kind: "searching", text: clean };
    this.emit();
    return true;
  }

  closeSearch(): void {
    this.searchId = null;
    this.search = { kind: "idle" };
    this.emit();
  }

  add(trackId: string): void {
    const id = this.nextId();
    if (!this.connection?.send({ type: "add", id, trackId })) {
      return;
    }
    this.addIds.set(id, trackId);
    this.setAdd(trackId, "sending");
  }

  private setAdd(trackId: string, state: AddState): void {
    this.adds = new Map(this.adds).set(trackId, state);
    this.emit();
  }

  remove(itemId: string): void {
    this.request((id) => ({ type: "remove", id, itemId }));
  }

  skip(itemId: string): void {
    this.request((id) => ({ type: "skip", id, itemId }));
  }

  stop(): void {
    this.connection?.stop();
    this.connection = null;
  }

  networkBack(): void {
    this.connection?.networkBack();
  }

  private emit(): void {
    const view = this.view();
    for (const listener of this.listeners) {
      listener(view);
    }
  }

  private nextId(): string {
    this.requests++;
    return `w${this.requests}`;
  }

  private request(build: (id: string) => ClientMessage): void {
    this.connection?.send(build(this.nextId()));
  }

  private connect(): void {
    this.connection?.stop();
    this.connection = new JamConnection(
      {
        url: this.dependencies.url,
        appVersion: this.dependencies.appVersion,
        onStatus: (status) => {
          this.status = status;
          this.emit();
        },
        onWelcome: () => {
          this.lastVersion = 0;
          this.sendJoin();
        },
        onMessage: (message) => {
          this.receive(message);
        },
      },
      this.dependencies.environment,
    );
    this.connection.start();
  }

  private sendJoin(): void {
    const membership = this.membership;
    if (!membership) {
      return;
    }
    this.connection?.send({
      type: "join",
      id: "join",
      roomId: this.dependencies.link.roomId,
      joinSecret: membership.joinSecret,
      participantId: membership.participantId,
      name: membership.name,
    });
  }

  private finish(phase: Phase): void {
    this.phase = phase;
    this.stop();
    this.emit();
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case "joined":
        if (this.membership) {
          saveMembership(this.dependencies.storage, this.dependencies.link.roomId, this.membership);
        }
        this.phase = { kind: "in-room" };
        this.emit();
        return;
      case "state":
        if (message.version <= this.lastVersion) {
          return;
        }
        this.lastVersion = message.version;
        this.room = message.room;
        this.emit();
        return;
      case "searchResults":
        if (message.id === this.searchId && this.search.kind === "searching") {
          this.search = { kind: "results", text: this.search.text, tracks: message.tracks };
          this.emit();
        }
        return;
      case "ack": {
        const trackId = this.addIds.get(message.id);
        if (trackId !== undefined) {
          this.addIds.delete(message.id);
          this.setAdd(trackId, "added");
        }
        return;
      }
      case "rejected":
        if (
          message.id !== undefined &&
          message.id === this.searchId &&
          this.search.kind === "searching"
        ) {
          this.search = { kind: "failed", text: this.search.text, reason: message.reason };
          this.emit();
          return;
        }
        if (message.id !== undefined && this.addIds.has(message.id)) {
          const trackId = this.addIds.get(message.id) ?? "";
          this.addIds.delete(message.id);
          this.setAdd(trackId, message.reason);
        }
        if (message.id === "join") {
          this.finish({ kind: "refused", reason: message.reason });
        } else if (message.reason === "update-required") {
          this.finish({ kind: "update-required" });
        } else {
          this.notice = { reason: message.reason, serial: (this.notice?.serial ?? 0) + 1 };
          this.emit();
        }
        return;
      case "ended":
        this.finish({ kind: "ended", reason: message.reason });
        return;
      case "kicked":
        this.finish({ kind: "kicked" });
        return;
      default:
        return;
    }
  }
}
