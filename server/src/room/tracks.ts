import type { CatalogTrack, Track } from "../protocol/generated/types.js";

/** A track of the Yandex catalog, not one only the host can play: the only kind an item is (ROOM-66). */
export function isCatalogTrack(track: Track): track is CatalogTrack {
  return track.source !== "host";
}
