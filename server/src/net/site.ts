/** The landing in each language (web/site); `/` is Belarusian, the apps' default. */
export const SITE_PAGES: ReadonlyMap<string, string> = new Map([
  ["/", "site/be.html"],
  ["/ru", "site/ru.html"],
  ["/en", "site/en.html"],
]);

export const ROBOTS_PATH = "/robots.txt";
export const SITEMAP_PATH = "/sitemap.xml";

/** Where the built landing needs the server's address: web/site/render.ts leaves it (ROOM-68). */
const PUBLIC_URL_PLACEHOLDER = "{{publicUrl}}";

/** PUBLIC_URL without trailing slashes, the way joinUrl puts it in front of a path. */
function siteUrl(publicUrl: string): string {
  return publicUrl.replace(/\/+$/, "");
}

/** A landing page whose absolute links start with PUBLIC_URL (ROOM-68). */
export function fillPublicUrl(page: string, publicUrl: string): string {
  return page.replaceAll(PUBLIC_URL_PLACEHOLDER, siteUrl(publicUrl));
}

/** Crawlers stay out of the rooms' pages and find the sitemap (ROOM-68). */
export function robotsTxt(publicUrl: string): string {
  return `User-agent: *\nDisallow: /j/\n\nSitemap: ${siteUrl(publicUrl)}${SITEMAP_PATH}\n`;
}

/** The landing's pages (ROOM-68). */
export function sitemapXml(publicUrl: string): string {
  const urls = Array.from(
    SITE_PAGES.keys(),
    (path) => `  <url><loc>${siteUrl(publicUrl)}${path}</loc></url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
