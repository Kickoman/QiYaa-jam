import QRCode from "qrcode";
import type { CatalogTrack, Track } from "../../../server/src/protocol/generated/types.js";
import { FakeHost } from "./fake-host.js";

export type RunOptions = {
  readonly url: string;
  readonly name: string;
  readonly speed: number;
  readonly catalog: readonly CatalogTrack[];
  readonly dropAfterSeconds: number | null;
  readonly restartAfterSeconds: number | null;
  readonly hostTrackAfterSeconds: number | null;
};

/** What `--host-track-after` plays: a track only the host can play (HOST-37). */
const HOST_TRACK: Pick<Track, "id" | "title" | "artists" | "durationMs"> = {
  id: "own-1",
  title: "Свой трэк",
  artists: ["Имитатор"],
  durationMs: 180_000,
};

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

export async function runFakeHost(options: RunOptions): Promise<FakeHost> {
  const log = (line: string): void => {
    print(`[fake-host] ${line}`);
  };
  let host = new FakeHost({ ...options, log });
  const session = await host.create();
  print(`\nJam link: ${session.joinUrl}\n`);
  print(await QRCode.toString(session.joinUrl, { type: "terminal", small: true }));

  if (options.dropAfterSeconds !== null) {
    setTimeout(() => {
      host.drop(true);
    }, options.dropAfterSeconds * 1_000);
  }
  if (options.hostTrackAfterSeconds !== null) {
    setTimeout(() => {
      host.playHostTrack(HOST_TRACK);
    }, options.hostTrackAfterSeconds * 1_000);
  }
  if (options.restartAfterSeconds !== null) {
    setTimeout(() => {
      const before = host;
      log("simulating an app restart: new connection, stored session");
      before.stop();
      host = new FakeHost({ ...options, log });
      host.session = before.session;
      host.snapshot = before.snapshot;
      host.outbox = [...before.outbox];
      host.resume().catch((failed: unknown) => {
        log(`resume after restart failed: ${String(failed)}`);
      });
    }, options.restartAfterSeconds * 1_000);
  }
  return host;
}
