import { parseArgs } from "node:util";
import { loadCatalog } from "./catalog.js";
import { runFakeHost } from "./run.js";

const USAGE = `usage: fake-host [--server ws://localhost:8090/ws] [--name Имитатор]
                 [--speed 10] [--drop-after <s>] [--restart-after <s>]
`;

const { values } = parseArgs({
  options: {
    server: { type: "string", default: "ws://localhost:8090/ws" },
    name: { type: "string", default: "Имитатор" },
    speed: { type: "string", default: "10" },
    "drop-after": { type: "string" },
    "restart-after": { type: "string" },
    help: { type: "boolean", default: false },
  },
});

const speed = Number(values.speed);
if (values.help || !(speed > 0)) {
  process.stderr.write(USAGE);
  process.exit(values.help ? 0 : 1);
}

await runFakeHost({
  url: values.server,
  name: values.name,
  speed,
  catalog: loadCatalog(),
  dropAfterSeconds: values["drop-after"] === undefined ? null : Number(values["drop-after"]),
  restartAfterSeconds:
    values["restart-after"] === undefined ? null : Number(values["restart-after"]),
});
