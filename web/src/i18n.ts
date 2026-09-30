export type Language = "ru" | "en";

const texts = {
  ru: {
    appName: "QiYaa Jam",
    connecting: "Подключаюсь…",
    online: "На связи",
    offline: "Нет связи, переподключаюсь",
    stopped: "Отключено",
    language: "EN",
    languageLabel: "Switch to English",
    noRoom: "Откройте ссылку на джем, которую прислал хозяин.",
    noSecret: "В ссылке не хватает секрета после «#». Откройте её целиком, как прислал хозяин.",
    invited: "Вас позвали в джем",
    namePrompt: "Как вас показывать другим?",
    namePlaceholder: "Имя",
    join: "Войти",
    joining: "Вхожу…",
    nowPlaying: "Сейчас играет",
    addedBy: "Добавлено: {name}",
    jamWave: "Волна джема",
    silence: "Пока тишина",
    queue: "Очередь",
    queueEmpty: "Очередь пуста — добавьте трек",
    yourTracks: "Ваших треков: {count} / {limit}",
    people: "Участники",
    host: "хозяин",
    you: "вы",
    next: "дальше",
    remove: "Убрать",
    skip: "Пропустить",
    hostOffline: "Хозяин не в сети",
    endedHost: "Джем закончен. Спасибо, что были!",
    endedExpired: "Джем закончился: хозяина долго не было.",
    kicked: "Хозяин удалил вас из джема.",
    updateRequired: "Сервер обновился — обновите страницу.",
    "reason.bad-secret": "Ссылка устарела. Попросите у хозяина новую.",
    "reason.room-not-found": "Джем не найден. Возможно, он уже закончился.",
    "reason.join-closed": "Хозяин закрыл вход в джем.",
    "reason.room-full": "В джеме больше нет мест.",
    "reason.kicked": "Хозяин удалил вас из джема.",
    "reason.rate-limited": "Слишком часто. Подождите минуту.",
    "reason.not-allowed": "Так нельзя.",
    "reason.stale": "Уже неактуально: очередь изменилась.",
    "reason.host-offline": "Хозяин не в сети.",
    "reason.other": "Не получилось.",
  },
  en: {
    appName: "QiYaa Jam",
    connecting: "Connecting…",
    online: "Connected",
    offline: "No connection, reconnecting",
    stopped: "Disconnected",
    language: "RU",
    languageLabel: "Переключить на русский",
    noRoom: "Open the jam link the host sent you.",
    noSecret: "The link is missing its secret after “#”. Open the whole link the host sent.",
    invited: "You are invited to a jam",
    namePrompt: "How should others see you?",
    namePlaceholder: "Name",
    join: "Join",
    joining: "Joining…",
    nowPlaying: "Now playing",
    addedBy: "Added by {name}",
    jamWave: "Jam wave",
    silence: "Nothing is playing yet",
    queue: "Queue",
    queueEmpty: "The queue is empty — add a track",
    yourTracks: "Your tracks: {count} / {limit}",
    people: "People",
    host: "host",
    you: "you",
    next: "next",
    remove: "Remove",
    skip: "Skip",
    hostOffline: "The host is offline",
    endedHost: "The jam is over. Thanks for coming!",
    endedExpired: "The jam ended: the host was away too long.",
    kicked: "The host removed you from the jam.",
    updateRequired: "The server was updated — reload the page.",
    "reason.bad-secret": "The link is out of date. Ask the host for a new one.",
    "reason.room-not-found": "Jam not found. It may be over already.",
    "reason.join-closed": "The host closed the jam to new people.",
    "reason.room-full": "The jam has no free places.",
    "reason.kicked": "The host removed you from the jam.",
    "reason.rate-limited": "Too often. Wait a minute.",
    "reason.not-allowed": "That is not allowed.",
    "reason.stale": "Too late: the queue has changed.",
    "reason.host-offline": "The host is offline.",
    "reason.other": "That did not work.",
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

export function text(
  language: Language,
  key: TextKey,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return texts[language][key].replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

export function reasonText(language: Language, reason: string): string {
  const key = `reason.${reason}`;
  return key in texts[language] ? text(language, key as TextKey) : text(language, "reason.other");
}
