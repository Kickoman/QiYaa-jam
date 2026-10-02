import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpServer } from "../src/net/http.js";

const webRoot = mkdtempSync(join(tmpdir(), "jam-web-"));
mkdirSync(join(webRoot, "assets"));
mkdirSync(join(webRoot, "site"));
writeFileSync(join(webRoot, "index.html"), "<!doctype html><title>jam</title>");
for (const language of ["be", "ru", "en"]) {
  writeFileSync(
    join(webRoot, "site", `${language}.html`),
    `<!doctype html><html lang="${language}">`,
  );
}
writeFileSync(join(webRoot, "assets", "app-1a2b.js"), "console.log(1)");
writeFileSync(join(tmpdir(), "outside-web-root.txt"), "secret");

const assetlinks = '[{"relation":["delegate_permission/common.handle_all_urls"]}]';
const server = createHttpServer({ assetlinksJson: assetlinks, webRoot });
const bare = createHttpServer({ assetlinksJson: null, webRoot: null });
let base = "";
let bareBase = "";

async function listen(target: typeof server): Promise<string> {
  await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(target.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  base = await listen(server);
  bareBase = await listen(bare);
});

afterAll(async () => {
  await Promise.all(
    [server, bare].map((target) => new Promise((resolve) => target.close(resolve))),
  );
});

describe("http", () => {
  it("answers /healthz with 200 ok", async () => {
    const response = await fetch(`${base}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok\n");
  });

  it("ROOM-62 serves the landing at /, /ru and /en, the web guest at /j/<roomId>, and their assets", async () => {
    const pages = [
      ["/", '<html lang="be">'],
      ["/ru", '<html lang="ru">'],
      ["/en", '<html lang="en">'],
      ["/j/7k3m9q2x", "<title>jam</title>"],
    ] as const;
    for (const [path, content] of pages) {
      const response = await fetch(base + path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(await response.text()).toContain(content);
    }
    const asset = await fetch(`${base}/assets/app-1a2b.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toContain("immutable");
  });

  it("ROOM-62 answers HEAD like GET, without a body", async () => {
    for (const path of ["/", "/j/7k3m9q2x", "/healthz"]) {
      const response = await fetch(base + path, { method: "HEAD" });
      expect(response.status, path).toBe(200);
      expect(await response.text()).toBe("");
    }
    expect((await fetch(`${base}/missing`, { method: "HEAD" })).status).toBe(404);
  });

  it("serves assetlinks.json from the environment", async () => {
    const response = await fetch(`${base}/.well-known/assetlinks.json`);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.text()).toBe(assetlinks);
  });

  it("ROOM-62 answers everything else with an empty 404, and never leaves the web root", async () => {
    const paths = [
      "/wp-login.php",
      "/.env",
      "/healthz/x",
      "/j/NOTAROOM",
      "/be",
      "/ru/",
      "/site/be.html",
      "/assets/missing.js",
      "/assets/../../outside-web-root.txt",
      "/assets/%2e%2e/%2e%2e/outside-web-root.txt",
    ];
    for (const path of paths) {
      const response = await fetch(base + path);
      expect(response.status, path).toBe(404);
      expect(await response.text()).toBe("");
    }
    expect((await fetch(`${base}/healthz`, { method: "POST" })).status).toBe(404);
  });

  it("refuses a raw path that climbs out of the web root", async () => {
    const port = (server.address() as AddressInfo).port;
    const status = await new Promise<number | undefined>((resolve, reject) => {
      request(
        { host: "127.0.0.1", port, path: "/assets/../../outside-web-root.txt" },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      )
        .on("error", reject)
        .end();
    });
    expect(status).toBe(404);
  });

  it("without a web root or assetlinks, only /healthz answers", async () => {
    for (const path of ["/", "/ru", "/j/7k3m9q2x", "/.well-known/assetlinks.json"]) {
      expect((await fetch(bareBase + path)).status).toBe(404);
    }
    expect((await fetch(`${bareBase}/healthz`)).status).toBe(200);
  });
});
