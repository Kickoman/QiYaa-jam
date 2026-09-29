import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 8090);
const TRUSTED_PROXIES = (process.env.TRUSTED_PROXY ?? "127.0.0.1").split(",").map((entry) => entry.trim());
const PING_INTERVAL_MS = 25_000;
const DEAD_AFTER_MS = 60_000;

const page = readFileSync(new URL("./index.html", import.meta.url));
let nextConnectionId = 1;

function log(event, fields = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}

function addresses(request) {
  const peer = (request.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  const header = request.headers["x-real-ip"];
  const trusted = TRUSTED_PROXIES.includes(peer);
  return { peer, realIpHeader: header ?? null, ip: trusted && typeof header === "string" ? header : peer, trusted };
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (request.method === "GET" && path === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
    return;
  }
  if (request.method === "GET" && path === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(page);
    log("page", addresses(request));
    return;
  }
  response.writeHead(404).end();
});

const sockets = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });

sockets.on("connection", (socket, request) => {
  const id = nextConnectionId++;
  const origin = addresses(request);
  const openedAt = Date.now();
  let lastPongAt = openedAt;
  let pongs = 0;
  let messages = 0;

  log("open", { id, ...origin, origin: request.headers.origin ?? null, agent: request.headers["user-agent"] ?? null });
  socket.send(JSON.stringify({ type: "hello", id, seenIp: origin.ip, peer: origin.peer, trusted: origin.trusted, serverTime: openedAt }));

  const pinger = setInterval(() => {
    if (Date.now() - lastPongAt > DEAD_AFTER_MS) {
      log("dead", { id, ip: origin.ip, silentMs: Date.now() - lastPongAt });
      socket.terminate();
      return;
    }
    socket.ping();
  }, PING_INTERVAL_MS);

  socket.on("pong", () => {
    lastPongAt = Date.now();
    pongs++;
  });

  socket.on("message", (data) => {
    messages++;
    socket.send(JSON.stringify({ type: "echo", data: data.toString(), serverTime: Date.now() }));
  });

  socket.on("close", (code, reason) => {
    clearInterval(pinger);
    log("close", { id, ip: origin.ip, code, reason: reason.toString(), durationS: Math.round((Date.now() - openedAt) / 1000), pongs, messages });
  });

  socket.on("error", (failed) => log("error", { id, ip: origin.ip, message: failed.message }));
});

server.listen(PORT, HOST, () => log("listening", { host: HOST, port: PORT, trustedProxies: TRUSTED_PROXIES }));

process.on("SIGTERM", () => {
  log("sigterm", { open: sockets.clients.size });
  for (const socket of sockets.clients) socket.close(1001, "server restart");
  server.close(() => process.exit(0));
});
