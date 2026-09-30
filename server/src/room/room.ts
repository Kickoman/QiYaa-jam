import type {
  AddMessage,
  NowPlaying,
  PlayingMessage,
  RejectedMessage,
  SearchResultMessage,
  ServerMessage,
  Settings,
  SettingsPatch,
  Track,
  ValidateResultMessage,
} from "../protocol/generated/types.js";
import {
  DEFAULT_MAX_PENDING_PER_GUEST,
  GUESTS_PER_ROOM,
  HOST_ANSWER_MS,
  KICKED_REMEMBERED,
  QUEUE_LENGTH,
  RECENT_ITEMS,
  ROOM_MAX_AGE_MS,
  ROOM_WITHOUT_HOST_MS,
  SEARCH_CACHE_MS,
  SEARCH_CACHE_TRACKS,
} from "./limits.js";
import { hashSecret } from "./secrets.js";
import { nextFallback, type SeedCandidate } from "./seeds.js";
import type {
  Effect,
  Fresh,
  Item,
  Outcome,
  Participant,
  PendingRequest,
  RecentItem,
  RoomContext,
  RoomEvent,
  RoomState,
} from "./types.js";

type Reason = RejectedMessage["reason"];

const defaultSettings: Settings = {
  order: "round-robin",
  guestsCanSkip: false,
  joinOpen: true,
  maxPendingPerGuest: DEFAULT_MAX_PENDING_PER_GUEST,
};

export function joinUrl(publicUrl: string, roomId: string, joinSecret: string): string {
  return `${publicUrl.replace(/\/+$/, "")}/j/${roomId}#${joinSecret}`;
}

export type CreateRoom = {
  readonly connection: string;
  readonly id: string;
  readonly roomId: string;
  readonly hostPublicId: string;
  readonly hostName: string;
  readonly hostSecret: string;
  readonly joinSecret: string;
  readonly settings?: SettingsPatch;
};

export function createRoom(create: CreateRoom, context: RoomContext): Outcome {
  const room: RoomState = {
    id: create.roomId,
    hostName: create.hostName,
    hostPublicId: create.hostPublicId,
    hostSecretHash: hashSecret(create.hostSecret),
    joinSecretHash: hashSecret(create.joinSecret),
    createdAt: context.now,
    version: 1,
    nextItemNumber: 1,
    settings: { ...defaultSettings, ...create.settings },
    participants: [
      {
        publicId: create.hostPublicId,
        idHash: null,
        name: create.hostName,
        kind: "host",
        joinedAt: context.now,
        lastServedAt: null,
        connections: 1,
      },
    ],
    kicked: [],
    queue: [],
    recent: [],
    nowPlaying: { source: "idle", positionMs: 0, paused: true, reportedAt: context.now },
    fallback: { seeds: [], seedsVersion: 0 },
    searchCache: new Map(),
    pending: [],
    hostLeftAt: null,
  };
  const created: ServerMessage = {
    type: "created",
    id: create.id,
    roomId: room.id,
    hostSecret: create.hostSecret,
    joinSecret: create.joinSecret,
    joinUrl: joinUrl(context.publicUrl, room.id, create.joinSecret),
    publicId: create.hostPublicId,
  };
  return {
    room,
    effects: [
      { kind: "admit", connection: create.connection, publicId: create.hostPublicId },
      { kind: "send", connection: create.connection, message: created },
      { kind: "state" },
    ],
  };
}

export function isHostOnline(room: RoomState): boolean {
  return room.participants.some(
    (participant) => participant.kind === "host" && participant.connections > 0,
  );
}

export function isPublicIdFree(room: RoomState, publicId: string): boolean {
  return !room.participants.some((participant) => participant.publicId === publicId);
}

function seedCandidates(room: RoomState): SeedCandidate[] {
  const candidates: SeedCandidate[] = [
    ...room.queue.map((item) => ({ itemId: item.itemId, trackId: item.track.id })),
    ...room.recent.map((item) => ({ itemId: item.itemId, trackId: item.track.id })),
  ];
  const current = room.nowPlaying;
  if (current.source === "item" && current.itemId !== undefined && current.track) {
    candidates.push({ itemId: current.itemId, trackId: current.track.id });
  }
  return candidates;
}

function unchanged(room: RoomState, effects: readonly Effect[] = []): Outcome {
  return { room, effects };
}

function changed(before: RoomState, after: RoomState, effects: readonly Effect[] = []): Outcome {
  const room: RoomState = {
    ...after,
    version: before.version + 1,
    fallback: nextFallback(after.fallback, seedCandidates(after)),
  };
  return { room, effects: [...effects, { kind: "state" }] };
}

