import { createServer, type Server } from "node:http";

export function createHttpServer(): Server {
  return createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "GET" && path === "/healthz") {
      response.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
      return;
    }
    response.writeHead(404).end();
  });
}
