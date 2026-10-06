import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { emit, type LogFields } from "../log.js";
import { clientIp } from "./real-ip.js";

export type HttpOptions = {
  readonly assetlinksJson: string | null;
  readonly webRoot: string | null;
  /** Proxies whose X-Real-IP names the client (ROOM-60); none: the socket's address. */
  readonly trustedProxies?: ReadonlySet<string>;
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

/** The landing in each language (web/site); `/` is Belarusian, the apps' default. */
const SITE_PAGES: ReadonlyMap<string, string> = new Map([
  ["/", "site/be.html"],
  ["/ru", "site/ru.html"],
  ["/en", "site/en.html"],
]);

const FIXED_ROUTES: ReadonlySet<string> = new Set([
  "/healthz",
  "/.well-known/assetlinks.json",
  "/ws",
]);

/** Header values in a log are cut to this many characters. */
const LOGGED_TEXT = 200;

/**
 * The route a request is counted under. The set of pages is small and closed: a room page is
 * `/j/{roomId}` (ROOM-63: no roomId in a log), and anything unknown is `/*`, so a scanner cannot
 * add endpoints to the log store; its path goes along as `raw_path`.
 */
export function routeOf(path: string): string {
  if (SITE_PAGES.has(path) || FIXED_ROUTES.has(path)) {
    return path;
  }
  if (ROOM_PAGE.test(path)) {
    return "/j/{roomId}";
  }
  return path.startsWith("/assets/") ? "/assets/*" : "/*";
}

/** Requests too many and too dull to keep: logged at debug, which the default level drops. */
const QUIET_ROUTES: ReadonlySet<string> = new Set(["/assets/*", "/healthz"]);

function headerText(value: string | string[] | undefined): string {
  const text = (Array.isArray(value) ? value[0] : value) ?? "";
  return text.slice(0, LOGGED_TEXT);
}

/** The site a page was opened from, by host only; none for the server's own pages. */
function referrerHost(request: IncomingMessage): string {
  try {
    const referrer = new URL(headerText(request.headers.referer));
    return referrer.host === request.headers.host ? "" : referrer.host;
  } catch {
    return "";
  }
}

/** The fields of an `http_request` event that describe the client. */
export function clientFields(
  request: IncomingMessage,
  trustedProxies: ReadonlySet<string>,
): LogFields {
  const peer = (request.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  return {
    client_ip: clientIp(request.socket.remoteAddress, request.headers["x-real-ip"], trustedProxies),
    peer_ip: peer,
    user_agent: headerText(request.headers["user-agent"]),
  };
}

/** A path that is not a route, as a scanner sent it, with any room id hidden (ROOM-63). */
function rawPath(path: string): string {
  return (path.startsWith("/j/") ? "/j/…" : path).slice(0, LOGGED_TEXT);
}

export function logRequest(
  request: IncomingMessage,
  status: number,
  startedAt: bigint,
  trustedProxies: ReadonlySet<string>,
  extra: LogFields = {},
): void {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const route = routeOf(path);
  const level = status >= 500 ? "error" : QUIET_ROUTES.has(route) ? "debug" : "info";
  const referrer = SITE_PAGES.has(path) || ROOM_PAGE.test(path) ? referrerHost(request) : "";
  emit(level, "http_request", "http_request", {
    http_method: request.method ?? "",
    http_path: route,
    http_status: status,
    duration_ms: Math.round(Number(process.hrtime.bigint() - startedAt) / 10_000) / 100,
    ...clientFields(request, trustedProxies),
    ...(referrer ? { referrer_host: referrer } : {}),
    ...(route === "/*" ? { raw_path: rawPath(path) } : {}),
    ...extra,
  });
}

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
  // Node sends no body in answer to HEAD.
  if (request.method !== "GET" && request.method !== "HEAD") {
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
  const sitePage = SITE_PAGES.get(path);
  if (sitePage !== undefined) {
    await sendFile(response, options.webRoot, sitePage, "no-cache");
    return;
  }
  if (ROOM_PAGE.test(path)) {
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
  const trustedProxies = options.trustedProxies ?? new Set<string>();
  return createServer((request, response) => {
    const startedAt = process.hrtime.bigint();
    response.on("finish", () => {
      logRequest(request, response.statusCode, startedAt, trustedProxies);
    });
    route(options, request, response).catch((failed: unknown) => {
      emit("error", "internal", "http_failed", {
        error: failed instanceof Error ? failed.message : String(failed),
      });
      response.destroy(failed instanceof Error ? failed : undefined);
    });
  });
}