function send(connection: string, message: ServerMessage): Effect {
  return { kind: "send", connection, message };
}

function rejected(id: string | null, reason: Reason): ServerMessage {
  return id === null ? { type: "rejected", reason } : { type: "rejected", id, reason };
}

function refuse(room: RoomState, connection: string, id: string | null, reason: Reason): Outcome {
  return unchanged(room, [send(connection, rejected(id, reason))]);
}

function ack(connection: string, id: string): Effect {
  return send(connection, { type: "ack", id });
}

function withParticipant(
  room: RoomState,
  publicId: string,
  update: (participant: Participant) => Participant,
): RoomState {
  return {
    ...room,
    participants: room.participants.map((participant) =>
      participant.publicId === publicId ? update(participant) : participant,
    ),
  };
}

function waitingOf(room: RoomState, publicId: string): number {
  return room.queue.filter((item) => item.addedBy === publicId).length;
}

function addRefusal(room: RoomState, adder: Participant, trackId: string): Reason | null {
  if (room.queue.some((item) => item.track.id === trackId)) {
    return "duplicate";
  }
  if (room.queue.length >= QUEUE_LENGTH) {
    return "queue-limit";
  }
  if (
    adder.kind !== "host" &&
    waitingOf(room, adder.publicId) >= room.settings.maxPendingPerGuest
  ) {
    return "queue-limit";
  }
  return null;
}

function addItem(
  room: RoomState,
  adder: Participant,
  track: Track,
  connection: string,
  id: string,
  now: number,
): Outcome {
  const refusal = addRefusal(room, adder, track.id);
  if (refusal) {
    return refuse(room, connection, id, refusal);
  }
  const item: Item = {
    itemId: `i${room.nextItemNumber}`,
    track,
    addedBy: adder.publicId,
    addedAt: now,
    pinnedAt: null,
  };
  return changed(
    room,
    { ...room, nextItemNumber: room.nextItemNumber + 1, queue: [...room.queue, item] },
    [ack(connection, id)],
  );
}

function leaveNowPlaying(room: RoomState, now: number): readonly RecentItem[] {
  const current = room.nowPlaying;
  if (
    current.source !== "item" ||
    current.itemId === undefined ||
    !current.track ||
    current.addedBy === undefined
  ) {
    return room.recent;
  }
  const played: RecentItem = {
    itemId: current.itemId,
    track: current.track,
    addedBy: current.addedBy,
    playedAt: now,
  };
  return [played, ...room.recent].slice(0, RECENT_ITEMS);
}

function startItem(room: RoomState, itemId: string, now: number): RoomState | null {
  const item = room.queue.find((waiting) => waiting.itemId === itemId);
  if (!item) {
    return null;
  }
  const nowPlaying: NowPlaying = {
    source: "item",
    itemId: item.itemId,
    track: item.track,
    addedBy: item.addedBy,
    positionMs: 0,
    paused: false,
    reportedAt: now,
  };
  const started: RoomState = {
    ...room,
    queue: room.queue.filter((waiting) => waiting.itemId !== itemId),
    recent: leaveNowPlaying(room, now),
    nowPlaying,
  };
  return withParticipant(started, item.addedBy, (participant) => ({
    ...participant,
    lastServedAt: now,
  }));
}

function onPlaying(room: RoomState, message: PlayingMessage, now: number): Outcome {
  const report = { positionMs: message.positionMs, paused: message.paused, reportedAt: now };
  if (message.source === "item") {
    const current = room.nowPlaying;
    const isCurrent = current.source === "item" && current.itemId === message.itemId;
    const base =
      isCurrent || message.itemId === undefined ? room : startItem(room, message.itemId, now);
    if (!base || (!isCurrent && base === room)) {
      return unchanged(room);
    }
    return changed(room, { ...base, nowPlaying: { ...base.nowPlaying, ...report } });
  }
  const nowPlaying: NowPlaying =
    message.source === "wave" && message.track
      ? { source: "wave", track: message.track, ...report }
      : { source: "idle", ...report };
  return changed(room, { ...room, recent: leaveNowPlaying(room, now), nowPlaying });
}

function cachedTrack(room: RoomState, guest: string, trackId: string, now: number): Track | null {
  const entries = room.searchCache.get(guest) ?? [];
  const fresh = entries.filter((entry) => entry.at > now - SEARCH_CACHE_MS);
  return fresh.findLast((entry) => entry.track.id === trackId)?.track ?? null;
}

