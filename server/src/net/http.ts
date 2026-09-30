import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

export type HttpOptions = {
  readonly assetlinksJson: string | null;
  readonly webRoot: string | null;
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

const ROOM_PAGE = /^\/j\/[0-9a-hjkmnp-tv-z]{8}$/;

function notFound(response: ServerResponse): void {
  response.writeHead(404).end();
}

async function sendFile(
  response: ServerResponse,
  webRoot: string,
  relativePath: string,
  cache: string,
): Promise<void> {
  const root = normalize(webRoot + sep);
  const path = normalize(join(root, relativePath));
  if (!path.startsWith(root)) {
    notFound(response);
    return;
  }
  try {
    const body = await readFile(path);
    response
      .writeHead(200, {
        "content-type": CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
        "cache-control": cache,
      })
      .end(body);
  } catch {
    notFound(response); // a missing or unreadable file is a 404 like any unknown path
  }
}

async function route(
  options: HttpOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (request.method !== "GET") {
    notFound(response);
    return;
  }
  if (path === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
    return;
  }
  if (path === "/.well-known/assetlinks.json" && options.assetlinksJson !== null) {
    response.writeHead(200, { "content-type": "application/json" }).end(options.assetlinksJson);
    return;
  }
  if (options.webRoot === null) {
    notFound(response);
    return;
  }
  if (path === "/" || ROOM_PAGE.test(path)) {
    await sendFile(response, options.webRoot, "index.html", "no-cache");
    return;
  }
  if (path.startsWith("/assets/")) {
    await sendFile(response, options.webRoot, path, "public, max-age=31536000, immutable");
    return;
  }
  notFound(response);
}

export function createHttpServer(options: HttpOptions): Server {
  return createServer((request, response) => {
    route(options, request, response).catch((failed: unknown) => {
      response.destroy(failed instanceof Error ? failed : undefined);
    });
  });
}
