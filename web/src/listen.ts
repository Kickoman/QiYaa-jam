import type { NowPlaying } from "../../server/src/protocol/generated/types.js";
import { positionAt } from "./format.js";

/** A guest that listens seeks again when it is off the room's progress by more than this. */
export const DRIFT_SECONDS = 2;
/** A pause event this soon after the listener's own pause or new link is the listener's. */
const OWN_PAUSE_MS = 1_000;
const HAVE_METADATA = 1;

/** What the listener uses of an HTMLAudioElement; tests pass a fake. */
export interface AudioLike {
  src: string;
  currentTime: number;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly readyState: number;
  readonly duration: number;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: () => void): void;
}

/**
 * Listening along (experimental, spec/jam/protocol/README.md): plays the host's `listenUrl` on
 * this device at the room's progress, follows the host's pause, track and link, and seeks again
 * when it drifts more than DRIFT_SECONDS. A pause from outside (the lock screen, a headset, a
 * call) ends the listening, so the next state does not start the sound again.
 */
export class Listener {
  private link: string | null = null;
  private nowPlaying: NowPlaying | null = null;
  private listening = false;
  private ownPauseAt = -Infinity;

  constructor(
    private readonly audio: AudioLike,
    private readonly serverNow: () => number,
    private readonly clock: () => number,
    private readonly onChange: (listening: boolean) => void,
  ) {
    audio.addEventListener("loadedmetadata", () => {
      this.sync();
    });
    audio.addEventListener("pause", () => {
      const own = this.clock() - this.ownPauseAt < OWN_PAUSE_MS;
      if (this.listening && !own && !this.audio.ended) {
        this.stop();
      }
    });
  }

  get isListening(): boolean {
    return this.listening;
  }

  /** From a tap: browsers start sound only after a gesture. */
  start(): void {
    this.listening = true;
    this.onChange(true);
    this.sync();
  }

  stop(): void {
    this.listening = false;
    this.link = null;
    this.pauseAudio();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.onChange(false);
  }

  follow(nowPlaying: NowPlaying): void {
    this.nowPlaying = nowPlaying;
    this.sync();
  }

  /** On every state and once a second while listening. */
  sync(): void {
    if (!this.listening) {
      return;
    }
    const playing = this.nowPlaying;
    const link = playing && playing.source !== "idle" ? playing.listenUrl : undefined;
    if (!playing || !link) {
      this.pauseAudio(); // nothing plays, or the host stopped sharing: wait for the next link
      return;
    }
    if (link !== this.link) {
      this.link = link;
      this.ownPauseAt = this.clock();
      this.audio.src = link;
    }
    if (this.audio.readyState >= HAVE_METADATA) {
      const target = positionAt(playing, this.serverNow()) / 1000;
      const nearTheEnd = Number.isFinite(this.audio.duration) && target > this.audio.duration - 1;
      if (!nearTheEnd && Math.abs(this.audio.currentTime - target) > DRIFT_SECONDS) {
        this.audio.currentTime = target;
      }
    }
    if (playing.paused) {
      this.pauseAudio();
    } else if (this.audio.paused) {
      this.audio.play().catch((failed: unknown) => {
        // A new link aborts the last play; only a refusal to play at all ends the listening.
        if (failed instanceof DOMException && failed.name === "NotAllowedError") {
          this.stop();
        }
      });
    }
  }

  private pauseAudio(): void {
    if (!this.audio.paused) {
      this.ownPauseAt = this.clock();
      this.audio.pause();
    }
  }
}
