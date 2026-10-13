import { describe, expect, it } from "vitest";
import { downloadClick, type ClickedButton } from "../site/clicks.js";

const DEB = "https://github.com/Kickoman/QiYaa/releases/download/v0.6.0/qiyaa_0.6.0_amd64.deb";

describe("download clicks", () => {
  it("TEL-13 a click names the file, its place, the version and the languages", () => {
    expect(downloadClick(button({}))).toEqual({
      file: "deb",
      place: "download",
      language: "ru",
      version: "0.6.0",
      browserLanguage: "ru-RU",
      referrer: "t.me",
    });
  });

  it("TEL-13 no version while the button is still on releases/latest", () => {
    const click = downloadClick(
      button({ href: "https://github.com/Kickoman/QiYaa-android/releases/latest", file: "apk" }),
    );
    expect(click).toEqual({
      file: "apk",
      place: "download",
      language: "ru",
      browserLanguage: "ru-RU",
      referrer: "t.me",
    });
  });

  it("TEL-13 the referrer is another site's host, never the landing itself", () => {
    expect(downloadClick(button({ referrer: "https://qiyaa.example.org/en" }))).not.toHaveProperty(
      "referrer",
    );
    expect(downloadClick(button({ referrer: "" }))).not.toHaveProperty("referrer");
    expect(downloadClick(button({ referrer: "not a url" }))).not.toHaveProperty("referrer");
    expect(
      downloadClick(button({ referrer: "https://www.Google.com:8443/search?q=qiyaa" })),
    ).toMatchObject({
      referrer: "www.google.com:8443",
    });
  });

  it("TEL-13 an optional value that does not fit is left out, not the click", () => {
    const click = downloadClick(
      button({
        browserLanguage: "x".repeat(36),
        referrer: "http://[2001:db8::1]/",
        href: `https://github.com/Kickoman/QiYaa/releases/download/v1234567.0.0/x.deb`,
      }),
    );
    expect(click).toEqual({ file: "deb", place: "download", language: "ru" });
  });

  it("TEL-13 a button the spec does not know is not posted", () => {
    expect(downloadClick(button({ file: undefined }))).toBeNull();
    expect(downloadClick(button({ file: "exe" }))).toBeNull();
    expect(downloadClick(button({ place: "jam" }))).toBeNull();
    expect(downloadClick(button({ place: undefined }))).toBeNull();
    expect(downloadClick(button({ language: "de" }))).toBeNull();
  });
});

function button(changes: Partial<ClickedButton>): ClickedButton {
  return {
    file: "deb",
    place: "download",
    href: DEB,
    language: "ru",
    browserLanguage: "ru-RU",
    referrer: "https://t.me/qiyaa",
    host: "qiyaa.example.org",
    ...changes,
  };
}
