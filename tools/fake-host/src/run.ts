import QRCode from "qrcode";
import type { Track } from "../../../server/src/protocol/generated/types.js";
import { FakeHost } from "./fake-host.js";

export type RunOptions = {
  readonly url: string;
  readonly hostKey: string;
  readonly name: string;
  readonly speed: number;
  readonly catalog: readonly Track[];
  readonly dropAfterSeconds: number | null;
  readonly restartAfterSeconds: number | null;
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
