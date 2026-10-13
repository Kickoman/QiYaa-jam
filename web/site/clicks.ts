import { isDownload, type Download } from "./releases.js";
import { SITE_LANGUAGES, type SiteLanguage } from "./texts.js";

// TEL-13 (spec/telemetry/README.md#the-landing): a click on a download button goes to the landing's
// own server for the dashboard. The link does not wait for it and works without it.

const DOWNLOAD_PATH = "/api/download";
const PLACES = ["download", "android"] as const;
const VERSION = /\/releases\/download\/v(\d{1,6}\.\d{1,6}\.\d{1,6})\//;
const BROWSER_LANGUAGE = /^[A-Za-z0-9-]{1,35}$/;
const HOST = /^[a-z0-9.:-]{1,253}$/;

type Place = (typeof PLACES)[number];

export type DownloadClick = {
  readonly file: Download;
  readonly place: Place;
  readonly language: SiteLanguage;
  readonly version?: string;
  readonly browserLanguage?: string;
  readonly referrer?: string;
};

/** What the page knows when a button is clicked, as plain strings. */
export type ClickedButton = {
  readonly file: string | undefined;
  readonly place: string | undefined;
  readonly href: string;
  readonly language: string;
  readonly browserLanguage: string;
  readonly referrer: string;
  readonly host: string;
};

function isPlace(value: string | undefined): value is Place {
  return PLACES.some((place) => place === value);
}

function isLanguage(value: string): value is SiteLanguage {
  return SITE_LANGUAGES.some((language) => language === value);
}

/** The host of the site the landing was opened from; none for the landing itself. */
function referrerHost(referrer: string, ownHost: string): string | null {
  if (referrer === "") {
    return null;
  }
  try {
    const host = new URL(referrer).host;
    return host !== ownHost && HOST.test(host) ? host : null;
  } catch {
    return null; // not a URL: the click goes without it
  }
}

/** The click to post, or none for a button the spec does not know. Odd optional values are left out. */
export function downloadClick(button: ClickedButton): DownloadClick | null {
  const { file, place, language, browserLanguage } = button;
  if (file === undefined || !isDownload(file) || !isPlace(place) || !isLanguage(language)) {
    return null;
  }
  const version = VERSION.exec(button.href)?.[1];
  const referrer = referrerHost(button.referrer, button.host);
  return {
    file,
    place,
    language,
    ...(version === undefined ? {} : { version }),
    ...(BROWSER_LANGUAGE.test(browserLanguage) ? { browserLanguage } : {}),
    ...(referrer === null ? {} : { referrer }),
  };
}

function count(event: MouseEvent): void {
  const button = event.type === "auxclick" ? 1 : 0;
  if (event.button !== button || !(event.target instanceof Element)) {
    return;
  }
  const link = event.target.closest<HTMLAnchorElement>("a[data-download]");
  if (link === null) {
    return;
  }
  const click = downloadClick({
    file: link.dataset.download,
    place: link.closest("section")?.id,
    href: link.href,
    language: document.documentElement.lang,
    browserLanguage: navigator.language,
    referrer: document.referrer,
    host: location.host,
  });
  if (click === null) {
    return;
  }
  // fetch, not sendBeacon: blockers turn beacons off. keepalive outlives leaving the page.
  void fetch(DOWNLOAD_PATH, { method: "POST", body: JSON.stringify(click), keepalive: true }).catch(
    () => null, // not counted; the link works without it
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("click", count);
  document.addEventListener("auxclick", count);
}
