import { readFileSync } from "node:fs";
import type { Track } from "../../../server/src/protocol/generated/types.js";

export function loadCatalog(): readonly Track[] {
  const path = new URL("../catalog.json", import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Track[];
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").trim();
}

export function searchCatalog(catalog: readonly Track[], text: string, limit: number): Track[] {
  const words = normalized(text)
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return catalog
    .filter((track) => {
      const haystack = normalized(`${track.title} ${track.artists.join(" ")}`);
      return words.every((word) => haystack.includes(word));
    })
    .slice(0, limit);
}
