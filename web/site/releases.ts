// The download buttons go to the newest release's files. The page ships links to
// `releases/latest`, and this module, once GitHub answers, points each button at its file and
// shows the version. When GitHub does not answer, the page stays as it was shipped.

export type Download = "windows-setup" | "windows-zip" | "appimage" | "deb" | "dmg" | "apk";

/** What the page uses of GitHub's `releases/latest` answer. */
export interface Release {
  readonly tag_name?: unknown;
  readonly assets?: unknown;
}

export interface Downloads {
  readonly version: string | null;
  readonly files: Partial<Record<Download, string>>;
}

const FILES: readonly (readonly [Download, RegExp])[] = [
  ["windows-setup", /-windows-x64-setup\.exe$/],
  ["windows-zip", /-windows-x64\.zip$/],
  ["appimage", /-x86_64\.AppImage$/],
  ["deb", /_amd64\.deb$/],
  ["dmg", /-macos-arm64\.dmg$/],
  ["apk", /\.apk$/],
];

const REPOSITORIES = ["Kickoman/QiYaa", "Kickoman/QiYaa-android"] as const;
const DOWNLOAD_PREFIX = "https://github.com/Kickoman/";
const TIMEOUT_MS = 5_000;

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** The version and the files of one release; anything unexpected is left out. */
export function pickDownloads(release: Release): Downloads {
  const version = /^v(\d+\.\d+\.\d+)$/.exec(text(release.tag_name) ?? "")?.[1] ?? null;
  const files: Partial<Record<Download, string>> = {};
  const assets: unknown[] = Array.isArray(release.assets) ? release.assets : [];
  for (const asset of assets) {
    if (typeof asset !== "object" || asset === null) {
      continue;
    }
    const { name, browser_download_url: url } = asset as Record<string, unknown>;
    const fileName = text(name);
    const link = text(url);
    if (fileName === null || link === null || !link.startsWith(DOWNLOAD_PREFIX)) {
      continue;
    }
    const match = FILES.find(([, pattern]) => pattern.test(fileName));
    if (match) {
      files[match[0]] = link;
    }
  }
  return { version, files };
}

async function latest(repository: string): Promise<Downloads | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    return response.ok ? pickDownloads((await response.json()) as Release) : null;
  } catch {
    return null; // offline, blocked or rate-limited: the shipped links stay
  } finally {
    clearTimeout(timer);
  }
}

function show(downloads: Downloads, versionOf: "desktop" | "android"): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-download]")) {
    const file = downloads.files[link.dataset.download as Download];
    if (file) {
      link.href = file;
    }
  }
  const line = document.querySelector<HTMLElement>(`[data-version="${versionOf}"]`);
  const number = line?.querySelector(".version-number");
  if (line && number && downloads.version) {
    number.textContent = downloads.version;
    line.hidden = false;
  }
}

if (typeof document !== "undefined") {
  const [desktop, android] = REPOSITORIES;
  void latest(desktop).then((downloads) => {
    if (downloads) {
      show(downloads, "desktop");
    }
  });
  void latest(android).then((downloads) => {
    if (downloads) {
      show(downloads, "android");
    }
  });
}
