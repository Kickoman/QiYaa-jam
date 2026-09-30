import type { Room, Track } from "../../server/src/protocol/generated/types.js";
import type { AddState, Reason } from "./session.js";

export type AddButton =
  | { readonly kind: "add" }
  | { readonly kind: "sending" }
  | { readonly kind: "yours" }
  | { readonly kind: "queued-by"; readonly name: string }
  | { readonly kind: "limit" }
  | { readonly kind: "failed"; readonly reason: Reason };

export function waitingOfYours(room: Room): number {
  return room.queue.filter((item) => item.addedBy === room.you.publicId).length;
}

export function addButton(
  track: Track,
  room: Room,
  adds: ReadonlyMap<string, AddState>,
  names: ReadonlyMap<string, string>,
): AddButton {
  const waiting = room.queue.find((item) => item.track.id === track.id);
  if (waiting) {
    return waiting.addedBy === room.you.publicId
      ? { kind: "yours" }
      : { kind: "queued-by", name: names.get(waiting.addedBy) ?? "?" };
  }
  const state = adds.get(track.id);
  if (state === "sending") {
    return { kind: "sending" };
  }
  if (!room.you.isHost && waitingOfYours(room) >= room.settings.maxPendingPerGuest) {
    return { kind: "limit" };
  }
  if (
    state !== undefined &&
    state !== "added" &&
    state !== "duplicate" &&
    state !== "queue-limit"
  ) {
    return { kind: "failed", reason: state };
  }
  return { kind: "add" };
}
