// The landing's texts: one dictionary per language, the same keys in each. `page.html` names them
// as {{key}}; values may hold inline HTML (links, <b>), and the ones in attributes (title,
// description, screenshotAlt, download and the rows' labels) hold none. Words follow the apps' glossary
// (Kickoman/QiYaa translations/README.md): My Vibe / Мая хваля / Моя волна, never "wave".

export type SiteLanguage = "be" | "ru" | "en";

export const SITE_LANGUAGES: readonly SiteLanguage[] = ["be", "ru", "en"];

const DESKTOP = "https://github.com/Kickoman/QiYaa";
const JAM = "https://github.com/Kickoman/QiYaa-jam";

const en = {
  title: "QiYaa: a Winamp-style player for Yandex Music, Spotify and your own files",
  description:
    "A free, open-source player in the style of the 2000s: Yandex Music, Spotify and your own mp3 and FLAC, Winamp skins, lyrics and the jam, a shared queue for a party. Linux, Windows, macOS and Android.",
  languageLabel: "Language",
  navFeatures: "Features",
  navJam: "Jam",
  navAndroid: "Android",
  navFaq: "FAQ",
  download: "Download",
  source: "Source",
  version: "Version",

  heroTagline: "Yandex Music, Spotify and your own files in that player from the 2000s.",
  heroText:
    "Listen to My Vibe, Spotify and your own mp3 and FLAC, sing along to the lyrics and change skins. A native C++ and Qt 6 app, fast and light. There’s an Android version, and there’s the jam, which should have existed long ago.",
  heroFree: "· free and open source",
  screenshotAlt: "The main window of QiYaa with the default skin",

  getTitle: "Get it",
  getText: `Ready-made builds are on GitHub Releases, and the buttons download the latest one. How to install: <a href="${DESKTOP}/blob/master/docs/install.md">docs/install.md</a> (in Russian).`,
  rowWindowsSetup: "x64 · installer",
  rowWindowsZip: "x64 · portable zip",
  rowMac: "arm64 · dmg · best effort",
  buildTitle: "Build it",
  buildText: `You need CMake 3.21+, a C++20 compiler and Qt 6.4 or newer. Other systems: <a href="${DESKTOP}/blob/master/docs/building.md">docs/building.md</a>.`,

  featuresTitle: "Features",
  feature1: "Log in with a code, no password in the app",
  feature2: "My Vibe, Wheel of vibes, stations and search",
  feature3: "Liked, playlists, albums, artists",
  feature4: "Spotify Premium: Liked Songs, playlists, radio",
  feature5: "Your own mp3, FLAC, WAV, AAC and Ogg, with tags and covers",
  feature6: "Lyrics from Yandex, .lrc files and LRCLIB",
  feature7: "After a playlist, a vibe from its tracks",
  feature8: ".wsz skins: built-in and your own",
  feature9: "10-band equalizer with presets",
  feature10: "Spectrum, oscilloscope and Milkdrop",
  feature11: "No gaps between tracks",
  feature12: "Economy: a third of the data",
  feature13: "Media keys and the system player",
  feature14: "Windows dock like in the original Winamp",
  feature15: "Jam: a shared play queue for a party",
  feature16: "Belarusian, Russian and English",

  jamTitle: "Jam",
  jamLead:
    "A shared play queue for a party: friends add tracks from their phones, and the music plays from QiYaa on your device.",
  jamStep1Title: "Start",
  jamStep1Text:
    "Start a jam in QiYaa on your computer or phone and pick the name the guests will see. Your own queue stays and plays on.",
  jamStep2Title: "Invite",
  jamStep2Text:
    "Show the QR code or send the link. Guests need neither the app nor a Yandex account: a browser is enough. A guest with QiYaa for Android can also add tracks from their own likes and playlists.",
  jamStep3Title: "Add tracks",
  jamStep3Text:
    "Guests search Yandex Music and add tracks to the queue. They play in turns, one from each guest, or in the order they were added.",
  jamStep4Title: "Jam vibe",
  jamStep4Text:
    "The guests’ tracks go ahead of your queue, and when they run out, your queue plays on. If it has no vibe of its own, the jam vibe follows, picked to match what the guests added.",
  jamListenTitle: "Listen here",
  jamListenText:
    "If the host allows it, a guest taps Listen here and hears the same music on their phone, roughly in time with the host.",
  jamNote: `Up to 30 guests in a jam. The host decides the order, whether guests may skip and who gets in. On the computer, your own files and Spotify tracks play in the jam too: guests see the title and the artist. The jam server is open source too: <a href="${JAM}">Kickoman/QiYaa-jam</a>.`,

  androidLead:
    "QiYaa for Android: the same Yandex Music in your pocket. Instead of skins it has an interface of its own: dark panels, LED read-outs and one accent colour.",
  androidFeature1:
    "My Vibe, Liked, For you, Wheel of vibes, playlists, artists, albums, stations, search",
  androidFeature2: "10-band equalizer with 17 presets, spectrum and oscilloscope",
  androidFeature3:
    "Plays in the background: controls, like and dislike in the notification, headset buttons",
  androidFeature4: "Economy for Wi-Fi and mobile data separately",
  androidFeature5: "After a playlist, a vibe from its tracks",
  androidFeature6: "Jam: host one right from the phone or join someone else’s as a guest",
  androidFeature7: "Belarusian, Russian and English",
  androidLater: "Spotify, lyrics and your own files are on the computer only, for now.",
  androidInstall:
    "Android 8.0 or newer. The APK is on GitHub Releases, not on Google Play: when Android asks, allow installing from this source. Every release is signed with the same key, so a new APK installs over the old one.",
  androidGet: "Get APK",

  faqTitle: "FAQ",
  faqLoginQ: "How do I log in?",
  faqLoginA:
    "QiYaa shows a code, and you confirm it in a browser at ya.ru/device. You never type your password into the app. If Yaamp was installed before, QiYaa picks up its login by itself.",
  faqSkinsQ: "Where do I get skins?",
  faqSkinsA:
    'Any skin in the classic .wsz format works, for example from the <a href="https://skins.webamp.org">skins.webamp.org</a> archive. Load the file from the player’s menu, and QiYaa will remember it.',
  faqSpotifyQ: "Do I need Spotify Premium?",
  faqSpotifyA:
    "Yes: Spotify lets other apps play only with Premium. Log in with a code at spotify.com/pair or in the browser, and QiYaa never sees your password. For now, Spotify is on the computer only.",
  faqLyricsQ: "Where do the lyrics come from?",
  faqLyricsA:
    'From Yandex Music, from an .lrc file next to the track or from the file’s own tags. Turn on Lyrics from LRCLIB in the menu, and QiYaa also looks in the open <a href="https://lrclib.net">LRCLIB</a> database: there the lyrics almost always have timestamps, and the line follows the music.',
  faqGuestsQ: "Do jam guests need Yandex Music?",
  faqGuestsA:
    "No. A guest in a browser searches through the host’s account, and the music plays at the host’s; to listen along on their own phone, the host has to allow it. A guest in QiYaa for Android searches with their own account and adds tracks from their own likes and playlists.",
  faqDataQ: "What does QiYaa send about itself?",
  faqDataA: `Releases send anonymous usage statistics and crash reports, to show what breaks. Track titles, searches, tokens and account names are never sent. One switch, Send statistics, turns it off. Details: <a href="${DESKTOP}/blob/master/docs/telemetry.md">docs/telemetry.md</a> (in Russian).`,
  faqOfficialQ: "Is this an official client?",
  faqOfficialA:
    "No. QiYaa is an independent open-source project, connected with neither Yandex nor Spotify.",

  footerBased: "Based on Yaamp and webamp.",
  footerTrademark:
    "Not affiliated with Winamp, Yandex or Spotify. “Winamp” and “Spotify” are trademarks of their owners.",
};

