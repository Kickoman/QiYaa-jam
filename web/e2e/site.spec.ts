import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { configureLog } from "../../server/src/log.js";
import { parseTrustedProxies } from "../../server/src/net/real-ip.js";
import { JamServer } from "../../server/src/net/server.js";

// The landing as the server serves it: three languages, a layout without sideways scrolling,
// download buttons that follow GitHub's newest release, or stay on releases/latest, and the
// clicks on them that reach the server's log.

const WEB_ROOT = fileURLToPath(new URL("../dist", import.meta.url));
const PORT = 18_190;
const BASE = `http://127.0.0.1:${PORT}`;
const LATEST = "https://github.com/Kickoman/QiYaa/releases/latest";

let server: JamServer;
const logged: Record<string, unknown>[] = [];

test.beforeAll(async () => {
  configureLog({ write: (line) => logged.push(JSON.parse(line) as Record<string, unknown>) });
  server = new JamServer({
    publicUrl: BASE,
    trustedProxies: parseTrustedProxies(undefined),
    roomsFile: null,
    assetlinksJson: null,
    webRoot: WEB_ROOT,
  });
  await server.listen(PORT, "127.0.0.1");
});

test.afterAll(async () => {
  await server.close();
  configureLog({
    write: (line) => {
      process.stdout.write(line);
    },
  });
});

function release(repository: string, tag: string, names: readonly string[]) {
  return {
    tag_name: tag,
    assets: names.map((name) => ({
      name,
      browser_download_url: `https://github.com/Kickoman/${repository}/releases/download/${tag}/${name}`,
    })),
  };
}

async function answerGitHub(page: Page): Promise<void> {
  await page.route("https://api.github.com/repos/Kickoman/QiYaa/releases/latest", (route) =>
    route.fulfill({
      json: release("QiYaa", "v9.8.7", [
        "QiYaa-9.8.7-windows-x64-setup.exe",
        "QiYaa-9.8.7-windows-x64.zip",
        "QiYaa-9.8.7-x86_64.AppImage",
        "qiyaa_9.8.7_amd64.deb",
        "QiYaa-9.8.7-macos-arm64.dmg",
      ]),
    }),
  );
  await page.route("https://api.github.com/repos/Kickoman/QiYaa-android/releases/latest", (route) =>
    route.fulfill({ json: release("QiYaa-android", "v6.5.4", ["QiYaa-6.5.4.apk"]) }),
  );
}

test("the landing in Belarusian at /, Russian at /ru and English at /en", async ({ page }) => {
  await page.route("https://api.github.com/**", (route) => route.abort());
  const pages = [
    ["/", "be", "Спампаваць"],
    ["/ru", "ru", "Скачать"],
    ["/en", "en", "Get it"],
  ] as const;
  for (const [path, language, heading] of pages) {
    await page.goto(BASE + path);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.locator("#download h2").first()).toHaveText(heading);
    await expect(page.locator(`.languages a[hreflang="${language}"]`)).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await page.locator('.languages a[hreflang="ru"]').click();
  await expect(page).toHaveURL(`${BASE}/ru`);
  await expect(page.locator("#jam h2")).toHaveText("Джем");
});

test("ROOM-68 the landing's absolute links, its link preview picture, robots.txt and sitemap.xml", async ({
  page,
  request,
}) => {
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.goto(`${BASE}/ru`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${BASE}/ru`);
  await expect(page.locator('link[hreflang="be"]')).toHaveAttribute("href", `${BASE}/`);
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toMatch(new RegExp(`^${BASE}/assets/og-[\\w-]+\\.png$`));
  const picture = await request.get(image ?? "");
  expect(picture.status()).toBe(200);
  expect(picture.headers()["content-type"]).toBe("image/png");
  expect(await (await request.get(`${BASE}/robots.txt`)).text()).toContain(
    `Sitemap: ${BASE}/sitemap.xml`,
  );
  expect(await (await request.get(`${BASE}/sitemap.xml`)).text()).toContain(
    `<loc>${BASE}/en</loc>`,
  );
});

test("no sideways scrolling at 1440, 1024 and 390 px", async ({ page }) => {
  await page.route("https://api.github.com/**", (route) => route.abort());
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/ru", "/en"]) {
      await page.goto(BASE + path);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${path} at ${width} px`).toBe(0);
    }
  }
});

