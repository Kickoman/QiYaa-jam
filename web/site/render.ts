import { SITE_LANGUAGES, SITE_TEXTS, type SiteLanguage, type SiteTextKey } from "./texts.js";

const PLACEHOLDER = /\{\{([A-Za-z0-9:]+)\}\}/g;

/**
 * Where the page's absolute links need the server's address (ROOM-68). The build leaves it in the
 * page, and the server puts its PUBLIC_URL there, so the repository holds no real domain.
 */
export const PUBLIC_URL_PLACEHOLDER = "{{publicUrl}}";

export function isSiteLanguage(value: string): value is SiteLanguage {
  return (SITE_LANGUAGES as readonly string[]).includes(value);
}

/** The page's path on the server: `/` is Belarusian, the apps' default. */
export function sitePath(language: SiteLanguage): string {
  return language === "be" ? "/" : `/${language}`;
}

/**
 * Fills `page.html` for one language: {{key}} takes the text, {{lang}} the language's code,
 * {{path}} the page's path, and {{current:xx}} marks the link to the page itself. {{publicUrl}}
 * stays for the server. An unknown name is a mistake in the template, so it throws and fails the
 * build.
 */
export function renderPage(template: string, language: SiteLanguage): string {
  const texts = SITE_TEXTS[language];
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    if (placeholder === PUBLIC_URL_PLACEHOLDER) {
      return placeholder;
    }
    if (name === "lang") {
      return language;
    }
    if (name === "path") {
      return sitePath(language);
    }
    if (name.startsWith("current:")) {
      return name.slice("current:".length) === language ? 'aria-current="page"' : "";
    }
    if (name in texts) {
      return texts[name as SiteTextKey];
    }
    throw new Error(`page.html: no text "${name}"`);
  });
}

/** The text names a template uses, for the test that every text is used. */
export function templateKeys(template: string): Set<string> {
  return new Set(Array.from(template.matchAll(PLACEHOLDER), (match) => match[1] ?? ""));
}
