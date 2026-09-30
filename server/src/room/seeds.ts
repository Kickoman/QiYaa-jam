import { WAVE_SEEDS } from "./limits.js";
import { itemNumber } from "./ordering.js";

export type SeedCandidate = { readonly itemId: string; readonly trackId: string };

export type Fallback = { readonly seeds: readonly string[]; readonly seedsVersion: number };

export function pickSeeds(candidates: readonly SeedCandidate[]): string[] {
  const seeds: string[] = [];
  const sorted = [...candidates].sort(
    (left, right) => itemNumber(right.itemId) - itemNumber(left.itemId),
  );
  for (const candidate of sorted) {
    const seed = `track:${candidate.trackId}`;
    if (!seeds.includes(seed)) {
      seeds.push(seed);
    }
    if (seeds.length === WAVE_SEEDS) {
      break;
    }
  }
  return seeds;
}

export function nextFallback(current: Fallback, candidates: readonly SeedCandidate[]): Fallback {
  const seeds = pickSeeds(candidates);
  const sameSet =
    seeds.length === current.seeds.length && seeds.every((seed) => current.seeds.includes(seed));
  return { seeds, seedsVersion: sameSet ? current.seedsVersion : current.seedsVersion + 1 };
}
