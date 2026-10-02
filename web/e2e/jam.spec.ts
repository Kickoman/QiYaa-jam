import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { parseTrustedProxies } from "../../server/src/net/real-ip.js";
import { JamServer } from "../../server/src/net/server.js";
import { loadCatalog } from "../../tools/fake-host/src/catalog.js";
import { FakeHost, type Session } from "../../tools/fake-host/src/fake-host.js";

const WEB_ROOT = fileURLToPath(new URL("../dist", import.meta.url));
const catalog = loadCatalog();
let nextPort = 18_200;

class World {
  readonly port = nextPort++;
  readonly base = `http://127.0.0.1:${this.port}`;
  readonly dataDir = mkdtempSync(join(tmpdir(), "jam-e2e-"));
  server: JamServer | null = null;
  hosts: FakeHost[] = [];

  async startServer(keepRooms: boolean): Promise<void> {
    this.server = new JamServer({
      publicUrl: this.base,
      trustedProxies: parseTrustedProxies(undefined),
      roomsFile: keepRooms ? join(this.dataDir, "rooms.json") : null,
      assetlinksJson: null,
      webRoot: WEB_ROOT,
      timing: { snapshotIntervalMs: 200 },
    });
    await this.server.listen(this.port, "127.0.0.1");
  }

  async stopServer(): Promise<void> {
    await this.server?.close();
    this.server = null;
  }

  host(listenUrl?: (track: { readonly id: string }) => string): FakeHost {
    const host = new FakeHost({
      url: `ws://127.0.0.1:${this.port}/ws`,
      name: "Маша",
      catalog,
      speed: 1,
      ...(listenUrl ? { listenUrl } : {}),
    });
    this.hosts.push(host);
    return host;
  }

  async end(): Promise<void> {
    for (const host of this.hosts) {
      host.stop();
    }
    await this.stopServer();
  }
}

async function guest(browser: Browser, session: Session, name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(session.joinUrl);
  await page.fill("#name", name);
  await page.click(".join button[type=submit]");
  await expect(page.locator("section.queue")).toBeVisible();
  await expect(page).not.toHaveURL(/#/);
  return page;
}

async function addFirst(page: Page, query: string, index = 0): Promise<string> {
  await page.fill("#search", query);
  await page.click("section.search button[type=submit]");
  const result = page.locator("section.search li.item").nth(index);
  const title = (await result.locator(".item-title").textContent()) ?? "";
  await result.locator("button.add").click();
  const queuedOrPlaying = page.locator("section.now .track-title, section.queue .item-title");
  await expect(queuedOrPlaying.filter({ hasText: title }).first()).toBeVisible();
  return title;
}

function queueTitles(page: Page) {
  return page.locator("section.queue .item-title");
}

test("two guests join, add in turns and follow the host going away and back", async ({
  browser,
}) => {
  const world = new World();
  await world.startServer(false);
  const host = world.host();
  const session = await host.create();
  const anya = await guest(browser, session, "Аня");
  const borya = await guest(browser, session, "Боря");

  const first = await addFirst(anya, "Queen", 0);
  await expect(anya.locator("section.now .track-title")).toHaveText(first);
  const second = await addFirst(anya, "Queen", 1);
  const boryas = await addFirst(borya, "Daft Punk", 0);
  const results = borya.locator("section.search ol.items");
  await borya.click("section.search .title-bar button[aria-expanded=true]");
  await expect(results).toBeHidden();
  await borya.click("section.search .title-bar button[aria-expanded=false]");
  await expect(results).toBeVisible();
  await borya.fill("#search", "Queen");
  await borya.press("#search", "Enter");
  await expect(borya.locator("section.search .results-text")).toContainText("Queen");
  for (const page of [anya, borya]) {
    await expect(queueTitles(page)).toHaveText([boryas, second]);
  }
  await expect(anya.locator("section.queue")).toContainText("Вашы 1/10");
  await expect(borya.locator("section.people")).toContainText("Аня");

  host.drop(false);
  for (const page of [anya, borya]) {
    await expect(page.locator(".banner", { hasText: "Гаспадар не ў сетцы" })).toBeVisible();
  }
  expect(await host.resume()).toBe(true);
  for (const page of [anya, borya]) {
    await expect(page.locator(".banner", { hasText: "Гаспадар не ў сетцы" })).toBeHidden();
  }
  await world.end();
});

test("listening along (experimental): a guest plays the host's file, shown on the lock screen", async ({
  browser,
}) => {
  const world = new World();
  await world.startServer(false);
  const host = world.host(
    (track) =>
      `https://s1.storage.yandex.net/get-mp3/0123456789abcdef0123456789abcdef/65cd937b03427/${track.id}.mp3`,
  );
  const session = await host.create();
  const anya = await guest(browser, session, "Аня");
  const files: string[] = [];
  const mp3 = readFileSync(new URL("fixtures/sine440_3s.mp3", import.meta.url));
  await anya.route("https://*.storage.yandex.net/**", async (route) => {
    files.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 200, contentType: "audio/mpeg", body: mp3 });
  });
  const title = await addFirst(anya, "Queen", 0);
  const now = anya.locator("section.now");
  await now.locator("button", { hasText: "Слухаць тут" }).click();
  const stop = now.locator("button", { hasText: "Спыніць" });
  await expect(stop).toBeVisible();
  await expect.poll(() => files.length).toBeGreaterThan(0);
  await expect
    .poll(() => anya.evaluate(() => navigator.mediaSession.metadata?.title ?? null))
    .toBe(title);
  await stop.click();
  await expect(now.locator("button", { hasText: "Слухаць тут" })).toBeVisible();
  await world.end();
});

test("a planned server restart keeps the room; guests reconnect by themselves", async ({
  browser,
}) => {
  const world = new World();
  await world.startServer(true);
  const host = world.host();
  const session = await host.create();
  const anya = await guest(browser, session, "Аня");
  await addFirst(anya, "Queen", 0);
  const waiting = await addFirst(anya, "Queen", 1);

  await world.stopServer();
  await expect(anya.locator(".banner", { hasText: "Няма сувязі" })).toBeVisible();
  await world.startServer(true);
  await expect(anya.locator(".banner", { hasText: "Няма сувязі" })).toBeHidden();
  await expect(queueTitles(anya)).toHaveText([waiting]);
  await expect(anya.locator(".banner", { hasText: "Гаспадар не ў сетцы" })).toBeHidden();
  await world.end();
});

test("REC-14 after a crash the guest waits for the room until the host raises it", async ({
  browser,
}) => {
  const world = new World();
  await world.startServer(false);
  const host = world.host();
  const session = await host.create();
  const anya = await guest(browser, session, "Аня");
  await addFirst(anya, "Queen", 0);
  const waiting = await addFirst(anya, "Queen", 1);
  await expect.poll(() => host.snapshot?.room.queue.length).toBe(1);

  host.stop();
  await world.stopServer();
  await world.startServer(false);
  await expect(anya.locator(".banner", { hasText: "Сервер згубіў джэм" })).toBeVisible();

  const raised = world.host();
  raised.session = host.session;
  raised.snapshot = host.snapshot;
  raised.outbox = [...host.outbox];
  expect(await raised.resume()).toBe(true);
  await expect(anya.locator(".banner", { hasText: "Сервер згубіў джэм" })).toBeHidden();
  const queuedOrPlaying = anya.locator("section.now .track-title, section.queue .item-title");
  await expect(queuedOrPlaying.filter({ hasText: waiting })).toHaveCount(1);
  await expect(anya.locator("section.people")).toContainText("Аня");
  await world.end();
});
