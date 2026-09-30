import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { addHostKey, HostKeys } from "../../../server/src/host-keys.js";
import { ids } from "../../../server/src/net/ids.js";
import { parseTrustedProxies } from "../../../server/src/net/real-ip.js";
import { JamServer } from "../../../server/src/net/server.js";
import { loadCatalog } from "./catalog.js";
import { runFakeHost } from "./run.js";

const port = Number(process.env.PORT ?? "8090");
const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${port}`;
const dataDir = mkdtempSync(join(tmpdir(), "qiyaa-jam-dev-"));
const hostKey = ids.hostKey();
addHostKey(join(dataDir, "host-keys.json"), "dev", hostKey, new Date());
const webDist = fileURLToPath(new URL("../../../web/dist", import.meta.url));

const server = new JamServer({
  publicUrl,
  trustedProxies: parseTrustedProxies(undefined),
  hostKeys: new HostKeys(join(dataDir, "host-keys.json")),
  roomsFile: null,
  assetlinksJson: null,
  webRoot: existsSync(webDist) ? webDist : null,
});
await server.listen(port, "0.0.0.0");
process.stdout.write(`jam server on ${publicUrl} (data in ${dataDir})\n`);

await runFakeHost({
  url: `ws://localhost:${port}/ws`,
  hostKey,
  name: "Имитатор",
  speed: Number(process.env.SPEED ?? "10"),
  catalog: loadCatalog(),
  dropAfterSeconds: null,
  restartAfterSeconds: null,
});
