import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { JoinForm } from "./components/join-form.js";
import { NowPlaying } from "./components/now-playing.js";
import { People } from "./components/people.js";
import { QueueList } from "./components/queue-list.js";
import type { Translate } from "./components/translate.js";
import { initialLanguage, reasonText, rememberLanguage, text, type Language } from "./i18n.js";
import { parseJoinLink, socketUrl, type JoinLink } from "./link.js";
import { browserEnvironment } from "./protocol/client.js";
import { JamSession, type SessionView } from "./session.js";

const APP_VERSION = "0.2.0";
const NOTICE_MS = 4_000;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function Room({ t, session, view }: { t: Translate; session: JamSession; view: SessionView }) {
  const room = view.room;
  const serverNow = useCallback(() => session.serverNow(), [session]);
  const names = useMemo(
    () =>
      new Map(room?.participants.map((participant) => [participant.publicId, participant.name])),
    [room],
  );
  if (!room) {
    return <p class="hint">{t("joining")}</p>;
  }
  return (
    <>
      {room.hostOnline ? null : <p class="banner">{t("hostOffline")}</p>}
      <NowPlaying
        t={t}
        room={room}
        names={names}
        serverNow={serverNow}
        onSkip={(itemId) => {
          session.skip(itemId);
        }}
      />
      <QueueList
        t={t}
        room={room}
        names={names}
        onRemove={(itemId) => {
          session.remove(itemId);
        }}
      />
      <People t={t} room={room} />
    </>
  );
}

function Body({ t, language, link }: { t: Translate; language: Language; link: JoinLink }) {
  const session = useMemo(
    () =>
      new JamSession({
        link,
        url: socketUrl(location),
        appVersion: APP_VERSION,
        storage: storage(),
        environment: browserEnvironment(),
        newParticipantId: () => crypto.randomUUID(),
      }),
    [link],
  );
  const [view, setView] = useState<SessionView>(() => session.view());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = session.subscribe(setView);
    const networkBack = (): void => {
      session.networkBack();
    };
    window.addEventListener("online", networkBack);
    session.start();
    return () => {
      unsubscribe();
      window.removeEventListener("online", networkBack);
      session.stop();
    };
  }, [session]);

  useEffect(() => {
    if (view.phase.kind === "in-room" && location.hash) {
      history.replaceState(null, "", location.pathname);
    }
  }, [view.phase.kind]);

  useEffect(() => {
    if (!view.notice) {
      return undefined;
    }
    setNotice(reasonText(language, view.notice.reason));
    const timer = window.setTimeout(() => {
      setNotice(null);
    }, NOTICE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [view.notice, language]);

  const phase = view.phase;
  let content;
  switch (phase.kind) {
    case "no-secret":
      content = <p class="message">{t("noSecret")}</p>;
      break;
    case "need-name":
      content = <JoinForm t={t} initialName={view.name} onJoin={(name) => session.join(name)} />;
      break;
    case "joining":
      content = <p class="hint">{t("joining")}</p>;
      break;
    case "in-room":
      content = <Room t={t} session={session} view={view} />;
      break;
    case "refused":
      content = <p class="message">{reasonText(language, phase.reason)}</p>;
      break;
    case "ended":
      content = (
        <p class="message">{t(phase.reason === "host-ended" ? "endedHost" : "endedExpired")}</p>
      );
      break;
    case "kicked":
      content = <p class="message">{t("kicked")}</p>;
      break;
    case "update-required":
      content = <p class="message">{t("updateRequired")}</p>;
      break;
  }
  const live = phase.kind === "joining" || phase.kind === "in-room";
  return (
    <>
      {live && view.status === "offline" ? <p class="banner banner-error">{t("offline")}</p> : null}
      {content}
      {notice ? (
        <p class="toast" role="status">
          {notice}
        </p>
      ) : null}
    </>
  );
}

export function App() {
  const [language, setLanguage] = useState<Language>(() =>
    initialLanguage(storage(), navigator.languages),
  );
  const link = useMemo(() => parseJoinLink(location.pathname, location.hash), []);
  const t: Translate = (key, values) => text(language, key, values);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <div class="app">
      <header class="header">
        <span class="caption">{t("appName")}</span>
        <button
          class="language"
          type="button"
          aria-label={t("languageLabel")}
          onClick={() => {
            const next: Language = language === "ru" ? "en" : "ru";
            rememberLanguage(storage(), next);
            setLanguage(next);
          }}
        >
          {t("language")}
        </button>
      </header>
      <main class="main">
        {link ? (
          <Body t={t} language={language} link={link} />
        ) : (
          <p class="message">{t("noRoom")}</p>
        )}
      </main>
    </div>
  );
}
