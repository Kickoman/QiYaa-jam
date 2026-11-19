import type { QueueItem, Room, StateMessage } from "../protocol/generated/types.js";
import { orderQueue } from "./ordering.js";
import { isHostOnline } from "./room.js";
import type { RoomState } from "./types.js";

export function orderedQueue(room: RoomState): QueueItem[] {
  const lastServedAt = new Map<string, number>();
  for (const participant of room.participants) {
    if (participant.lastServedAt !== null) {
      lastServedAt.set(participant.publicId, participant.lastServedAt);
    }
  }
  return orderQueue(room.queue, room.settings.order, lastServedAt).map((item) => ({
    itemId: item.itemId,
    track: item.track,
    addedBy: item.addedBy,
    addedAt: item.addedAt,
    pinned: item.pinnedAt !== null,
  }));
}

export function roomFor(room: RoomState, publicId: string): Room {
  return {
    id: room.id,
    hostName: room.hostName,
    hostOnline: isHostOnline(room),
    settings: room.settings,
    you: { publicId, isHost: publicId === room.hostPublicId },
    participants: room.participants.map((participant) => ({
      publicId: participant.publicId,
      name: participant.name,
      kind: participant.kind,
      online: participant.connections > 0,
      pending: room.queue.filter((item) => item.addedBy === participant.publicId).length,
    })),
    nowPlaying: room.nowPlaying,
    queue: orderedQueue(room),
    recent: [...room.recent],
    searchSources: [...(room.searchSources ?? ["yandex"])],
    fallback: { seeds: [...room.fallback.seeds], seedsVersion: room.fallback.seedsVersion },
  };
}

export function stateFor(
  room: RoomState,
  publicId: string,
  now: number,
  protocol = 2,
): StateMessage {
  const view = roomFor(room, publicId);
  if (protocol === 1) {
    delete view.searchSources;
    view.queue = view.queue.filter(({ track }) => track.source !== "spotify");
    view.recent = view.recent.filter(({ track }) => track.source !== "spotify");
    const { track, positionMs, paused, reportedAt } = view.nowPlaying;
    if (track?.source === "spotify") {
      view.nowPlaying = {
        source: "wave",
        positionMs,
        paused,
        reportedAt,
        track: { ...track, source: "host" },
      };
    }
  }
  return { type: "state", version: room.version, serverTime: now, room: view };
}