test("the download buttons take the newest release's files and show its version", async ({
  page,
}) => {
  await answerGitHub(page);
  await page.goto(`${BASE}/en`);
  await expect(page.locator('[data-version="desktop"]')).toHaveText("Version 9.8.7 ·");
  await expect(page.locator('[data-version="android"]')).toHaveText("Android · Version 6.5.4");
  // The row's button is an icon; its name says what it downloads.
  await expect(page.getByRole("link", { name: "Download: Linux, .deb" })).toHaveAttribute(
    "href",
    "https://github.com/Kickoman/QiYaa/releases/download/v9.8.7/qiyaa_9.8.7_amd64.deb",
  );
  for (const link of await page.locator('a[data-download="apk"]').all()) {
    await expect(link).toHaveAttribute(
      "href",
      "https://github.com/Kickoman/QiYaa-android/releases/download/v6.5.4/QiYaa-6.5.4.apk",
    );
  }
});

test("without GitHub the buttons stay on releases/latest and no version shows", async ({
  page,
}) => {
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  await expect(page.locator('a[data-download="appimage"]')).toHaveAttribute("href", LATEST);
  await expect(page.locator('[data-version="desktop"]')).toBeHidden();
  await expect(page.locator('[data-version="android"]')).toBeHidden();
});

test("TEL-13 a click on a download button reaches the server's log, and the file still opens", async ({
  page,
}) => {
  await answerGitHub(page);
  await page
    .context()
    .route("https://github.com/Kickoman/**", (route) => route.fulfill({ body: "the file" }));
  await page.goto(`${BASE}/en`, { referer: "https://t.me/qiyaa" });
  const deb = page.getByRole("link", { name: "Download: Linux, .deb" });
  await expect(deb).toHaveAttribute("href", /v9\.8\.7/);
  const before = logged.length;
  await deb.click();
  await expect(page).toHaveURL(/qiyaa_9\.8\.7_amd64\.deb$/);
  await expect.poll(() => clicks(before)).toHaveLength(1);
  expect(clicks(before)[0]).toMatchObject({
    level: "info",
    http_status: 204,
    file: "deb",
    place: "download",
    page_language: "en",
    app_version: "9.8.7",
    browser_language: "ru-RU",
    referrer_host: "t.me",
  });
});

test("TEL-13 a middle click counts too; without GitHub's answer there is no version", async ({
  page,
}) => {
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.context().route("https://github.com/**", (route) => route.fulfill({ body: "page" }));
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  const before = logged.length;
  await page.locator('#android a[data-download="apk"]').click({ button: "middle" });
  await expect.poll(() => clicks(before)).toHaveLength(1);
  const click = clicks(before)[0];
  expect(click).toMatchObject({ file: "apk", place: "android", page_language: "be" });
  expect(click).not.toHaveProperty("app_version");
  expect(click).not.toHaveProperty("referrer_host");
});

test("TEL-13 when the click cannot be sent, the button still opens its link", async ({ page }) => {
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("**/api/download", (route) => route.abort());
  await page.context().route("https://github.com/**", (route) => route.fulfill({ body: "page" }));
  await page.goto(`${BASE}/ru`);
  await page.waitForLoadState("networkidle");
  await page.locator('#download a[data-download="dmg"]').click();
  await expect(page).toHaveURL(LATEST);
});

function clicks(before: number): Record<string, unknown>[] {
  return logged.slice(before).filter((line) => line.http_path === "/api/download");
}
