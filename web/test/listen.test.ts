import { describe, expect, it } from "vitest";
import type { NowPlaying } from "../../server/src/protocol/generated/types.js";
import { Listener, type AudioLike } from "../src/listen.js";

const LINK_A =
  "https://s1.storage.yandex.net/get-mp3/0123456789abcdef0123456789abcdef/00065cd937b03427/a.mp3";
const LINK_B =
  "https://s1.storage.yandex.net/get-mp3/0123456789abcdef0123456789abcdef/00065cd937b03427/b.mp3";

class FakeAudio implements AudioLike {
  src = "";
  currentTime = 0;
  paused = true;
  ended = false;
  readyState = 0;
  duration = Number.NaN;
  plays = 0;
  refuse: string | null = null;
  private readonly listeners = new Map<string, (() => void)[]>();

  play(): Promise<void> {
    this.plays += 1;
    if (this.refuse) {
      return Promise.reject(new DOMException("refused", this.refuse));
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  load(): void {
    this.readyState = 0;
  }

  removeAttribute(name: string): void {
    if (name === "src") {
      this.src = "";
    }
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  /** The file's head arrived: the length is known and seeking works. */
  loaded(durationS = 200): void {
    this.readyState = 1;
    this.duration = durationS;
    this.emit("loadedmetadata");
  }
}

function setup() {
  const audio = new FakeAudio();
  let serverNow = 100_000;
  let now = 0;
  const changes: boolean[] = [];
  const listener = new Listener(
    audio,
    () => serverNow,
    () => now,
    (listening) => changes.push(listening),
  );
  return {
    audio,
    listener,
    changes,
    advance: (ms: number) => {
      serverNow += ms;
      now += ms;
    },
  };
}

function item(link: string | undefined, positionMs: number, paused = false): NowPlaying {
  return {
    source: "item",
    itemId: "i1",
    track: { id: "1", title: "t", artists: [], durationMs: 200_000 },
    addedBy: "a4n8q1",
    positionMs,
    paused,
    reportedAt: 95_000,
    ...(link ? { listenUrl: link } : {}),
  };
}

describe("listening along", () => {
  it("plays the host's file at the room's progress once its head arrives", () => {
    const { audio, listener, changes } = setup();
    listener.follow(item(LINK_A, 30_000));
    expect(audio.src).toBe("");
    listener.start();
    expect(changes).toEqual([true]);
    expect(audio.src).toBe(LINK_A);
    expect(audio.paused).toBe(false);
    audio.loaded();
    expect(audio.currentTime).toBe(35); // 30 s reported 5 s ago
  });

  it("seeks again only when more than 2 s off", () => {
    const { audio, listener, advance } = setup();
    listener.follow(item(LINK_A, 30_000));
    listener.start();
    audio.loaded();
    audio.currentTime = 36.5;
    advance(1_000);
    listener.sync();
    expect(audio.currentTime).toBe(36.5);
    audio.currentTime = 40;
    listener.sync();
    expect(audio.currentTime).toBe(36);
  });

  it("follows the host's pause, a new track and a host that stops sharing", () => {
    const { audio, listener } = setup();
    listener.start();
    listener.follow(item(LINK_A, 30_000));
    audio.loaded();
    listener.follow(item(LINK_A, 50_000, true));
    expect(audio.paused).toBe(true);
    expect(audio.currentTime).toBe(50);
    listener.follow(item(LINK_B, 0));
    expect(audio.src).toBe(LINK_B);
    expect(audio.paused).toBe(false);
    listener.follow(item(undefined, 1_000));
    expect(audio.paused).toBe(true);
    expect(listener.isListening).toBe(true);
  });

  it("a pause from outside ends the listening; its own pauses and the end of a file do not", () => {
    const { audio, listener, changes, advance } = setup();
    listener.start();
    listener.follow(item(LINK_A, 30_000));
    audio.loaded();
    listener.follow(item(LINK_A, 30_000, true));
    audio.emit("pause"); // its own
    expect(listener.isListening).toBe(true);
    listener.follow(item(LINK_A, 30_000));
    audio.ended = true;
    audio.paused = true;
    audio.emit("pause"); // the file ended
    expect(listener.isListening).toBe(true);
    audio.ended = false;
    advance(5_000);
    audio.paused = true;
    audio.emit("pause"); // the lock screen
    expect(listener.isListening).toBe(false);
    expect(changes).toEqual([true, false]);
    expect(audio.src).toBe("");
  });

  it("a browser that refuses to play ends the listening; an aborted play does not", async () => {
    const { audio, listener } = setup();
    listener.follow(item(LINK_A, 0));
    audio.refuse = "AbortError";
    listener.start();
    await Promise.resolve();
    expect(listener.isListening).toBe(true);
    audio.refuse = "NotAllowedError";
    listener.sync();
    await Promise.resolve();
    expect(listener.isListening).toBe(false);
  });
});
