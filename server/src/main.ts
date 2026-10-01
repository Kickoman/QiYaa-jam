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

const server = new JamServer({
  publicUrl,
  trustedProxies: parseTrustedProxies(environment.TRUSTED_PROXY),
  roomsFile: join(dataDir, "rooms.json"),
  assetlinksJson,
  webRoot: environment.WEB_ROOT || null,
});

const address = await server.listen(port, host);
log("listening", { host: address.address, port: address.port, publicUrl });

process.on("SIGTERM", () => {
  log("sigterm", { rooms: server.roomCount });
  server.close().then(
    () => process.exit(0),
    (failed: unknown) => {
      log("shutdown-failed", { error: failed instanceof Error ? failed.message : String(failed) });
      process.exit(1);
    },
  );
});
