import { join } from "node:path";
import { log } from "./log.js";
import { parseTrustedProxies } from "./net/real-ip.js";
import { JamServer } from "./net/server.js";

const environment = process.env;
const host = environment.HOST ?? "0.0.0.0";
const port = Number(environment.PORT ?? "8090");
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error(`PORT must be a port number, got ${JSON.stringify(environment.PORT)}`);
}
const publicUrl = environment.PUBLIC_URL ?? `http://localhost:${port}`;
new URL(publicUrl);
const assetlinksJson = environment.ASSETLINKS_JSON || null;
if (assetlinksJson !== null) {
  JSON.parse(assetlinksJson);
}
const dataDir = environment.DATA_DIR ?? "/data";

const version = environment.JAM_VERSION || "dev";

const server = new JamServer({
  publicUrl,
  trustedProxies: parseTrustedProxies(environment.TRUSTED_PROXY),
  roomsFile: join(dataDir, "rooms.json"),
  assetlinksJson,
  webRoot: environment.WEB_ROOT || null,
});

const address = await server.listen(port, host);
// The log store counts restarts by this event (a crash loop is an alert).
log.info("startup", { version, host: address.address, port: address.port, publicUrl });

process.on("SIGTERM", () => {
  log.info("shutdown", { rooms: server.roomCount });
  server.close().then(
    () => process.exit(0),
    (failed: unknown) => {
      log.error("shutdown_failed", {
        error: failed instanceof Error ? failed.message : String(failed),
      });
      process.exit(1);
    },
  );
});
