import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTrustedProxies } from "../../../server/src/net/real-ip.js";
import { JamServer } from "../../../server/src/net/server.js";
import { loadCatalog } from "./catalog.js";
import { runFakeHost } from "./run.js";

const port = Number(process.env.PORT ?? "8090");
const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${port}`;
const webDist = fileURLToPath(new URL("../../../web/dist", import.meta.url));

const server = new JamServer({
  publicUrl,
  trustedProxies: parseTrustedProxies(undefined),
  roomsFile: null,
  assetlinksJson: null,
  webRoot: existsSync(webDist) ? webDist : null,
});
await server.listen(port, "0.0.0.0");
process.stdout.write(`jam server on ${publicUrl}\n`);

await runFakeHost({
  url: `ws://localhost:${port}/ws`,
  name: "Имитатор",
  speed: Number(process.env.SPEED ?? "10"),
  catalog: loadCatalog(),
  dropAfterSeconds: null,
  restartAfterSeconds: null,
});
