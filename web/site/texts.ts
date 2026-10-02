// The landing's texts: one dictionary per language, the same keys in each. `page.html` names them
// as {{key}}; values may hold inline HTML (links, <b>), and the ones in attributes (title,
// description, screenshotAlt) hold none. Words follow the apps' glossary
// (Kickoman/QiYaa translations/README.md): My Vibe / Мая хваля / Моя волна, never "wave".

export type SiteLanguage = "be" | "ru" | "en";

export const SITE_LANGUAGES: readonly SiteLanguage[] = ["be", "ru", "en"];

const DESKTOP = "https://github.com/Kickoman/QiYaa";
const JAM = "https://github.com/Kickoman/QiYaa-jam";

const en = {
  title: "QiYaa: Yandex Music in a Winamp-style player",
  description:
    "A free, open-source Yandex Music player in the style of the 2000s for Linux, Windows, macOS and Android, with jams: a shared queue for a party.",
  languageLabel: "Language",
  navFeatures: "Features",
  navJam: "Jam",
  navAndroid: "Android",
  navFaq: "FAQ",
  download: "Download",
  source: "Source",
  version: "Version",

  heroTagline: "Yandex Music in that player from the 2000s.",
  heroText:
    "Listen to My Vibe, liked tracks and playlists, search for artists and change skins. A native C++ and Qt 6 app: the windows are quick and never slide off the screen. There is an Android version too, and jams: a shared queue for a party.",
  heroFree: "· free and open source",
  screenshotAlt: "The main window of QiYaa with the default skin, its colours matched to the site",

  getTitle: "Get it",
  getText: `Ready-made builds are on GitHub Releases; the buttons download the latest one. Linux: X11 and Wayland. How to install: <a href="${DESKTOP}/blob/master/docs/install.md">docs/install.md</a> (in Russian).`,
  rowWindowsSetup: "x64 · installer",
  rowWindowsZip: "x64 · portable zip",
  rowMac: "arm64 · dmg · best effort",
  get: "Get",
  buildTitle: "Build it",
  buildText: `You need CMake 3.21+, a C++20 compiler and Qt 6.4 or newer. Other systems: <a href="${DESKTOP}/blob/master/docs/building.md">docs/building.md</a>.`,

  featuresTitle: "Features",
  feature1: "Log in with a code: no password in the app",
  feature2: "My Vibe, Wheel of vibes, stations and search",
  feature3: "Liked, playlists, albums, artists",
  feature4: ".wsz skins: built-in and your own",
  feature5: "10-band equalizer with presets",
  feature6: "Spectrum, oscilloscope and Milkdrop",
  feature7: "No gaps between tracks",
  feature8: "Media keys and the system player",
  feature9: "Windows dock and stay on the screen",
  feature10: "Jam: a shared queue for a party",
  feature11: "Belarusian, Russian and English",

  jamTitle: "Jam",
  jamLead:
    "A shared queue for a party: friends add tracks from their phones, and the music plays from QiYaa on your computer or Android phone.",
  jamStep1Title: "Start",
  jamStep1Text:
    "Start a jam in QiYaa on your computer or phone and pick the name the guests will see.",
  jamStep2Title: "Invite",
  jamStep2Text:
    "Show the QR code or send the link. Guests need neither the app nor a Yandex account: a browser is enough.",
  jamStep3Title: "Add tracks",
  jamStep3Text:
    "Guests search Yandex Music and add tracks to the queue. They play in turns, one from each guest, or first come, first served.",
  jamStep4Title: "Jam vibe",
  jamStep4Text:
    "When the guests’ tracks run out, the jam vibe plays: a vibe that follows what they added.",
  jamListenTitle: "Listen here",
  jamListenText:
    "If the host allows it, a guest taps Listen here and hears the same music on their phone, roughly in time with the host.",
  jamNote: `Up to 30 guests in a jam. The host decides the order, whether guests may skip and who gets in. The jam server is open source too: <a href="${JAM}">Kickoman/QiYaa-jam</a>.`,

  androidLead:
    "QiYaa for Android: the same Yandex Music in your pocket. Instead of skins it has an interface of its own: dark panels, LED read-outs and one accent colour.",
  androidFeature1:
    "My Vibe, Liked, For you, Wheel of vibes, playlists, artists, albums, stations, search",
  androidFeature2: "10-band equalizer with 17 presets, spectrum and oscilloscope",
  androidFeature3:
    "Plays in the background: controls, like and dislike in the notification, headset buttons",
  androidFeature4: "Hosts a jam right from the phone",
  androidFeature5: "Belarusian, Russian and English",
  androidInstall:
    "Android 8.0 or newer. The APK is on GitHub Releases, not on Google Play: when Android asks, allow installing from this source. Every release is signed with the same key, so a new APK installs over the old one.",
  androidGet: "Get APK",

  faqTitle: "FAQ",
  faqLoginQ: "How do I log in?",
  faqLoginA:
    "QiYaa shows a code, and you confirm it in a browser at ya.ru/device. You never type your password into the app. If Yaamp was installed before, QiYaa picks up its login by itself.",
  faqSkinsQ: "Where do I get skins?",
  faqSkinsA:
    'Any classic .wsz skin works, for example from the <a href="https://skins.webamp.org">skins.webamp.org</a> archive. Load the file from the player’s menu; QiYaa remembers the choice.',
  faqGuestsQ: "Do jam guests need Yandex Music?",
  faqGuestsA:
    "No. Guests search through the host’s account, and the music plays at the host’s. To listen along on their own phone, the host has to allow it.",
  faqOfficialQ: "Is this an official client?",
  faqOfficialA: "No. QiYaa is an independent open-source project, not connected with Yandex.",

  footerBased: "Based on Yaamp and webamp.",
  footerTrademark: "Not affiliated with Winamp or Yandex. “Winamp” is a trademark of its owner.",
};