export type SiteTextKey = keyof typeof en;
type Texts = Record<SiteTextKey, string>;

const be: Texts = {
  title: "QiYaa: плэер у стылі Winamp для Яндэкс Музыкі, Spotify і сваіх файлаў",
  description:
    "Бясплатны плэер з адкрытым кодам у стылі 2000-х: Яндэкс Музыка, Spotify і свае mp3 ды FLAC, скіны Winamp, тэксты песень і джэм — агульная чарга для кампаніі. Linux, Windows, macOS і Android.",
  languageLabel: "Мова",
  navFeatures: "Магчымасці",
  navJam: "Джэм",
  navAndroid: "Android",
  navFaq: "Пытанні",
  download: "Спампаваць",
  source: "Код",
  version: "Версія",

  heroTagline: "Яндэкс Музыка, Spotify і свае файлы ў тым самым плэеры з 2000-х.",
  heroText:
    "Слухайце Маю хвалю, Spotify і сваю калекцыю mp3 ды FLAC, мяняйце скіны. Націўная праграма на C++ і Qt 6, хуткая ды лёгкая. Ёсць версія для Android і джэм — тое, што мусілі зрабіць ужо даўно.",
  heroFree: "· бясплатна, адкрыты код",
  screenshotAlt: "Галоўнае акно QiYaa са скінам па змаўчанні",

  getTitle: "Спампаваць",
  getText: `Гатовыя зборкі ляжаць у GitHub Releases, кнопкі спампоўваюць апошнюю. Як усталяваць: <a href="${DESKTOP}/blob/master/docs/install.md">docs/install.md</a>.`,
  rowWindowsSetup: "x64 · усталёўшчык",
  rowWindowsZip: "x64 · zip без усталёўкі",
  rowMac: "arm64 · dmg · як атрымаецца",
  buildTitle: "Сабраць",
  buildText: `Патрэбныя CMake 3.21+, кампілятар C++20 і Qt 6.4 ці навейшы. Іншыя сістэмы: <a href="${DESKTOP}/blob/master/docs/building.md">docs/building.md</a>.`,

  featuresTitle: "Магчымасці",
  feature1: "Уваход па кодзе, без пароля ў праграме",
  feature2: "Мая хваля, Кола хваляў, станцыі і пошук",
  feature3: "«Мне падабаецца», плэйлісты, альбомы, выканаўцы",
  feature4: "Spotify Premium: улюбёныя трэкі, плэйлісты, радыё",
  feature5: "Свае mp3, FLAC, WAV, AAC і Ogg — з тэгамі і вокладкамі",
  feature6: "Тэкст песні: з Яндэкса, .lrc і LRCLIB",
  feature7: "Пасля плэйліста грае хваля па яго трэках",
  feature8: "Скіны .wsz: убудаваныя і свае",
  feature9: "Эквалайзер на 10 палос з прэсэтамі",
  feature10: "Спектр, асцылограф і Milkdrop",
  feature11: "Без паўз паміж трэкамі",
  feature12: "Эканомія: утрая менш трафіку",
  feature13: "Медыяклавішы і сістэмны плэер",
  feature14: "Вокны стыкуюцца як у арыгінальным вінампе",
  feature15: "Джэм: агульная чарга прайгравання для кампаніі",
  feature16: "Беларуская, руская і англійская мовы",

  jamTitle: "Джэм",
  jamLead:
    "Агульная чарга прайгравання для кампаніі: сябры дадаюць трэкі са сваіх тэлефонаў, а музыка грае з QiYaa на вашай прыладзе.",
  jamStep1Title: "Пачніце",
  jamStep1Text:
    "Пачніце джэм у QiYaa на камп’ютары ці тэлефоне і выберыце імя, якое ўбачаць госці. Ваша чарга застаецца і грае далей.",
  jamStep2Title: "Запрасіце",
  jamStep2Text:
    "Пакажыце QR-код ці дашліце спасылку. Гасцям не патрэбныя ні праграма, ні акаўнт Яндэкса: досыць браўзера. А госць з QiYaa для Android можа дадаваць трэкі і са сваіх лайкаў і плэйлістоў.",
  jamStep3Title: "Трэкі",
  jamStep3Text:
    "Госці шукаюць у Яндэкс Музыцы і дадаюць трэкі ў чаргу. Яны граюць па чарзе, па адным ад кожнага госця, або хто першы дадасць.",
  jamStep4Title: "Хваля",
  jamStep4Text:
    "Трэкі гасцей становяцца перад вашай чаргой, а калі скончацца, яна грае далей. Калі ў яе няма сваёй хвалі, уключаецца хваля джэма, падабраная па тым, што дадавалі госці.",
  jamListenTitle: "Слухаць тут",
  jamListenText:
    "Калі гаспадар дазволіў, госць націскае «Слухаць тут» і чуе тую ж музыку на сваім тэлефоне, прыкладна разам з гаспадаром.",
  jamNote: `Да 30 гасцей у адным джэме. Гаспадар вырашае, у якім парадку граюць трэкі, ці могуць госці прапускаць і каго пускаць. На камп’ютары ў джэме граюць і свае файлы, і трэкі Spotify: госці бачаць назву і выканаўцу. Сервер джэма таксама з адкрытым кодам: <a href="${JAM}">Kickoman/QiYaa-jam</a>.`,

  androidLead:
    "QiYaa для Android: тая ж Яндэкс Музыка ў кішэні. Замест скінаў мае свой інтэрфейс: цёмныя панэлі, LED-індыкатары і адзін колер акцэнту.",
  androidFeature1:
    "Мая хваля, «Мне падабаецца», «Для вас», Кола хваляў, плэйлісты, выканаўцы, альбомы, станцыі, пошук",
  androidFeature2: "Эквалайзер на 10 палос з 17 прэсэтамі, спектр і асцылограф",
  androidFeature3: "Грае ў фоне: кіраванне, лайк і дызлайк у апавяшчэнні, кнопкі гарнітуры",
  androidFeature4: "Эканомія трафіку асобна для Wi-Fi і мабільнай сеткі",
  androidFeature5: "Пасля плэйліста грае хваля па яго трэках",
  androidFeature6: "Джэм: весці свой проста з тэлефона або зайсці госцем у чужы",
  androidFeature7: "Беларуская, руская і англійская мовы",
  androidLater: "Spotify, тэксты песень і свае файлы пакуль ёсць толькі на камп’ютары.",
  androidInstall:
    "Android 8.0 ці навейшы. APK ляжыць у GitHub Releases, а не ў Google Play: калі Android спытае, дазвольце ўсталёўку з гэтай крыніцы. Усе рэлізы падпісаныя адным ключом, таму новы APK ставіцца па-над старым.",
  androidGet: "Узяць APK",

  faqTitle: "Пытанні",
  faqLoginQ: "Як увайсці ў акаўнт?",
  faqLoginA:
    "QiYaa пакажа код, а вы пацвердзіце яго ў браўзеры на ya.ru/device. Пароль у праграму ўводзіць не трэба. Калі раней стаяў Yaamp, уваход падхопіцца сам.",
  faqSkinsQ: "Дзе ўзяць скіны?",
  faqSkinsA:
    'Падыходзіць любы скін класічнага фармату .wsz. Напрыклад, з архіва <a href="https://skins.webamp.org">skins.webamp.org</a>. Загрузіце файл праз меню плэера, выбар запомніцца.',
  faqSpotifyQ: "Ці патрэбны Spotify Premium?",
  faqSpotifyA:
    "Так: Spotify дае слухаць у старонніх праграмах толькі з Premium. Увайсці можна кодам на spotify.com/pair або ў браўзеры, пароля QiYaa не бачыць. Spotify пакуль ёсць толькі на камп’ютары.",
  faqLyricsQ: "Адкуль бяруцца тэксты песень?",
  faqLyricsA:
    'З Яндэкс Музыкі, з файла .lrc побач з трэкам або з тэгаў самога файла. Калі ўключыць у меню «Тэксты з LRCLIB», QiYaa пашукае і ў адкрытай базе <a href="https://lrclib.net">LRCLIB</a>: там тэксты амаль заўсёды з меткамі часу, і радок ідзе за музыкай.',
  faqGuestsQ: "Ці патрэбная гасцям джэма Яндэкс Музыка?",
  faqGuestsA:
    "Не. Госць з браўзера шукае праз акаўнт гаспадара, а музыка грае ў гаспадара; слухаць на сваім тэлефоне можна, калі гаспадар дазволіў. Госць з QiYaa для Android шукае сваім акаўнтам і дадае трэкі са сваіх лайкаў і плэйлістоў.",
  faqDataQ: "Што QiYaa адпраўляе пра сябе?",
  faqDataA: `Рэлізы адпраўляюць ананімную статыстыку і справаздачы пра збоі, каб было відаць, што ламаецца. Назвы трэкаў, пошук, токены і імя акаўнта не сыходзяць ніколі. Выключаецца адным пунктам «Адпраўляць статыстыку». Падрабязна: <a href="${DESKTOP}/blob/master/docs/telemetry.md">docs/telemetry.md</a>.`,
  faqOfficialQ: "Гэта афіцыйны кліент?",
  faqOfficialA:
    "Не. QiYaa — незалежны праект з адкрытым кодам, ён не звязаны ні з Яндэксам, ні са Spotify.",

  footerBased: "Заснавана на Yaamp і webamp.",
  footerTrademark:
    "Не звязаны з Winamp, Яндэксам і Spotify. «Winamp» і «Spotify» — таварныя знакі іх уладальнікаў.",
};

