import type { SnapshotData } from "../protocol/generated/types.js";
import { ROOM_MAX_AGE_MS } from "./limits.js";
import { itemNumber } from "./ordering.js";
import { nextFallback } from "./seeds.js";
import type { RoomState } from "./types.js";

export function toSnapshot(room: RoomState): SnapshotData {
  return {
    format: 1,
    room: {
      id: room.id,
      hostName: room.hostName,
      hostPublicId: room.hostPublicId,
      joinSecretHash: room.joinSecretHash,
      hostSecretHash: room.hostSecretHash,
      createdAt: room.createdAt,
      version: room.version,
      nextItemNumber: room.nextItemNumber,
      settings: room.settings,
      participants: room.participants.map((participant) => ({
        publicId: participant.publicId,
        idHash: participant.idHash,
        name: participant.name,
        kind: participant.kind,
        joinedAt: participant.joinedAt,
        lastServedAt: participant.lastServedAt,
      })),
      kicked: [...room.kicked],
      queue: room.queue.map((item) => ({ ...item })),
      recent: [...room.recent],
      nowPlaying: room.nowPlaying,
      fallback: { seeds: [...room.fallback.seeds], seedsVersion: room.fallback.seedsVersion },
    },
  };
}

export function snapshotProblem(data: SnapshotData, now: number): string | null {
  const room = data.room;
  if (now - room.createdAt >= ROOM_MAX_AGE_MS) {
    return "older than the maximum room age";
  }
  const publicIds = room.participants.map((participant) => participant.publicId);
  if (new Set(publicIds).size !== publicIds.length) {
    return "two participants share a publicId";
  }
  const hosts = room.participants.filter((participant) => participant.kind === "host");
  if (hosts.length !== 1 || hosts[0]?.publicId !== room.hostPublicId || hosts[0].idHash !== null) {
    return "the host is not exactly one participant of kind host";
  }
  if (
    room.participants.some(
      (participant) => participant.kind !== "host" && participant.idHash === null,
    )
  ) {
    return "a guest has no idHash";
  }
  const itemIds = [
    ...room.queue.map((item) => item.itemId),
    ...room.recent.map((item) => item.itemId),
    ...(room.nowPlaying.itemId === undefined ? [] : [room.nowPlaying.itemId]),
  ];
  if (new Set(itemIds).size !== itemIds.length) {
    return "an itemId appears twice";
  }
  if (itemIds.some((itemId) => itemNumber(itemId) >= room.nextItemNumber)) {
    return "an itemId is not below nextItemNumber";
  }
  return null;
}

export function fromSnapshot(data: SnapshotData, now: number): RoomState {
  const snapshot = data.room;
  const room: RoomState = {
    id: snapshot.id,
    hostName: snapshot.hostName,
    hostPublicId: snapshot.hostPublicId,
    hostSecretHash: snapshot.hostSecretHash,
    joinSecretHash: snapshot.joinSecretHash,
    createdAt: snapshot.createdAt,
    version: snapshot.version,
    nextItemNumber: snapshot.nextItemNumber,
    settings: snapshot.settings,
    participants: snapshot.participants.map((participant) => ({ ...participant, connections: 0 })),
    kicked: [...snapshot.kicked],
    queue: snapshot.queue.map((item) => ({ ...item })),
    recent: [...snapshot.recent],
    nowPlaying: snapshot.nowPlaying,
    fallback: snapshot.fallback,
    searchCache: new Map(),
    pending: [],
    hostLeftAt: now,
  };
  const candidates = [
    ...room.queue.map((item) => ({ itemId: item.itemId, trackId: item.track.id })),
    ...room.recent.map((item) => ({ itemId: item.itemId, trackId: item.track.id })),
    ...(room.nowPlaying.itemId !== undefined && room.nowPlaying.track
      ? [{ itemId: room.nowPlaying.itemId, trackId: room.nowPlaying.track.id }]
      : []),
  ];
  return { ...room, fallback: nextFallback(room.fallback, candidates) };
}
