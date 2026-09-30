export type Language = "ru" | "en";

const texts = {
  ru: {
    appName: "QiYaa Jam",
    connecting: "Подключаюсь…",
    online: "На связи",
    offline: "Нет связи, переподключаюсь",
    language: "EN",
    languageLabel: "Switch to English",
    noRoom: "Откройте ссылку на джем, которую прислал хозяин.",
  },
  en: {
    appName: "QiYaa Jam",
    connecting: "Connecting…",
    online: "Connected",
    offline: "No connection, reconnecting",
    language: "RU",
    languageLabel: "Переключить на русский",
    noRoom: "Open the jam link the host sent you.",
  },
} as const;

export type TextKey = keyof (typeof texts)["ru"];

const STORAGE_KEY = "qiyaa-jam.language";

export function pickLanguage(stored: string | null, preferred: readonly string[]): Language {
  if (stored === "ru" || stored === "en") {
    return stored;
  }
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split("-")[0];
    if (primary === "ru" || primary === "be" || primary === "uk") {
      return "ru";
    }
    if (primary === "en") {
      return "en";
    }
  }
  return "en";
}

function storedLanguage(storage: Pick<Storage, "getItem"> | null): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null; // storage may be blocked in private windows
  }
}

export function initialLanguage(
  storage: Pick<Storage, "getItem"> | null,
  preferred: readonly string[],
): Language {
  return pickLanguage(storedLanguage(storage), preferred);
}

export function rememberLanguage(
  storage: Pick<Storage, "setItem"> | null,
  language: Language,
): void {
  try {
    storage?.setItem(STORAGE_KEY, language);
  } catch {
    // storage may be blocked; the choice then lasts until the page closes
  }
}

export function text(language: Language, key: TextKey): string {
  return texts[language][key];
}
