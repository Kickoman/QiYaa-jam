import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { isSiteLanguage, renderPage } from "./site/render.js";

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const SITE_TEMPLATE = page("site/page.html");

/**
 * The landing: site/be.html, ru.html and en.html are placeholders that get site/page.html filled
 * with that language's texts, before Vite bundles what the page links to.
 */
function landing(): Plugin {
  return {
    name: "qiyaa-landing",
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        const language = basename(context.filename, ".html");
        if (dirname(context.filename) !== dirname(SITE_TEMPLATE) || !isSiteLanguage(language)) {
          return html;
        }
        return renderPage(readFileSync(SITE_TEMPLATE, "utf8"), language);
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
  };
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
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
