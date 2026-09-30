import { useEffect, useMemo, useState } from "preact/hooks";
import { initialLanguage, rememberLanguage, text, type Language, type TextKey } from "./i18n.js";
import { parseJoinLink, socketUrl } from "./link.js";
import { browserEnvironment, JamConnection, type ConnectionStatus } from "./protocol/client.js";

const APP_VERSION = "0.1.0";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App() {
  const [language, setLanguage] = useState<Language>(() =>
    initialLanguage(storage(), navigator.languages),
  );
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const link = useMemo(() => parseJoinLink(location.pathname, location.hash), []);
  const t = (key: TextKey): string => text(language, key);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!link) {
      return undefined;
    }
    const connection = new JamConnection(
      {
        url: socketUrl(location),
        appVersion: APP_VERSION,
        onMessage: () => undefined,
        onStatus: setStatus,
        onWelcome: () => undefined,
      },
      browserEnvironment(),
    );
    const networkBack = (): void => {
      connection.networkBack();
    };
    window.addEventListener("online", networkBack);
    connection.start();
    return () => {
      window.removeEventListener("online", networkBack);
      connection.stop();
    };
  }, [link]);

  const switchLanguage = (): void => {
    const next: Language = language === "ru" ? "en" : "ru";
    rememberLanguage(storage(), next);
    setLanguage(next);
  };

  return (
    <div class="app">
      <header class="header">
        <span class="caption">{t("appName")}</span>
        <button
          class="language"
          type="button"
          aria-label={t("languageLabel")}
          onClick={switchLanguage}
        >
          {t("language")}
        </button>
      </header>
      <main class="main">
        {link ? (
          <p class={`status status-${status}`}>{t(status === "stopped" ? "offline" : status)}</p>
        ) : (
          <p class="hint">{t("noRoom")}</p>
        )}
      </main>
    </div>
  );
}