export type SiteTextKey = keyof typeof en;
type Texts = Record<SiteTextKey, string>;

const be: Texts = {
  title: "QiYaa: Яндэкс Музыка ў плэеры ў стылі Winamp",
  description:
    "Бясплатны плэер Яндэкс Музыкі з адкрытым кодам у стылі 2000-х для Linux, Windows, macOS і Android, з джэмамі — агульнай чаргой для кампаніі.",
  languageLabel: "Мова",
  navFeatures: "Магчымасці",
  navJam: "Джэм",
  navAndroid: "Android",
  navFaq: "Пытанні",
  download: "Спампаваць",
  source: "Код",
  version: "Версія",

  heroTagline: "Яндэкс Музыка ў тым самым плэеры з 2000-х.",
  heroText:
    "Слухайце Маю хвалю, улюбёныя трэкі і плэйлісты, шукайце выканаўцаў і мяняйце скіны. Родная праграма на C++ і Qt 6: вокны не тармозяць і не з’язджаюць за экран. Ёсць версія для Android і джэм — агульная чарга для кампаніі.",
  heroFree: "· бясплатна, адкрыты код",
  screenshotAlt: "Галоўнае акно QiYaa са скінам па змаўчанні, колеры падагнаныя пад сайт",

  getTitle: "Спампаваць",
  getText: `Гатовыя зборкі ляжаць у GitHub Releases, кнопкі спампоўваюць апошнюю. Linux — X11 і Wayland. Як усталяваць — <a href="${DESKTOP}/blob/master/docs/install.md">docs/install.md</a> (па-руску).`,
  rowWindowsSetup: "x64 · усталёўшчык",
  rowWindowsZip: "x64 · zip без усталёўкі",
  rowMac: "arm64 · dmg · як атрымаецца",
  get: "Узяць",
  buildTitle: "Сабраць",
  buildText: `Патрэбныя CMake 3.21+, кампілятар C++20 і Qt 6.4 ці навейшы. Іншыя сістэмы — <a href="${DESKTOP}/blob/master/docs/building.md">docs/building.md</a>.`,

  featuresTitle: "Магчымасці",
  feature1: "Уваход па кодзе — без пароля ў праграме",
  feature2: "Мая хваля, Кола хваляў, станцыі і пошук",
  feature3: "«Мне падабаецца», плэйлісты, альбомы, выканаўцы",
  feature4: "Скіны .wsz — убудаваныя і свае",
  feature5: "Эквалайзер на 10 палос з прэсэтамі",
  feature6: "Спектр, асцылограф і Milkdrop",
  feature7: "Без паўз паміж трэкамі",
  feature8: "Медыяклавішы і сістэмны плэер",
  feature9: "Вокны стыкуюцца і не з’язджаюць за экран",
  feature10: "Джэм — агульная чарга для кампаніі",
  feature11: "Беларуская, руская і англійская мовы",

  jamTitle: "Джэм",
  jamLead:
    "Агульная чарга для кампаніі: сябры дадаюць трэкі са сваіх тэлефонаў, а музыка грае з QiYaa на вашым камп’ютары ці Android-тэлефоне.",
  jamStep1Title: "Пачніце",
  jamStep1Text:
    "Пачніце джэм у QiYaa на камп’ютары ці тэлефоне і выберыце імя, якое ўбачаць госці.",
  jamStep2Title: "Запрасіце",
  jamStep2Text:
    "Пакажыце QR-код ці дашліце спасылку. Гасцям не патрэбныя ні праграма, ні акаўнт Яндэкса: хопіць браўзера.",
  jamStep3Title: "Трэкі",
  jamStep3Text:
    "Госці шукаюць у Яндэкс Музыцы і дадаюць трэкі ў чаргу. Яны граюць па чарзе, па адным ад кожнага госця, ці хто першы.",
  jamStep4Title: "Хваля",
  jamStep4Text:
    "Калі трэкі гасцей скончацца, грае хваля джэма — падабраная па тым, што яны дадавалі.",
  jamListenTitle: "Слухаць тут",
  jamListenText:
    "Калі гаспадар дазволіў, госць націскае «Слухаць тут» і чуе тую ж музыку на сваім тэлефоне, прыкладна разам з гаспадаром.",
  jamNote: `Да 30 гасцей у адным джэме. Гаспадар вырашае, у якім парадку граюць трэкі, ці могуць госці прапускаць і каго пускаць. Сервер джэма таксама з адкрытым кодам: <a href="${JAM}">Kickoman/QiYaa-jam</a>.`,

  androidLead:
    "QiYaa для Android: тая ж Яндэкс Музыка ў кішэні. Замест скінаў — свой інтэрфейс: цёмныя панэлі, LED-індыкатары і адзін колер акцэнту.",
  androidFeature1:
    "Мая хваля, «Мне падабаецца», «Для вас», Кола хваляў, плэйлісты, выканаўцы, альбомы, станцыі, пошук",
  androidFeature2: "Эквалайзер на 10 палос з 17 прэсэтамі, спектр і асцылограф",
  androidFeature3: "Грае ў фоне: кіраванне, лайк і дызлайк у апавяшчэнні, кнопкі гарнітуры",
  androidFeature4: "Джэм можна весці проста з тэлефона",
  androidFeature5: "Беларуская, руская і англійская мовы",
  androidInstall:
    "Android 8.0 ці навейшы. APK ляжыць у GitHub Releases, а не ў Google Play: калі Android спытае, дазвольце ўсталёўку з гэтай крыніцы. Усе рэлізы падпісаныя адным ключом, таму новы APK ставіцца па-над старым.",
  androidGet: "Узяць APK",

  faqTitle: "Пытанні",
  faqLoginQ: "Як увайсці ў акаўнт?",
  faqLoginA:
    "QiYaa пакажа код, а вы пацвердзіце яго ў браўзеры на ya.ru/device. Пароль у праграму ўводзіць не трэба. Калі раней стаяў Yaamp, уваход падхопіцца сам.",
  faqSkinsQ: "Дзе ўзяць скіны?",
  faqSkinsA:
    'Падыходзіць любы скін класічнага фармату .wsz — напрыклад, з архіва <a href="https://skins.webamp.org">skins.webamp.org</a>. Загрузіце файл праз меню плэера, выбар запомніцца.',
  faqGuestsQ: "Ці патрэбная гасцям джэма Яндэкс Музыка?",
  faqGuestsA:
    "Не. Госці шукаюць праз акаўнт гаспадара, а музыка грае ў гаспадара. Каб слухаць на сваім тэлефоне, трэба, каб гаспадар гэта дазволіў.",
  faqOfficialQ: "Гэта афіцыйны кліент?",
  faqOfficialA: "Не. QiYaa — незалежны праект з адкрытым кодам, ён не звязаны з Яндэксам.",

  footerBased: "Заснавана на Yaamp і webamp.",
  footerTrademark: "Не звязаны з Winamp і Яндэксам. «Winamp» — таварны знак яго ўладальніка.",
};

