import { SITE_LANGUAGES, SITE_TEXTS, type SiteLanguage, type SiteTextKey } from "./texts.js";

const PLACEHOLDER = /\{\{([A-Za-z0-9:]+)\}\}/g;

export function isSiteLanguage(value: string): value is SiteLanguage {
  return (SITE_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Fills `page.html` for one language: {{key}} takes the text, {{lang}} the language's code, and
 * {{current:xx}} marks the link to the page itself. An unknown name is a mistake in the template,
 * so it throws and fails the build.
 */
export function renderPage(template: string, language: SiteLanguage): string {
  const texts = SITE_TEXTS[language];
  return template.replace(PLACEHOLDER, (_, name: string) => {
    if (name === "lang") {
      return language;
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
