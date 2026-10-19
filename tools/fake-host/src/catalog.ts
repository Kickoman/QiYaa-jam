import { readFileSync } from "node:fs";
import type { CatalogTrack } from "../../../server/src/protocol/generated/types.js";

export function loadCatalog(): readonly CatalogTrack[] {
  const path = new URL("../catalog.json", import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as CatalogTrack[];
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").trim();
}

export function searchCatalog(
  catalog: readonly CatalogTrack[],
  text: string,
  limit: number,
): CatalogTrack[] {
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
