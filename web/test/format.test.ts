import { describe, expect, it } from "vitest";
import { coverUrl, formatTime, positionAt } from "../src/format.js";

describe("format", () => {
  it("builds cover links from the template", () => {
    expect(coverUrl("avatars.yandex.net/get-music-content/1/a/%%", 200)).toBe(
      "https://avatars.yandex.net/get-music-content/1/a/200x200",
    );
    expect(coverUrl(undefined, 100)).toBeNull();
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65_999)).toBe("1:05");
    expect(formatTime(-5)).toBe("0:00");
  });

  it("moves the position with the server clock unless paused, and stops at the end", () => {
    const track = { id: "1", title: "t", artists: [], durationMs: 60_000 };
    const playing = {
      source: "item" as const,
      track,
      positionMs: 10_000,
      paused: false,
      reportedAt: 1_000,
    };
    expect(positionAt(playing, 6_000)).toBe(15_000);
    expect(positionAt({ ...playing, paused: true }, 6_000)).toBe(10_000);
    expect(positionAt(playing, 999_999)).toBe(60_000);
  });
});
