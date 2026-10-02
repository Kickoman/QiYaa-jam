export type Language = "en" | "be";

export const LANGUAGES: readonly Language[] = ["en", "be"];

const texts = {
  en: {
    appName: "QiYaa Jam",
    languageLabel: "Language",
    connecting: "Connecting…",
    online: "Connected",
    offline: "No connection, reconnecting",
    stopped: "Disconnected",
    noRoom: "Open the jam link the host sent you.",
    noSecret: "The link is missing its secret after “#”. Open the whole link the host sent.",
    joinTitle: "Join the jam",
    invited: "You are invited to a jam. Add tracks to the host’s queue from your phone.",
    namePrompt: "Your name, as others see it",
    namePlaceholder: "Name",
    join: "Join",
    joining: "Joining…",
    nowPlaying: "Now playing",
    addedBy: "Added by {name}",
    jamWave: "Jam vibe",
    silence: "Nothing is playing yet",
    queue: "Queue",
    queueEmpty: "The queue is empty. Find a track above and add it.",
    yourTracks: "Yours {count}/{limit}",
    people: "People",
    host: "host",
    you: "you",
    next: "next",
    remove: "Remove",
    skip: "Skip",
    listen: "Listen here",
    stopListening: "Stop listening",
    listenHint: "Plays on this device, roughly in time with the host.",
    hostOffline: "The host is offline",
    waitingForRoom:
      "The server lost the jam. Waiting up to 10 minutes for the host to bring it back.",
    endedHost: "The jam is over. Thanks for coming!",
    endedExpired: "The jam ended: the host was away too long.",
    kicked: "The host removed you from the jam.",
    updateRequired: "The server was updated. Reload the page.",
    searchTitle: "Search",
    searchLabel: "Find a track",
    searchPlaceholder: "Artist or title",
    searchButton: "Find",
    searching: "Searching…",
    nothingFound: "Nothing found",
    searchOffline:
      "The host is offline: search is unavailable, but earlier results can still be added.",
    results: "Results for “{text}”",
    collapse: "Hide results",
    expand: "Show results",
    closeResults: "Clear results",
    add: "Add",
    adding: "Adding",
    added: "Queued",
    inQueueFrom: "Already queued by {name}",
    yoursInQueue: "Yours, queued",
    limitReached: "Limit",
    limitHint: "You have {limit} tracks waiting, the most a guest may. Wait until one plays.",
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
    "reason.queue-limit": "Limit reached: remove a track of yours or wait until one plays.",
    "reason.duplicate": "This track is already waiting in the queue.",
    "reason.unknown-track": "Search for this track again.",
    "reason.track-unavailable": "This track is not available to the host.",
    "reason.host-timeout": "The host did not answer in time. Try again.",
    "reason.host-error": "The host could not do it. Try again.",
    "reason.invalid-message": "The page sent something wrong. Reload it.",
    "reason.update-required": "The server was updated. Reload the page.",
    "reason.server-full": "The server is full.",
  },
  be: {
    appName: "QiYaa Jam",
    languageLabel: "Мова",
    connecting: "Падключаюся…",
    online: "На сувязі",
    offline: "Няма сувязі, перападключаюся",
    stopped: "Адключана",
    noRoom: "Адкрыйце спасылку на джэм, якую вам даслалі.",
    noSecret: "У спасылцы не хапае сакрэту пасля «#». Адкрыйце яе цалкам, як вам даслалі.",
    joinTitle: "Уваход у джэм",
    invited: "Вас запрасілі ў джэм. Дадавайце трэкі ў чаргу гаспадара са свайго тэлефона.",
    namePrompt: "Ваша імя, як яго ўбачаць іншыя",
    namePlaceholder: "Імя",
    join: "Увайсці",
    joining: "Уваходжу…",
    nowPlaying: "Зараз грае",
    addedBy: "Дадана: {name}",
    jamWave: "Хваля джэма",
    silence: "Пакуль ціха",
    queue: "Чарга",
    queueEmpty: "Чарга пустая. Знайдзіце трэк вышэй і дадайце яго.",
    yourTracks: "Вашы {count}/{limit}",
    people: "Удзельнікі",
    host: "гаспадар",
    you: "вы",
    next: "наступны",
    remove: "Прыбраць",
    skip: "Прапусціць",
    listen: "Слухаць тут",
    stopListening: "Спыніць",
    listenHint: "Грае на гэтай прыладзе, прыкладна разам з гаспадаром.",
    hostOffline: "Гаспадар не ў сетцы",
    waitingForRoom: "Сервер згубіў джэм. Чакаю да 10 хвілін, пакуль гаспадар яго верне.",
    endedHost: "Джэм скончыўся. Дзякуй, што былі!",
    endedExpired: "Джэм скончыўся: гаспадара доўга не было.",
    kicked: "Гаспадар прыбраў вас з джэма.",
    updateRequired: "Сервер абнавіўся. Перазагрузіце старонку.",
    searchTitle: "Пошук",
    searchLabel: "Знайсці трэк",
    searchPlaceholder: "Выканаўца або назва",
    searchButton: "Шукаць",
    searching: "Шукаю…",
    nothingFound: "Нічога не знайшлося",
    searchOffline:
      "Гаспадар не ў сетцы: пошук не працуе, але знойдзенае раней усё яшчэ можна дадаць.",
    results: "Знойдзена па «{text}»",
    collapse: "Схаваць вынікі",
    expand: "Паказаць вынікі",
    closeResults: "Ачысціць вынікі",
    add: "Дадаць",
    adding: "Дадаю",
    added: "У чарзе",
    inQueueFrom: "Ужо ў чарзе: {name}",
    yoursInQueue: "Ваш, у чарзе",
    limitReached: "Ліміт",
    limitHint: "Вашых трэкаў у чарзе: {limit}, гэта ліміт. Пачакайце, пакуль адзін з іх прайграе.",
    "reason.bad-secret": "Спасылка састарэла. Папрасіце ў гаспадара новую.",
    "reason.room-not-found": "Джэм не знойдзены. Магчыма, ён ужо скончыўся.",
    "reason.join-closed": "Гаспадар закрыў уваход у джэм.",
    "reason.room-full": "У джэме больш няма месцаў.",
    "reason.kicked": "Гаспадар прыбраў вас з джэма.",
    "reason.rate-limited": "Занадта часта. Пачакайце хвіліну.",
    "reason.not-allowed": "Так нельга.",
    "reason.stale": "Ужо неактуальна: чарга змянілася.",
    "reason.host-offline": "Гаспадар не ў сетцы.",
    "reason.other": "Не атрымалася.",
    "reason.queue-limit": "Ліміт: прыбярыце свой трэк або пачакайце, пакуль ён прайграе.",
    "reason.duplicate": "Гэты трэк ужо чакае ў чарзе.",
    "reason.unknown-track": "Гэты трэк трэба знайсці зноў.",
    "reason.track-unavailable": "Гэты трэк недаступны гаспадару.",
    "reason.host-timeout": "Гаспадар не адказаў своечасова. Паспрабуйце яшчэ раз.",
    "reason.host-error": "У гаспадара не атрымалася. Паспрабуйце яшчэ раз.",
    "reason.invalid-message": "Старонка адправіла нешта не тое. Перазагрузіце яе.",
    "reason.update-required": "Сервер абнавіўся. Перазагрузіце старонку.",
    "reason.server-full": "Сервер перапоўнены.",
  },
} as const;

export type TextKey = keyof (typeof texts)["en"];

const STORAGE_KEY = "qiyaa-jam.language";

/** Belarusian for browsers set to Belarusian or Russian, English otherwise; a stored choice wins. */
export function pickLanguage(stored: string | null, preferred: readonly string[]): Language {
  if (stored === "en" || stored === "be") {
    return stored;
  }
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split("-")[0];
    if (primary === "be" || primary === "ru") {
      return "be";
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