function onAdd(
  room: RoomState,
  sender: Participant,
  message: AddMessage,
  connection: string,
  fresh: Fresh,
  now: number,
): Outcome {
  const { id, track, trackId } = message;
  if (sender.kind === "web") {
    if (trackId === undefined) {
      return refuse(room, connection, id, "not-allowed");
    }
    const cached = cachedTrack(room, sender.publicId, trackId, now);
    if (!cached) {
      return refuse(room, connection, id, "unknown-track");
    }
    return addItem(room, sender, cached, connection, id, now);
  }
  if (!track) {
    return refuse(room, connection, id, "not-allowed");
  }
  if (sender.kind === "host") {
    return addItem(room, sender, track, connection, id, now);
  }
  const refusal = addRefusal(room, sender, track.id);
  if (refusal) {
    return refuse(room, connection, id, refusal);
  }
  if (!isHostOnline(room)) {
    return refuse(room, connection, id, "host-offline");
  }
  const request: PendingRequest = {
    kind: "validate",
    requestId: fresh.requestId,
    connection,
    guest: sender.publicId,
    id,
    track,
  };
  return unchanged({ ...room, pending: [...room.pending, request] }, [
    {
      kind: "to-host",
      message: { type: "validateRequest", requestId: fresh.requestId, trackIds: [track.id] },
    },
    { kind: "timer", requestId: fresh.requestId, at: now + HOST_ANSWER_MS },
  ]);
}

function takePending(
  room: RoomState,
  requestId: string,
  kind: PendingRequest["kind"],
): [RoomState, PendingRequest] | null {
  const request = room.pending.find(
    (pending) => pending.requestId === requestId && pending.kind === kind,
  );
  if (!request) {
    return null;
  }
  return [{ ...room, pending: room.pending.filter((pending) => pending !== request) }, request];
}

function onSearchResult(room: RoomState, message: SearchResultMessage, now: number): Outcome {
  const taken = takePending(room, message.requestId, "search");
  if (!taken) {
    return unchanged(room);
  }
  const [rest, request] = taken;
  if (!message.tracks) {
    return unchanged(rest, [send(request.connection, rejected(request.id, "host-error"))]);
  }
  const cache = new Map(rest.searchCache);
  const entries = [
    ...(cache.get(request.guest) ?? []).filter((entry) => entry.at > now - SEARCH_CACHE_MS),
    ...message.tracks.map((track) => ({ track, at: now })),
  ];
  cache.set(request.guest, entries.slice(-SEARCH_CACHE_TRACKS));
  return unchanged({ ...rest, searchCache: cache }, [
    send(request.connection, { type: "searchResults", id: request.id, tracks: message.tracks }),
  ]);
}

function onValidateResult(room: RoomState, message: ValidateResultMessage, now: number): Outcome {
  const taken = takePending(room, message.requestId, "validate");
  if (!taken) {
    return unchanged(room);
  }
  const [rest, request] = taken;
  const guest = rest.participants.find((participant) => participant.publicId === request.guest);
  const result =
    message.results.find((candidate) => candidate.trackId === request.track?.id) ??
    message.results[0];
  if (!guest) {
    return unchanged(rest);
  }
  if (result.track) {
    return addItem(rest, guest, result.track, request.connection, request.id, now);
  }
  const reason: Reason = result.reason === "track-unavailable" ? "track-unavailable" : "host-error";
  return unchanged(rest, [send(request.connection, rejected(request.id, reason))]);
}

