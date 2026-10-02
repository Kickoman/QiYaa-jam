import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickDownloads } from "../site/releases.js";
import { renderPage, templateKeys } from "../site/render.js";
import { SITE_LANGUAGES, SITE_TEXTS } from "../site/texts.js";

const template = readFileSync(new URL("../site/page.html", import.meta.url), "utf8");
const own = new Set(["lang", "current:be", "current:ru", "current:en"]);

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

  it("renders each language with nothing left to fill and the link to itself marked", () => {
    for (const language of SITE_LANGUAGES) {
      const page = renderPage(template, language);
      expect(page).not.toContain("{{");
      expect(page).toContain(`<html lang="${language}">`);
      expect(page).toContain(`hreflang="${language}" lang="${language}" aria-current="page"`);
      expect(page.match(/aria-current/g)).toHaveLength(1);
    }
  });

  it("texts in attributes hold no markup or quotes", () => {
    for (const language of SITE_LANGUAGES) {
      const { title, description, screenshotAlt, languageLabel } = SITE_TEXTS[language];
      for (const value of [title, description, screenshotAlt, languageLabel]) {
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