const ru: Texts = {
  title: "QiYaa: Яндекс Музыка в плеере в стиле Winamp",
  description:
    "Бесплатный плеер Яндекс Музыки с открытым кодом в стиле 2000-х для Linux, Windows, macOS и Android, с джемами — общей очередью для компании.",
  languageLabel: "Язык",
  navFeatures: "Возможности",
  navJam: "Джем",
  navAndroid: "Android",
  navFaq: "Вопросы",
  download: "Скачать",
  source: "Код",
  version: "Версия",

  heroTagline: "Яндекс Музыка в том самом плеере из 2000-х.",
  heroText:
    "Слушайте Мою волну, любимые треки и плейлисты, ищите исполнителей и меняйте скины. Нативное приложение на C++ и Qt 6: окна не тормозят и не уезжают за экран. Есть версия для Android и джем — общая очередь для компании.",
  heroFree: "· бесплатно, открытый код",
  screenshotAlt: "Главное окно QiYaa со скином по умолчанию, цвета подогнаны под сайт",

  getTitle: "Скачать",
  getText: `Готовые сборки лежат в GitHub Releases, кнопки скачивают последнюю. Linux — X11 и Wayland. Как установить — <a href="${DESKTOP}/blob/master/docs/install.md">docs/install.md</a>.`,
  rowWindowsSetup: "x64 · установщик",
  rowWindowsZip: "x64 · zip без установки",
  rowMac: "arm64 · dmg · по мере сил",
  get: "Скачать",
  buildTitle: "Собрать",
  buildText: `Нужны CMake 3.21+, компилятор C++20 и Qt 6.4 или новее. Другие системы — <a href="${DESKTOP}/blob/master/docs/building.md">docs/building.md</a>.`,

  featuresTitle: "Возможности",
  feature1: "Вход по коду — без пароля в приложении",
  feature2: "Моя волна, Колесо волн, станции и поиск",
  feature3: "«Мне нравится», плейлисты, альбомы, исполнители",
  feature4: "Скины .wsz — встроенные и свои",
  feature5: "Эквалайзер на 10 полос с пресетами",
  feature6: "Спектр, осциллограф и Milkdrop",
  feature7: "Без пауз между треками",
  feature8: "Медиаклавиши и системный плеер",
  feature9: "Окна стыкуются и не уезжают за экран",
  feature10: "Джем — общая очередь для компании",
  feature11: "Белорусский, русский и английский",

  jamTitle: "Джем",
  jamLead:
    "Общая очередь для компании: друзья добавляют треки со своих телефонов, а музыка играет из QiYaa на вашем компьютере или Android-телефоне.",
  jamStep1Title: "Начните",
  jamStep1Text:
    "Начните джем в QiYaa на компьютере или телефоне и выберите имя, которое увидят гости.",
  jamStep2Title: "Пригласите",
  jamStep2Text:
    "Покажите QR-код или отправьте ссылку. Гостям не нужны ни приложение, ни аккаунт Яндекса: хватит браузера.",
  jamStep3Title: "Треки",
  jamStep3Text:
    "Гости ищут в Яндекс Музыке и добавляют треки в очередь. Они играют по очереди, по одному от каждого гостя, или кто первый.",
  jamStep4Title: "Волна",
  jamStep4Text:
    "Когда треки гостей кончатся, играет волна джема — подобранная по тому, что они добавляли.",
  jamListenTitle: "Слушать здесь",
  jamListenText:
    "Если хозяин разрешил, гость нажимает «Слушать здесь» и слышит ту же музыку на своём телефоне, примерно одновременно с хозяином.",
  jamNote: `До 30 гостей в одном джеме. Хозяин решает, в каком порядке играют треки, могут ли гости пропускать и кого пускать. Сервер джема тоже с открытым кодом: <a href="${JAM}">Kickoman/QiYaa-jam</a>.`,

  androidLead:
    "QiYaa для Android: та же Яндекс Музыка в кармане. Вместо скинов — свой интерфейс: тёмные панели, LED-индикаторы и один цвет акцента.",
  androidFeature1:
    "Моя волна, «Мне нравится», «Для вас», Колесо волн, плейлисты, исполнители, альбомы, станции, поиск",
  androidFeature2: "Эквалайзер на 10 полос с 17 пресетами, спектр и осциллограф",
  androidFeature3: "Играет в фоне: управление, лайк и дизлайк в уведомлении, кнопки гарнитуры",
  androidFeature4: "Джем можно вести прямо с телефона",
  androidFeature5: "Белорусский, русский и английский",
  androidInstall:
    "Android 8.0 или новее. APK лежит в GitHub Releases, а не в Google Play: когда Android спросит, разрешите установку из этого источника. Все релизы подписаны одним ключом, поэтому новый APK ставится поверх старого.",
  androidGet: "Скачать APK",

  faqTitle: "Вопросы",
  faqLoginQ: "Как войти в аккаунт?",
  faqLoginA:
    "QiYaa покажет код, вы подтверждаете его в браузере на ya.ru/device. Пароль в приложение вводить не нужно. Если раньше стоял Yaamp, вход подхватится сам.",
  faqSkinsQ: "Где взять скины?",
  faqSkinsA:
    'Подходит любой скин классического формата .wsz — например, из архива <a href="https://skins.webamp.org">skins.webamp.org</a>. Загрузите файл через меню плеера, выбор запомнится.',
  faqGuestsQ: "Нужна ли гостям джема Яндекс Музыка?",
  faqGuestsA:
    "Нет. Гости ищут через аккаунт хозяина, а музыка играет у хозяина. Чтобы слушать на своём телефоне, нужно, чтобы хозяин это разрешил.",
  faqOfficialQ: "Это официальный клиент?",
  faqOfficialA: "Нет. QiYaa — независимый проект с открытым кодом, он не связан с Яндексом.",

  footerBased: "Основано на Yaamp и webamp.",
  footerTrademark: "Не связан с Winamp и Яндексом. «Winamp» — товарный знак его владельца.",
};

export const SITE_TEXTS: Readonly<Record<SiteLanguage, Texts>> = { be, ru, en };
