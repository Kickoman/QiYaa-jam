import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { NowPlaying as Playing } from "../../server/src/protocol/generated/types.js";
import { Window } from "./components/chrome.js";
import { JoinForm } from "./components/join-form.js";
import { NowPlaying } from "./components/now-playing.js";
import { People } from "./components/people.js";
import { QueueList } from "./components/queue-list.js";
import { SearchPanel } from "./components/search-panel.js";
import type { Translate } from "./components/translate.js";
import {
  initialLanguage,
  LANGUAGES,
  reasonText,
  rememberLanguage,
  text,
  type Language,
} from "./i18n.js";
import { coverUrl } from "./format.js";
import { parseJoinLink, socketUrl, type JoinLink } from "./link.js";
import { Listener } from "./listen.js";
import { browserEnvironment } from "./protocol/client.js";
import { JamSession, type SessionView } from "./session.js";

const APP_VERSION = "0.3.0";
const NOTICE_MS = 4_000;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The track on the phone's lock screen and in its media controls while this device listens. */
function showOnLockScreen(playing: Playing | null): void {
  const session = navigator.mediaSession as MediaSession | undefined;
  if (!session) {
    return;
  }
  const track = playing && playing.source !== "idle" ? playing.track : undefined;
  if (!track) {
    session.metadata = null;
    return;
  }
  const cover = coverUrl(track.coverUri, 400);
  session.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artists.join(", "),
    artwork: cover ? [{ src: cover, sizes: "400x400", type: "image/jpeg" }] : [],
  });
}

function Room({
  t,
  language,
  session,
  view,
}: {
  t: Translate;
  language: Language;
  session: JamSession;
  view: SessionView;
}) {
  const room = view.room;
  const serverNow = useCallback(() => session.serverNow(), [session]);
  const [listening, setListening] = useState(false);
  const listener = useMemo(
    () => new Listener(new Audio(), serverNow, () => performance.now(), setListening),
    [serverNow],
  );
  useEffect(() => {
    if (room) {
      listener.follow(room.nowPlaying);
      showOnLockScreen(listening ? room.nowPlaying : null);
    }
  }, [listener, room, listening]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      listener.sync();
    }, 1_000);
    const session = navigator.mediaSession as MediaSession | undefined;
    session?.setActionHandler("pause", () => {
      listener.stop();
    });
    return () => {
      window.clearInterval(timer);
      listener.stop();
    };
  }, [listener]);
  const names = useMemo(
    () =>
      new Map(room?.participants.map((participant) => [participant.publicId, participant.name])),
    [room],
  );
  if (!room) {
    return <p class="screen screen-text">{t("joining")}</p>;
  }
  return (
    <>
      {room.hostOnline ? null : <p class="status banner">{t("hostOffline")}</p>}
      {room.you.isHost ? null : (
        <SearchPanel
          t={t}
          reason={(reason) => reasonText(language, reason)}
          room={room}
          search={view.search}
          adds={view.adds}
          names={names}
          onFind={(text) => session.find(text)}
          onAdd={(trackId) => {
            session.add(trackId);
          }}
          onClose={() => {
            session.closeSearch();
          }}
        />
      )}
      <NowPlaying
        t={t}
        room={room}
        names={names}
        serverNow={serverNow}
        onSkip={(itemId) => {
          session.skip(itemId);
        }}
        listening={listening}
        onListen={(on) => {
          if (on) {
            listener.start();
          } else {
            listener.stop();
          }
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
  const message = (body: string) => (
    <Window title={t("appName")} class="message">
      <p class="text">{body}</p>
    </Window>
  );
  let content;
  switch (phase.kind) {
    case "no-secret":
      content = message(t("noSecret"));
      break;
    case "need-name":
      content = <JoinForm t={t} initialName={view.name} onJoin={(name) => session.join(name)} />;
      break;
    case "joining":
      content = <p class="screen screen-text">{t("joining")}</p>;
      break;
    case "in-room":
      content = <Room t={t} language={language} session={session} view={view} />;
      break;
    case "waiting-for-room":
      content = (
        <>
          <p class="status status-error banner">{t("waitingForRoom")}</p>
          {view.room ? <Room t={t} language={language} session={session} view={view} /> : null}
        </>
      );
      break;
    case "refused":
      content = message(reasonText(language, phase.reason));
      break;
    case "ended":
      content = message(t(phase.reason === "host-ended" ? "endedHost" : "endedExpired"));
      break;
    case "kicked":
      content = message(t("kicked"));
      break;
    case "update-required":
      content = message(t("updateRequired"));
      break;
  }
  const live =
    phase.kind === "joining" || phase.kind === "in-room" || phase.kind === "waiting-for-room";
  return (
    <>
      {live && view.status === "offline" ? (
        <p class="status status-error banner">{t("offline")}</p>
      ) : null}
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
    <>
      <header class="top-bar">
        <div class="top-bar-inner">
          <span class="wordmark">{t("appName")}</span>
          <span class="ridge" aria-hidden="true" />
          <div class="languages" role="group" aria-label={t("languageLabel")}>
            {LANGUAGES.map((option) => (
              <button
                key={option}
                class="toggle"
                type="button"
                lang={option}
                aria-pressed={option === language}
                onClick={() => {
                  rememberLanguage(storage(), option);
                  setLanguage(option);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main class="main">
        {link ? (
          <Body t={t} language={language} link={link} />
        ) : (
          <Window title={t("appName")} class="message">
            <p class="text">{t("noRoom")}</p>
          </Window>
        )}
      </main>
    </>
  );
}
