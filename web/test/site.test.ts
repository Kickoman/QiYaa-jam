import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDownloadClick } from "../../server/src/net/downloads.js";
import { fillPublicUrl } from "../../server/src/net/site.js";
import { downloadClick } from "../site/clicks.js";
import { pickDownloads } from "../site/releases.js";
import { renderPage, sitePath, templateKeys } from "../site/render.js";
import { SITE_LANGUAGES, SITE_TEXTS } from "../site/texts.js";

const template = readFileSync(new URL("../site/page.html", import.meta.url), "utf8");
const own = new Set(["lang", "path", "publicUrl", "current:be", "current:ru", "current:en"]);
const PUBLIC_URL = "https://jam.example.org";

function release(tag: string, names: readonly string[], repository = "QiYaa") {
  return {
    tag_name: tag,
    assets: names.map((name) => ({
      name,
      browser_download_url: `https://github.com/Kickoman/${repository}/releases/download/${tag}/${name}`,
    })),
  };
}

describe("landing texts", () => {
  it("every language has every text the page uses, and nothing else", () => {
    const used = [...templateKeys(template)].filter((key) => !own.has(key)).sort();
    for (const language of SITE_LANGUAGES) {
      const texts = SITE_TEXTS[language];
      expect(Object.keys(texts).sort(), language).toEqual(used);
      for (const [key, value] of Object.entries(texts)) {
        expect(value.trim(), `${language}.${key}`).not.toBe("");
      }
    }
  });

  it("renders each language with only the server's address left to fill and the link to itself marked", () => {
    for (const language of SITE_LANGUAGES) {
      const page = renderPage(template, language);
      expect(page.replaceAll("{{publicUrl}}", "")).not.toContain("{{");
      expect(fillPublicUrl(page, PUBLIC_URL)).not.toContain("{{");
      expect(page).toContain(`<html lang="${language}">`);
      expect(page).toContain(`hreflang="${language}" lang="${language}" aria-current="page"`);
      expect(page.match(/aria-current/g)).toHaveLength(1);
    }
  });

  it("ROOM-68 the canonical link names the page itself and the alternates name every language", () => {
    for (const language of SITE_LANGUAGES) {
      const page = fillPublicUrl(renderPage(template, language), PUBLIC_URL);
      const own = `${PUBLIC_URL}${sitePath(language)}`;
      expect(page).toContain(`<link rel="canonical" href="${own}" />`);
      expect(page).toContain(`<meta property="og:url" content="${own}" />`);
      const alternates = Array.from(
        page.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g),
        (match) => `${match[1] ?? ""} ${match[2] ?? ""}`,
      );
      expect(alternates).toEqual([
        `be ${PUBLIC_URL}/`,
        `ru ${PUBLIC_URL}/ru`,
        `en ${PUBLIC_URL}/en`,
        `x-default ${PUBLIC_URL}/en`,
      ]);
    }
  });

  it("the structured data is JSON that names the page and its description", () => {
    for (const language of SITE_LANGUAGES) {
      const page = fillPublicUrl(renderPage(template, language), PUBLIC_URL);
      const json = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(page)?.[1] ?? "";
      expect(JSON.parse(json), language).toMatchObject({
        "@type": "SoftwareApplication",
        name: "QiYaa",
        description: SITE_TEXTS[language].description,
        url: `${PUBLIC_URL}${sitePath(language)}`,
        inLanguage: language,
      });
    }
  });

  it("texts in attributes hold no markup or quotes", () => {
    for (const language of SITE_LANGUAGES) {
      const texts = SITE_TEXTS[language];
      const inAttributes = [
        texts.title,
        texts.description,
        texts.screenshotAlt,
        texts.languageLabel,
        texts.download,
        texts.rowWindowsSetup,
        texts.rowWindowsZip,
        texts.rowMac,
      ];
      for (const value of inAttributes) {
        expect(value).not.toMatch(/["<>]/);
      }
    }
  });

  it("English calls Yandex's волна a vibe, never a wave", () => {
    for (const value of Object.values(SITE_TEXTS.en)) {
      expect(value).not.toMatch(/\bwaves?\b/i);
    }
  });

  it("an unknown text in the template fails the build", () => {
    expect(() => renderPage("{{nope}}", "be")).toThrow('page.html: no text "nope"');
  });
});

describe("download links", () => {
  it("finds every file of the desktop and Android releases", () => {
    const desktop = pickDownloads(
      release("v0.4.0", [
        "QiYaa-0.4.0-macos-arm64.dmg",
        "QiYaa-0.4.0-windows-x64-setup.exe",
        "QiYaa-0.4.0-windows-x64.zip",
        "QiYaa-0.4.0-x86_64.AppImage",
        "qiyaa_0.4.0_amd64.deb",
      ]),
    );
    expect(desktop.version).toBe("0.4.0");
    expect(Object.keys(desktop.files).sort()).toEqual([
      "appimage",
      "deb",
      "dmg",
      "windows-setup",
      "windows-zip",
    ]);
    expect(desktop.files["windows-setup"]).toBe(
      "https://github.com/Kickoman/QiYaa/releases/download/v0.4.0/QiYaa-0.4.0-windows-x64-setup.exe",
    );
    const android = pickDownloads(release("v0.4.0", ["QiYaa-0.4.0.apk"], "QiYaa-android"));
    expect(android).toEqual({
      version: "0.4.0",
      files: {
        apk: "https://github.com/Kickoman/QiYaa-android/releases/download/v0.4.0/QiYaa-0.4.0.apk",
      },
    });
  });

  it("leaves out links elsewhere, odd tags and broken answers", () => {
    const foreign = pickDownloads({
      tag_name: "latest",
      assets: [
        { name: "QiYaa-0.4.0.apk", browser_download_url: "https://example.org/QiYaa-0.4.0.apk" },
        { name: "QiYaa-0.4.0-x86_64.AppImage" },
        null,
        "QiYaa-0.4.0-windows-x64.zip",
      ],
    });
    expect(foreign).toEqual({ version: null, files: {} });
    expect(pickDownloads({})).toEqual({ version: null, files: {} });
    expect(pickDownloads({ tag_name: 4, assets: {} })).toEqual({ version: null, files: {} });
  });
});

describe("download buttons", () => {
  it("TEL-13 every download button of the page makes a click the server takes", () => {
    const buttons = Array.from(template.matchAll(/data-download="([^"]*)"/g), (match) => {
      const sections = template.slice(0, match.index).matchAll(/<section id="([^"]+)"/g);
      return { file: match[1], place: Array.from(sections).at(-1)?.[1] };
    });
    expect(buttons.map(({ file, place }) => `${file ?? ""} ${place ?? ""}`)).toEqual([
      "windows-setup download",
      "windows-zip download",
      "appimage download",
      "deb download",
      "dmg download",
      "apk download",
      "apk android",
    ]);
    for (const { file, place } of buttons) {
      const click = downloadClick({
        file,
        place,
        href: "https://github.com/Kickoman/QiYaa/releases/latest",
        language: "en",
        browserLanguage: "en-GB",
        referrer: "",
        host: "jam.example.org",
      });
      expect(click, file).not.toBeNull();
      expect(parseDownloadClick(click), file).toEqual(click);
    }
  });
});
