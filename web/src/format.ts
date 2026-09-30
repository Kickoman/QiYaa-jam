import type { NowPlaying } from "../../server/src/protocol/generated/types.js";

export function coverUrl(coverUri: string | undefined, size: 100 | 200 | 400): string | null {
  return coverUri ? `https://${coverUri.replace("%%", `${size}x${size}`)}` : null;
}

export function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function positionAt(nowPlaying: NowPlaying, serverNow: number): number {
  const elapsed = nowPlaying.paused ? 0 : Math.max(0, serverNow - nowPlaying.reportedAt);
  const position = nowPlaying.positionMs + elapsed;
  const duration = nowPlaying.track?.durationMs;
  return duration === undefined ? position : Math.min(position, duration);
}
