import { log } from "./log.js";
import { createHttpServer } from "./net/http.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? "8090");
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error(`PORT must be a port number, got ${JSON.stringify(process.env.PORT)}`);
}

const server = createHttpServer();
server.listen(port, host, () => {
  log("listening", { host, port });
});

process.on("SIGTERM", () => {
  log("sigterm");
  server.close(() => process.exit(0));
});
