import type { LogFields } from "../log.js";
import type { RoomState } from "../room/types.js";

// What happens in rooms, as log events and per-room tallies. ROOM-63: only kinds and counts, never
// names, titles, roomIds or participantIds; a room is told apart only by its tally's lifetime.

export type RoomChange = { readonly event: string; readonly fields: LogFields };

/** A room's counts from creation, or from the server's restart, to its end. */
export type Tally = {
  readonly startedAt: number;
  readonly restored: boolean;
  guestsJoined: number;
  guestTracks: number;
  hostTracks: number;
  playedItems: number;
  playedVibe: number;
  searches: number;
  kicked: number;
  shared: boolean;
};

export function newTally(startedAt: number, restored: boolean): Tally {
  return {
    startedAt,
    restored,
    guestsJoined: 0,
    guestTracks: 0,
    hostTracks: 0,
    playedItems: 0,
    playedVibe: 0,
    searches: 0,
    kicked: 0,
    shared: false,
  };
}

function guests(room: RoomState): number {
  return room.participants.filter((participant) => participant.kind !== "host").length;
}

function playingKey(room: RoomState): string {
  const { source, itemId, track } = room.nowPlaying;
  return source === "idle" ? "idle" : `${source}/${itemId ?? ""}/${track?.id ?? ""}`;
}

/** The events between two states of one room, and the tally they add to. */
export function roomChanges(
  before: RoomState,
  after: RoomState,
  tally: Tally,
  now: number,
): RoomChange[] {
  const changes: RoomChange[] = [];
  const known = new Set(before.participants.map((participant) => participant.publicId));
  for (const participant of after.participants) {
    if (!known.has(participant.publicId) && participant.kind !== "host") {
      tally.guestsJoined++;
      changes.push({
        event: "guest_joined",
        fields: { kind: participant.kind, guests: guests(after) },
      });
    }
  }
  if (after.kicked.length > before.kicked.length) {
    tally.kicked += after.kicked.length - before.kicked.length;
    changes.push({ event: "guest_kicked", fields: { guests: guests(after) } });
  }

  const seen = new Set([...before.queue, ...before.recent].map((item) => item.itemId));
  for (const item of after.queue) {
    if (!seen.has(item.itemId)) {
      const by = item.addedBy === after.hostPublicId ? "host" : "guest";
      if (by === "host") {
        tally.hostTracks++;
      } else {
        tally.guestTracks++;
      }
      changes.push({ event: "track_added", fields: { by, queue: after.queue.length } });
    }
  }

  const playing = after.nowPlaying;
  if (playing.source !== "idle" && playingKey(after) !== playingKey(before)) {
    const listen = playing.listenUrl !== undefined;
    if (playing.source === "item") {
      tally.playedItems++;
    } else {
      tally.playedVibe++;
    }
    const addedBy = playing.addedBy;
    const by = addedBy === undefined ? "" : addedBy === after.hostPublicId ? "host" : "guest";
    changes.push({
      event: "track_started",
      fields: {
        source: playing.source === "item" ? "item" : "vibe",
        ...(by ? { by } : {}),
        listen,
      },
    });
  }
  if (playing.listenUrl !== undefined && !tally.shared) {
    tally.shared = true;
    changes.push({ event: "listen_shared", fields: {} });
  }

  if (before.hostLeftAt === null && after.hostLeftAt !== null) {
    changes.push({ event: "host_left", fields: {} });
  } else if (before.hostLeftAt !== null && after.hostLeftAt === null) {
    changes.push({
      event: "host_back",
      fields: { away_s: Math.round((now - before.hostLeftAt) / 1000) },
    });
  }

  const { order, guestsCanSkip, joinOpen, maxPendingPerGuest } = after.settings;
  if (JSON.stringify(after.settings) !== JSON.stringify(before.settings)) {
    changes.push({
      event: "settings_changed",
      fields: {
        order,
        guests_can_skip: guestsCanSkip,
        join_open: joinOpen,
        max_pending: maxPendingPerGuest,
      },
    });
  }
  return changes;
}

/** The `room_ended` event: how long the room lived and what happened in it. */
export function roomSummary(tally: Tally, reason: string, now: number): LogFields {
  return {
    reason,
    minutes: Math.round((now - tally.startedAt) / 60_000),
    restored: tally.restored,
    guests: tally.guestsJoined,
    guest_tracks: tally.guestTracks,
    host_tracks: tally.hostTracks,
    played_items: tally.playedItems,
    played_vibe: tally.playedVibe,
    searches: tally.searches,
    kicked: tally.kicked,
    listen_shared: tally.shared,
  };
}
