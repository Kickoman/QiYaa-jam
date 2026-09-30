import type {
  ClientMessage,
  NowPlaying,
  ServerMessage,
  Settings,
  Track,
} from "../protocol/generated/types.js";
import type { Fallback } from "./seeds.js";

export type ParticipantKind = "host" | "web" | "qiyaa";

export type Participant = {
  readonly publicId: string;
  readonly idHash: string | null;
  readonly name: string;
  readonly kind: ParticipantKind;
  readonly joinedAt: number;
  readonly lastServedAt: number | null;
  readonly connections: number;
};

export type Item = {
  readonly itemId: string;
  readonly track: Track;
  readonly addedBy: string;
  readonly addedAt: number;
  readonly pinnedAt: number | null;
};

export type RecentItem = {
  readonly itemId: string;
  readonly track: Track;
  readonly addedBy: string;
  readonly playedAt: number;
};

export type CachedTrack = { readonly track: Track; readonly at: number };

export type PendingRequest = {
  readonly kind: "search" | "validate";
  readonly requestId: string;
  readonly connection: string;
  readonly guest: string;
  readonly id: string;
  readonly track: Track | null;
};

export type RoomState = {
  readonly id: string;
  readonly hostName: string;
  readonly hostPublicId: string;
  readonly hostSecretHash: string;
  readonly joinSecretHash: string;
  readonly createdAt: number;
  readonly version: number;
  readonly nextItemNumber: number;
  readonly settings: Settings;
  readonly participants: readonly Participant[];
  readonly kicked: readonly string[];
  readonly queue: readonly Item[];
  readonly recent: readonly RecentItem[];
  readonly nowPlaying: NowPlaying;
  readonly fallback: Fallback;
  readonly searchCache: ReadonlyMap<string, readonly CachedTrack[]>;
  readonly pending: readonly PendingRequest[];
  readonly hostLeftAt: number | null;
};

export type RoomContext = { readonly now: number; readonly publicUrl: string };

export type Fresh = { readonly requestId: string; readonly joinSecret: string };

export type RoomEvent =
  | {
      readonly kind: "join";
      readonly connection: string;
      readonly id: string;
      readonly participantId: string;
      readonly joinSecret: string;
      readonly name: string;
      readonly participantKind: "web" | "qiyaa";
      readonly newPublicId: string;
    }
  | { readonly kind: "disconnected"; readonly publicId: string }
  | {
      readonly kind: "message";
      readonly connection: string;
      readonly from: string;
      readonly message: ClientMessage;
      readonly fresh: Fresh;
    }
  | {
      readonly kind: "resume";
      readonly connection: string;
      readonly id: string;
      readonly hostSecret: string;
      readonly outbox: readonly { readonly itemId: string }[];
      readonly restored: boolean;
    }
  | { readonly kind: "timeout"; readonly requestId: string }
  | { readonly kind: "tick" };

export type Effect =
  | { readonly kind: "send"; readonly connection: string; readonly message: ServerMessage }
  | { readonly kind: "admit"; readonly connection: string; readonly publicId: string }
  | { readonly kind: "state" }
  | { readonly kind: "to-host"; readonly message: ServerMessage }
  | { readonly kind: "timer"; readonly requestId: string; readonly at: number }
  | { readonly kind: "drop"; readonly publicId: string }
  | { readonly kind: "end"; readonly reason: "host-ended" | "expired" };

export type Outcome = { readonly room: RoomState | null; readonly effects: readonly Effect[] };
