import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureLog } from "../../src/log.js";
import { parseDownloadClick } from "../../src/net/downloads.js";
import { createHttpServer } from "../../src/net/http.js";

const logged: Record<string, unknown>[] = [];
configureLog({
  write: (line) => logged.push(JSON.parse(line) as Record<string, unknown>),
  level: "debug",
});

const server = createHttpServer({
  assetlinksJson: null,
  webRoot: null,
  trustedProxies: new Set(["127.0.0.1"]),
});
let url = "";
let ipCounter = 0;

const CLICK = {
  file: "deb",
  place: "download",
  language: "ru",
  version: "0.6.0",
  browserLanguage: "ru-RU",
  referrer: "t.me",
};

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/download`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("download clicks", () => {
  it("TEL-14 a click is 204, and the request's own line holds it at info", async () => {
    const before = logged.length;
    const response = await post(JSON.stringify(CLICK), "198.51.100.7");
    expect(response.status).toBe(204);
    await expect.poll(() => since(before)).toHaveLength(1);
    expect(since(before)[0]).toMatchObject({
      stream: "http_request",
      level: "info",
      event: "http_request",
      http_method: "POST",
      http_path: "/api/download",
      http_status: 204,
      client_ip: "198.51.100.7",
      user_agent: "QiYaa test",
      file: "deb",
      place: "download",
      page_language: "ru",
      app_version: "0.6.0",
      browser_language: "ru-RU",
      referrer_host: "t.me",
    });
  });

  it("TEL-14 takes every file from both places, the optional fields left out", async () => {
    const files = ["windows-setup", "windows-zip", "appimage", "deb", "dmg", "apk"];
    for (const [file, place] of [
      ...files.map((name) => [name, "download"] as const),
      ["apk", "android"] as const,
    ]) {
      const before = logged.length;
      const response = await post(JSON.stringify({ file, place, language: "be" }));
      expect(response.status, file).toBe(204);
      await expect.poll(() => since(before)).toHaveLength(1);
      const line = since(before)[0];
      expect(line).toMatchObject({ file, place, page_language: "be" });
      expect(line).not.toHaveProperty("app_version");
      expect(line).not.toHaveProperty("browser_language");
      expect(line).not.toHaveProperty("referrer_host");
    }
  });

  it("TEL-15 refuses what is not a click, and logs only the request", async () => {
    const bodies = [
      "{not json",
      "",
      "[]",
      '"deb"',
      JSON.stringify({ ...CLICK, name: "Аня" }),
      JSON.stringify({ ...CLICK, file: "exe" }),
      JSON.stringify({ ...CLICK, language: "de" }),
      JSON.stringify({ ...CLICK, place: "top" }),
      JSON.stringify({ ...CLICK, version: "latest" }),
      JSON.stringify({ ...CLICK, version: "1.2.3".padEnd(21, "0") }),
      JSON.stringify({ ...CLICK, referrer: "https://t.me/x" }),
      JSON.stringify({ ...CLICK, browserLanguage: "ru RU" }),
      JSON.stringify({ ...CLICK, browserLanguage: "x".repeat(36) }),
      JSON.stringify({ place: "download", language: "ru" }),
    ];
    for (const body of bodies) {
      const before = logged.length;
      expect((await post(body)).status, body).toBe(400);
      await expect.poll(() => since(before)).toHaveLength(1);
      const line = since(before)[0];
      expect(line, body).toMatchObject({
        level: "info",
        http_path: "/api/download",
        http_status: 400,
      });
      expect(line, body).not.toHaveProperty("file");
      expect(JSON.stringify(line)).not.toContain("Аня");
    }
  });

  it("TEL-15 a body over 1 KiB is 413", async () => {
    const response = await post(JSON.stringify({ ...CLICK, padding: "x".repeat(1100) }));
    expect(response.status).toBe(413);
  });

  it("TEL-15 over 10 clicks a minute from one address is 429", async () => {
    const statuses: number[] = [];
    for (let click = 0; click < 10; click++) {
      statuses.push((await post(JSON.stringify(CLICK), "192.0.2.210")).status);
    }
    expect(statuses).toEqual(Array<number>(10).fill(204));
    const refused = await post(JSON.stringify(CLICK), "192.0.2.210");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("60");
  });

  it("only POST is taken", async () => {
    expect((await fetch(url)).status).toBe(404);
  });

  it("parseDownloadClick takes a click of the spec's fields and nothing else", () => {
    expect(parseDownloadClick(CLICK)).toEqual(CLICK);
    expect(parseDownloadClick({ file: "apk", place: "android", language: "en" })).toEqual({
      file: "apk",
      place: "android",
      language: "en",
    });
    expect(parseDownloadClick(null)).toBeNull();
    expect(parseDownloadClick({ ...CLICK, version: 6 })).toBeNull();
  });
});

/** A click from its own address, so the per-IP limit stays out of the way. */
async function post(body: string, ip = `203.0.113.${++ipCounter}`): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "x-real-ip": ip, "user-agent": "QiYaa test" },
    body,
  });
}

function since(before: number): Record<string, unknown>[] {
  return logged.slice(before);
}
