# `server/` — сервер джема

Держит комнаты джема в памяти: участников, очередь, порядок, права и лимиты. Говорит с хозяином и
гостями по протоколу из `spec/jam/protocol`, отдаёт веб-гостя и `/healthz`. Звук и токен Яндекса
сюда не приходят: поиск и проверку треков сервер только пересылает хозяину. Готовы протокол,
комната, сеть с WebSocket, лимиты на комнаты, снимки и восстановление после перезапуска.

| Файл или папка | Что там |
|---|---|
| [src/protocol/](src/protocol/README.md) | Типы из схем спецификации и проверка сообщений Ajv |
| [src/room/](src/room/README.md) | Комната как чистый редьюсер: порядок, сиды, права, лимиты, `state` для каждого |
| [src/net/](src/net/README.md) | HTTP и WebSocket: рукопожатие, лимиты, баны, роли, выполнение эффектов комнаты |
| `src/log.ts` | `log(event, fields)` — строка JSON в stdout |
| `src/main.ts` | Читает окружение, запускает `JamServer`, выходит по SIGTERM |
| `scripts/generate-protocol.mjs` | Генерирует `src/protocol/generated/` из `spec/jam/protocol/schemas` |
| `test/` | Vitest: примеры протокола, эталоны порядка, сценарии `ROOM-` и `SEED-`, HTTP, WebSocket на настоящем порту |

Зависимости идут в одну сторону: `main → net → room → protocol`. Комната чистая и без сети:

```bash
grep -rlnE 'from "(ws|node:net|node:http)"' server/src/room/   # должно ничего не выводить
```

## Команды

| Команда | Что делает |
|---|---|
| `npm run generate` | Типы и схемы из `spec/jam/protocol/schemas` → `src/protocol/generated/` |
| `npm run typecheck` | `tsc` без сборки, вместе с тестами |
| `npm test` | Vitest |
| `npm run build` | `src/` → `dist/` |
| `npm run check` | Всё вышеперечисленное по порядку |
| `npm start` | `node dist/main.js` |

## Окружение

| Переменная | По умолчанию | Что это |
|---|---|---|
| `HOST` | `0.0.0.0` | Адрес, на котором слушать |
| `PORT` | `8090` | Порт; не число от 0 до 65535 — ошибка при запуске |
| `PUBLIC_URL` | `http://localhost:<PORT>` | Внешний адрес: из него `joinUrl` и единственный разрешённый `Origin` |
| `TRUSTED_PROXY` | `127.0.0.1` | Через запятую: от кого верить `X-Real-IP` |
| `DATA_DIR` | `/data` | Где `rooms.json` (комнаты на время перезапуска) |
| `ASSETLINKS_JSON` | нет | Тело `/.well-known/assetlinks.json` для Android App Links; не JSON — ошибка при запуске |
| `WEB_ROOT` | нет | Папка собранного веб-гостя; без неё `/` и `/j/…` отвечают 404 |

## `src/log.ts`

```ts
type LogFields = Readonly<Record<string, string | number | boolean | null>>;
function log(event: string, fields?: LogFields): void;   // {"time", "event", ...fields}
```

**Ловушки:**
- в поля не попадают имена, названия треков, тексты поиска и секреты (ROOM-63). Проверять это
  глазами при каждом новом вызове.

## `src/main.ts`

По SIGTERM сервер пишет комнаты в `DATA_DIR/rooms.json`, закрывает соединения с 1001 и выходит с
кодом 0; при запуске читает этот файл и удаляет его (REC-10). Docker шлёт именно SIGTERM
(`STOPSIGNAL` в `deploy/Dockerfile`), а `stop_grace_period` в compose должен оставить на это время.
Ключей хозяина нет (до 2026-10-01 были): комнату создаёт любое приложение, а от злоупотреблений
защищают лимиты на комнаты одного IP и всего сервера (ROOM-02, ROOM-03). Старый `host-keys.json` в
томе данных сервер не читает, его можно удалить.
