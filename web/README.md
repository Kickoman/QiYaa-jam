# `web/` — веб-гость

Страница, которую гость открывает по ссылке `https://<сервер>/j/<roomId>#<joinSecret>`: войти с
именем, видеть, что играет и что в очереди, искать и добавлять треки. Preact + Vite + TypeScript,
тёмная тема и шрифты QiYaa для Android, русский и английский. Сервер отдаёт собранную папку
`web/dist` (`WEB_ROOT`). Сейчас готов каркас (Kickoman/QiYaa-jam#13): токены, язык, соединение с
сервером; экраны входа и комнаты — #14, поиск — #15, крайние случаи — #16.

| Файл | Что там |
|---|---|
| `src/main.tsx` | Точка входа: стили и `App` |
| `src/app.tsx` | `App` — шапка с переключателем языка, состояние соединения |
| `src/theme.css` | Токены: цвета, шрифты, размеры; `@font-face` IBM Plex |
| `src/app.css` | Стили каркаса |
| `src/i18n.ts` | Тексты на русском и английском, выбор языка |
| `src/link.ts` | `parseJoinLink`, `socketUrl` — комната и секрет из адреса |
| `src/storage.ts` | `participantId` и имя на комнату в `localStorage` |
| `src/protocol/client.ts` | `JamConnection` — рукопожатие, смещение часов, переподключение |
| `src/fonts/` | IBM Plex Sans и Mono, 400/500/600, латиница и кириллица, OFL |
| `scripts/budget.mjs` | Проверка бюджета: до 100 КиБ gzip без шрифтов |

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev -w web` | Vite на :5173 с прокси `/ws` на :8090 |
| `npm run build -w web` | Сборка в `web/dist` |
| `npm run check -w web` | Типы, тесты, сборка, бюджет |

Для живой разработки с сервером и имитатором хозяина:

```bash
PUBLIC_URL=http://localhost:5173 npm run dev     # сервер на :8090 с этим адресом в ссылке и Origin
npm run dev -w web                               # в соседнем терминале
```

`PUBLIC_URL` нужен, потому что сервер пускает браузер только со своего `Origin` (ROOM-59).

## Токены

Цвета и стили текста перенесены из `QiYaa-android/app/src/main/java/io/github/kickoman/qiyaa/ui/theme/`
(`Color.kt`, `Type.kt`), акцент — классический зелёный. Имена — те же, в kebab-case
(`--text-secondary`, `--accent-background`). Стили текста — `--caption`, `--label`, `--button`,
`--readout`, `--hint` (Plex Mono, с `letter-spacing`), `--body`, `--title` (Plex Sans). Цель касания —
`--touch` (48 px).

## Шрифты

Файлы woff2 разбиты по `unicode-range`: браузер скачивает только те, что нужны для текста на
странице. 12 файлов по 17–22 КБ. В бюджет не входят. Внешних запросов у страницы нет, кроме
обложек с `avatars.yandex.net`; `<meta name="referrer" content="no-referrer">` не даёт им узнать
адрес комнаты.

## `src/protocol/client.ts`

```ts
class JamConnection {
  constructor(options: { url; appVersion; onMessage; onStatus; onWelcome }, environment: ClientEnvironment);
  start(): void;  stop(): void;  networkBack(): void;
  send(message: ClientMessage): boolean;       // false — сейчас нет связи
  get clockOffsetMs(): number;  serverNow(): number;
}
```

- После открытия шлёт `hello`, после `welcome` — `online`, `onWelcome` (там приложение шлёт `join`).
- Смещение часов — `serverTime − сейчас` из `welcome` и каждого `state`.
- Обрыв — `offline` и переподключение через 1, 2, 4, 8, 16, 30, 30 … с; `welcome` сбрасывает счёт.
  `networkBack()` (событие `online` браузера) подключается сразу.
- `stop()` — навсегда: после `ended`, `kicked`, `update-required`.
- `ClientEnvironment` подменяется в тестах: сокет, часы и таймеры.

**Ловушки:**
- Типы сообщений импортируются из `server/src/protocol/generated/types.ts` только как типы: сборка их
  стирает, а `npm run generate` нужен для проверки типов.