const ru: Texts = {
  title: "QiYaa: плеер в стиле Winamp для Яндекс Музыки, Spotify и своих файлов",
  description:
    "Бесплатный плеер с открытым кодом в стиле 2000-х: Яндекс Музыка, Spotify и свои mp3 и FLAC, скины Winamp, тексты песен и джем — общая очередь для компании. Linux, Windows, macOS и Android.",
  languageLabel: "Язык",
  navFeatures: "Возможности",
  navJam: "Джем",
  navAndroid: "Android",
  navFaq: "Вопросы",
  download: "Скачать",
  source: "Код",
  version: "Версия",

  heroTagline: "Яндекс Музыка, Spotify и свои файлы в том самом плеере из 2000-х.",
  heroText:
    "Слушайте Мою волну, Spotify и свою коллекцию mp3 и FLAC, подпевайте по тексту песни и меняйте скины. Нативное приложение на C++ и Qt 6, быстрое и лёгкое. Есть версия для Android и джем — то, что надо было сделать уже давно.",
  heroFree: "· бесплатно, открытый код",
  screenshotAlt: "Главное окно QiYaa со скином по умолчанию",

  getTitle: "Скачать",
  getText: `Готовые сборки лежат в GitHub Releases, кнопки скачивают последнюю. Как установить: <a href="${DESKTOP}/blob/master/docs/install.md">docs/install.md</a>.`,
  rowWindowsSetup: "x64 · установщик",
  rowWindowsZip: "x64 · zip без установки",
  rowMac: "arm64 · dmg · по мере сил",
  buildTitle: "Собрать",
  buildText: `Нужны CMake 3.21+, компилятор C++20 и Qt 6.4 или новее. Другие системы: <a href="${DESKTOP}/blob/master/docs/building.md">docs/building.md</a>.`,

  featuresTitle: "Возможности",
  feature1: "Вход по коду, без пароля в приложении",
  feature2: "Моя волна, Колесо волн, станции и поиск",
  feature3: "«Мне нравится», плейлисты, альбомы, исполнители",
  feature4: "Spotify Premium: любимые треки, плейлисты, радио",
  feature5: "Свои mp3, FLAC, WAV, AAC и Ogg с тегами и обложками",
  feature6: "Текст песни: из Яндекса, .lrc и LRCLIB",
  feature7: "После плейлиста играет волна по его трекам",
  feature8: "Скины .wsz: встроенные и свои",
  feature9: "Эквалайзер на 10 полос с пресетами",
  feature10: "Спектр, осциллограф и Milkdrop",
  feature11: "Без пауз между треками",
  feature12: "Экономия: втрое меньше трафика",
  feature13: "Медиаклавиши и системный плеер",
  feature14: "Окна стыкуются, как в оригинальном винампе",
  feature15: "Джем: общая очередь воспроизведения для компании",
  feature16: "Белорусский, русский и английский",

  jamTitle: "Джем",
  jamLead:
    "Общая очередь воспроизведения для компании: друзья добавляют треки со своих телефонов, а музыка играет из QiYaa на вашем устройстве.",
  jamStep1Title: "Начните",
  jamStep1Text:
    "Начните джем в QiYaa на компьютере или телефоне и выберите имя, которое увидят гости. Ваша очередь остаётся и играет дальше.",
  jamStep2Title: "Пригласите",
  jamStep2Text:
    "Покажите QR-код или отправьте ссылку. Гостям не нужны ни приложение, ни аккаунт Яндекса: достаточно браузера. А гость с QiYaa для Android может добавлять треки и из своих лайков и плейлистов.",
  jamStep3Title: "Треки",
  jamStep3Text:
    "Гости ищут в Яндекс Музыке и добавляют треки в очередь. Они играют по очереди, по одному от каждого гостя, или кто первый добавит.",
  jamStep4Title: "Волна",
  jamStep4Text:
    "Треки гостей встают перед вашей очередью, а когда кончатся, она играет дальше. Если у неё нет своей волны, включается волна джема, подобранная по тому, что добавляли гости.",
  jamListenTitle: "Слушать здесь",
  jamListenText:
    "Если хозяин разрешил, гость нажимает «Слушать здесь» и слышит ту же музыку на своём телефоне, примерно одновременно с хозяином.",
  jamNote: `До 30 гостей в одном джеме. Хозяин решает, в каком порядке играют треки, могут ли гости пропускать и кого пускать. На компьютере в джеме играют и свои файлы, и треки Spotify: гости видят название и исполнителя. Сервер джема тоже с открытым кодом: <a href="${JAM}">Kickoman/QiYaa-jam</a>.`,

  androidLead:
    "QiYaa для Android: та же Яндекс Музыка в кармане. Вместо скинов у него свой интерфейс: тёмные панели, LED-индикаторы и один цвет акцента.",
  androidFeature1:
    "Моя волна, «Мне нравится», «Для вас», Колесо волн, плейлисты, исполнители, альбомы, станции, поиск",
  androidFeature2: "Эквалайзер на 10 полос с 17 пресетами, спектр и осциллограф",
  androidFeature3: "Играет в фоне: управление, лайк и дизлайк в уведомлении, кнопки гарнитуры",
  androidFeature4: "Экономия трафика отдельно для Wi-Fi и мобильной сети",
  androidFeature5: "После плейлиста играет волна по его трекам",
  androidFeature6: "Джем: вести свой прямо с телефона или зайти гостем в чужой",
  androidFeature7: "Белорусский, русский и английский",
  androidLater: "Spotify, тексты песен и свои файлы пока есть только на компьютере.",
  androidInstall:
    "Android 8.0 или новее. APK лежит в GitHub Releases, а не в Google Play: когда Android спросит, разрешите установку из этого источника. Все релизы подписаны одним ключом, поэтому новый APK ставится поверх старого.",
  androidGet: "Скачать APK",

  faqTitle: "Вопросы",
  faqLoginQ: "Как войти в аккаунт?",
  faqLoginA:
    "QiYaa покажет код, вы подтверждаете его в браузере на ya.ru/device. Пароль в приложение вводить не нужно. Если раньше стоял Yaamp, вход подхватится сам.",
  faqSkinsQ: "Где взять скины?",
  faqSkinsA:
    'Подходит любой скин классического формата .wsz. Например, из архива <a href="https://skins.webamp.org">skins.webamp.org</a>. Загрузите файл через меню плеера, выбор запомнится.',
  faqSpotifyQ: "Нужен ли Spotify Premium?",
  faqSpotifyA:
    "Да: Spotify даёт слушать в сторонних приложениях только с Premium. Войти можно кодом на spotify.com/pair или в браузере, пароль QiYaa не видит. Spotify пока есть только на компьютере.",
  faqLyricsQ: "Откуда берутся тексты песен?",
  faqLyricsA:
    'Из Яндекс Музыки, из файла .lrc рядом с треком или из тегов самого файла. Если включить в меню «Тексты из LRCLIB», QiYaa поищет и в открытой базе <a href="https://lrclib.net">LRCLIB</a>: там тексты почти всегда с метками времени, и строка идёт за музыкой.',
  faqGuestsQ: "Нужна ли гостям джема Яндекс Музыка?",
  faqGuestsA:
    "Нет. Гость из браузера ищет через аккаунт хозяина, а музыка играет у хозяина; слушать на своём телефоне можно, если хозяин разрешил. Гость из QiYaa для Android ищет своим аккаунтом и добавляет треки из своих лайков и плейлистов.",
  faqDataQ: "Что QiYaa отправляет о себе?",
  faqDataA: `Релизы отправляют анонимную статистику и отчёты о падениях, чтобы было видно, что ломается. Названия треков, поиск, токены и имя аккаунта не уходят никогда. Выключается одним пунктом «Отправлять статистику». Подробно: <a href="${DESKTOP}/blob/master/docs/telemetry.md">docs/telemetry.md</a>.`,
  faqOfficialQ: "Это официальный клиент?",
  faqOfficialA:
    "Нет. QiYaa — независимый проект с открытым кодом, он не связан ни с Яндексом, ни со Spotify.",

  footerBased: "Основано на Yaamp и webamp.",
  footerTrademark:
    "Не связан с Winamp, Яндексом и Spotify. «Winamp» и «Spotify» — товарные знаки их владельцев.",
};

export const SITE_TEXTS: Readonly<Record<SiteLanguage, Texts>> = { be, ru, en };