function normalizedSearch(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function onKick(room: RoomState, targetId: string, connection: string, id: string): Outcome {
  const target = room.participants.find((participant) => participant.publicId === targetId);
  if (target?.kind === "host") {
    return refuse(room, connection, id, "not-allowed");
  }
  if (!target) {
    return refuse(room, connection, id, "stale");
  }
  const searchCache = new Map(room.searchCache);
  searchCache.delete(targetId);
  const kicked = target.idHash === null ? room.kicked : [...room.kicked, target.idHash];
  return changed(
    room,
    {
      ...room,
      participants: room.participants.filter((participant) => participant !== target),
      queue: room.queue.filter((item) => item.addedBy !== targetId),
      kicked: kicked.slice(-KICKED_REMEMBERED),
      searchCache,
      pending: room.pending.filter((pending) => pending.guest !== targetId),
    },
    [{ kind: "drop", publicId: targetId }, ack(connection, id)],
  );
}

function sameSettings(left: Settings, right: Settings): boolean {
  return (
    left.order === right.order &&
    left.guestsCanSkip === right.guestsCanSkip &&
    left.joinOpen === right.joinOpen &&
    left.maxPendingPerGuest === right.maxPendingPerGuest
  );
}

function onMessage(
  room: RoomState,
  event: Extract<RoomEvent, { kind: "message" }>,
  context: RoomContext,
): Outcome {
  const { connection, message, fresh } = event;
  const { now } = context;
  const sender = room.participants.find((participant) => participant.publicId === event.from);
  if (!sender) {
    return unchanged(room);
  }
  const host = sender.kind === "host";
  const refuseRole = (id: string | null): Outcome => refuse(room, connection, id, "not-allowed");

  switch (message.type) {
    case "hello":
      return refuseRole(null);
    case "create":
    case "resume":
    case "join":
      return refuseRole(message.id);
    case "playing":
      return host ? onPlaying(room, message, now) : refuseRole(null);
    case "started": {
      if (!host) {
        return refuseRole(null);
      }
      const started = startItem(room, message.itemId, now);
      return started ? changed(room, started) : unchanged(room);
    }
    case "add":
      return onAdd(room, sender, message, connection, fresh, now);
    case "pin": {
      if (!host) {
        return refuseRole(message.id);
      }
      const item = room.queue.find((waiting) => waiting.itemId === message.itemId);
      if (!item) {
        return refuse(room, connection, message.id, "stale");
      }
      if (item.pinnedAt !== null) {
        return unchanged(room, [ack(connection, message.id)]);
      }
      const queue = room.queue.map((waiting) =>
        waiting === item ? { ...waiting, pinnedAt: now } : waiting,
      );
      return changed(room, { ...room, queue }, [ack(connection, message.id)]);
    }
    case "remove": {
      const item = room.queue.find((waiting) => waiting.itemId === message.itemId);
      if (!item) {
        return refuse(room, connection, message.id, "stale");
      }
      if (!host && item.addedBy !== sender.publicId) {
        return refuse(room, connection, message.id, "not-allowed");
      }
      const queue = room.queue.filter((waiting) => waiting !== item);
      return changed(room, { ...room, queue }, [ack(connection, message.id)]);
    }
    case "kick":
      return host ? onKick(room, message.publicId, connection, message.id) : refuseRole(message.id);
    case "settings": {
      if (!host) {
        return refuseRole(message.id);
      }
      const settings: Settings = { ...room.settings, ...message.settings };
      if (sameSettings(settings, room.settings)) {
        return unchanged(room, [ack(connection, message.id)]);
      }
      return changed(room, { ...room, settings }, [ack(connection, message.id)]);
    }
    case "rotateLink": {
      if (!host) {
        return refuseRole(message.id);
      }
      const linkRotated: ServerMessage = {
        type: "linkRotated",
        id: message.id,
        joinSecret: fresh.joinSecret,
        joinUrl: joinUrl(context.publicUrl, room.id, fresh.joinSecret),
      };
      return changed(room, { ...room, joinSecretHash: hashSecret(fresh.joinSecret) }, [
        send(connection, linkRotated),
      ]);
    }
    case "end":
      if (!host) {
        return refuseRole(message.id);
      }
      return {
        room: null,
        effects: [ack(connection, message.id), { kind: "end", reason: "host-ended" }],
      };
    case "searchResult":
      return host ? onSearchResult(room, message, now) : refuseRole(null);
    case "validateResult":
      return host ? onValidateResult(room, message, now) : refuseRole(null);
    case "search": {
      if (sender.kind !== "web") {
        return refuseRole(message.id);
      }
      if (!isHostOnline(room)) {
        return refuse(room, connection, message.id, "host-offline");
      }
      const request: PendingRequest = {
        kind: "search",
        requestId: fresh.requestId,
        connection,
        guest: sender.publicId,
        id: message.id,
        track: null,
      };
      const searchRequest: ServerMessage = {
        type: "searchRequest",
        requestId: fresh.requestId,
        text: normalizedSearch(message.text),
      };
      return unchanged({ ...room, pending: [...room.pending, request] }, [
        { kind: "to-host", message: searchRequest },
        { kind: "timer", requestId: fresh.requestId, at: now + HOST_ANSWER_MS },
      ]);
    }
    case "skip": {
      if (host) {
        return refuseRole(message.id);
      }
      if (!room.settings.guestsCanSkip) {
        return refuse(room, connection, message.id, "not-allowed");
      }
      const current = room.nowPlaying;
      if (current.source !== "item" || current.itemId !== message.itemId) {
        return refuse(room, connection, message.id, "stale");
      }
      if (!isHostOnline(room)) {
        return refuse(room, connection, message.id, "host-offline");
      }
      return unchanged(room, [
        { kind: "to-host", message: { type: "command", kind: "skip", itemId: message.itemId } },
        ack(connection, message.id),
      ]);
    }
  }
}

function onJoin(
  room: RoomState,
  event: Extract<RoomEvent, { kind: "join" }>,
  context: RoomContext,
): Outcome {
  const { connection, id } = event;
  const idHash = hashSecret(event.participantId);
  if (room.kicked.includes(idHash)) {
    return refuse(room, connection, id, "kicked");
  }
  const known = room.participants.find((participant) => participant.idHash === idHash);
  const admitted = (publicId: string, after: RoomState): Outcome =>
    changed(room, after, [
      { kind: "admit", connection, publicId },
      send(connection, { type: "joined", id, publicId }),
    ]);
  if (known) {
    return admitted(
      known.publicId,
      withParticipant(room, known.publicId, (participant) => ({
        ...participant,
        name: event.name,
        connections: participant.connections + 1,
      })),
    );
  }
  if (hashSecret(event.joinSecret) !== room.joinSecretHash) {
    return refuse(room, connection, id, "bad-secret");
  }
  if (!room.settings.joinOpen) {
    return refuse(room, connection, id, "join-closed");
  }
  const guests = room.participants.filter((participant) => participant.kind !== "host").length;
  if (guests >= GUESTS_PER_ROOM) {
    return refuse(room, connection, id, "room-full");
  }
  if (!isPublicIdFree(room, event.newPublicId)) {
    throw new Error(`publicId ${event.newPublicId} is already taken in room ${room.id}`);
  }
  const participant: Participant = {
    publicId: event.newPublicId,
    idHash,
    name: event.name,
    kind: event.participantKind,
    joinedAt: context.now,
    lastServedAt: null,
    connections: 1,
  };
  return admitted(event.newPublicId, {
    ...room,
    participants: [...room.participants, participant],
  });
}

function onResume(
  room: RoomState,
  event: Extract<RoomEvent, { kind: "resume" }>,
  context: RoomContext,
): Outcome {
  if (hashSecret(event.hostSecret) !== room.hostSecretHash) {
    return refuse(room, event.connection, event.id, "bad-secret");
  }
  let after: RoomState = {
    ...withParticipant(room, room.hostPublicId, (host) => ({
      ...host,
      connections: host.connections + 1,
    })),
    hostLeftAt: null,
  };
  for (const started of event.outbox) {
    after = startItem(after, started.itemId, context.now) ?? after;
  }
  return changed(room, after, [
    { kind: "admit", connection: event.connection, publicId: room.hostPublicId },
    send(event.connection, { type: "resumed", id: event.id, restored: event.restored }),
  ]);
}

export function isExpired(room: RoomState, now: number): boolean {
  return (
    now - room.createdAt >= ROOM_MAX_AGE_MS ||
    (room.hostLeftAt !== null && now - room.hostLeftAt >= ROOM_WITHOUT_HOST_MS)
  );
}

function onDisconnected(room: RoomState, publicId: string, now: number): Outcome {
  const participant = room.participants.find((candidate) => candidate.publicId === publicId);
  if (!participant || participant.connections === 0) {
    return unchanged(room);
  }
  const after = withParticipant(room, publicId, (current) => ({
    ...current,
    connections: current.connections - 1,
  }));
  if (participant.connections > 1) {
    return unchanged(after);
  }
  if (participant.kind !== "host") {
    return changed(room, after);
  }
  const failed = after.pending.map((pending) =>
    send(pending.connection, rejected(pending.id, "host-offline")),
  );
  return changed(room, { ...after, pending: [], hostLeftAt: now }, failed);
}

export function reduce(room: RoomState, event: RoomEvent, context: RoomContext): Outcome {
  switch (event.kind) {
    case "join":
      return onJoin(room, event, context);
    case "disconnected":
      return onDisconnected(room, event.publicId, context.now);
    case "resume":
      return onResume(room, event, context);
    case "tick":
      return isExpired(room, context.now)
        ? { room: null, effects: [{ kind: "end", reason: "expired" }] }
        : unchanged(room);
    case "message":
      return onMessage(room, event, context);
    case "timeout": {
      const request = room.pending.find((pending) => pending.requestId === event.requestId);
      if (!request) {
        return unchanged(room);
      }
      const rest = { ...room, pending: room.pending.filter((pending) => pending !== request) };
      return unchanged(rest, [send(request.connection, rejected(request.id, "host-timeout"))]);
    }
  }
}
