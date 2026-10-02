import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { parseTrustedProxies } from "../../server/src/net/real-ip.js";
import { JamServer } from "../../server/src/net/server.js";

// The landing as the server serves it: three languages, a layout without sideways scrolling,
// and download buttons that follow GitHub's newest release, or stay on releases/latest.

const WEB_ROOT = fileURLToPath(new URL("../dist", import.meta.url));
const PORT = 18_190;
const BASE = `http://127.0.0.1:${PORT}`;
const LATEST = "https://github.com/Kickoman/QiYaa/releases/latest";

let server: JamServer;

test.beforeAll(async () => {
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
