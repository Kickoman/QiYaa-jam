import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { isSiteLanguage, PUBLIC_URL_PLACEHOLDER, renderPage } from "./site/render.js";
import type { SiteLanguage } from "./site/texts.js";

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const SITE_TEMPLATE = page("site/page.html");

/** The language of a landing entry (site/be.html, ru.html, en.html); null for any other page. */
function landingLanguage(filename: string): SiteLanguage | null {
  const language = basename(filename, ".html");
  return dirname(filename) === dirname(SITE_TEMPLATE) && isSiteLanguage(language) ? language : null;
}

/**
 * The landing: site/be.html, ru.html and en.html are placeholders that get site/page.html filled
 * with that language's texts, before Vite bundles what the page links to. In a build, og:image
 * also gets {{publicUrl}} in front of the address Vite writes there, `/assets/og-<hash>.png`: link
 * previews need an absolute link, and only the server knows its address (ROOM-68).
 */
function landing(): Plugin[] {
  return [
    {
      name: "qiyaa-landing",
      transformIndexHtml: {
        order: "pre",
        handler(html, context) {
          const language = landingLanguage(context.filename);
          return language === null
            ? html
            : renderPage(readFileSync(SITE_TEMPLATE, "utf8"), language);
        },
      },
      configureServer(server) {
        server.watcher.add(SITE_TEMPLATE);
        server.watcher.on("change", (path) => {
          if (path === SITE_TEMPLATE) {
            server.ws.send({ type: "full-reload" });
          }
        });
      },
    },
    {
      name: "qiyaa-landing-image",
      apply: "build",
      transformIndexHtml: {
        order: "post",
        handler(html, context) {
          return landingLanguage(context.filename) === null
            ? html
            : html.replace('<meta property="og:image" content="', `$&${PUBLIC_URL_PLACEHOLDER}`);
        },
      },
    },
  ];
}

export default defineConfig({
  plugins: [landing()],
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false }, // no page loads chunks on demand
    rolldownOptions: {
      input: {
        guest: page("index.html"),
        "site-be": page("site/be.html"),
        "site-ru": page("site/ru.html"),
        "site-en": page("site/en.html"),
      },
    },
  },
  server: {
    proxy: {
      "/ws": { target: "ws://localhost:8090", ws: true },
      "/api": { target: "http://localhost:8090" },
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
