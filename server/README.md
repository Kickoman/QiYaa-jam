# `server/` — сервер джема

Держит комнаты джема в памяти: участников, очередь, порядок, права и лимиты. Говорит с хозяином и
гостями по протоколу из `spec/jam/protocol`, отдаёт веб-гостя и `/healthz`. Звук и токен Яндекса
сюда не приходят: поиск и проверку треков сервер только пересылает хозяину. Готовы протокол,
комната, сеть с WebSocket, ключи хозяина, снимки и восстановление после перезапуска.

| Файл или папка | Что там |
|---|---|
| [src/protocol/](src/protocol/README.md) | Типы из схем спецификации и проверка сообщений Ajv |
| [src/room/](src/room/README.md) | Комната как чистый редьюсер: порядок, сиды, права, лимиты, `state` для каждого |
| [src/net/](src/net/README.md) | HTTP и WebSocket: рукопожатие, лимиты, баны, роли, выполнение эффектов комнаты |
| `src/host-keys.ts` | Ключи хозяина: файл `host-keys.json` с SHA-256, проверка, добавление, отзыв |
| `src/cli.ts` | `keys add <name>`, `keys list`, `keys revoke <name>` |
| `src/log.ts` | `log(event, fields)` — строка JSON в stdout |
| `src/main.ts` | Читает окружение, запускает `JamServer`, перечитывает ключи по SIGHUP, выходит по SIGTERM |
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
| `DATA_DIR` | `/data` | Где `host-keys.json` и `rooms.json` (комнаты на время перезапуска) |
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
SIGHUP перечитывает `host-keys.json`; сервер замечает изменение файла и сам, при следующей проверке
ключа.

## `src/host-keys.ts` и `src/cli.ts`

```ts
function readHostKeys(path: string): HostKeyRecord[];              // нет файла — []
function addHostKey(path: string, name: string, key: string, now: Date): void;
function revokeHostKey(path: string, name: string): boolean;
class HostKeys { constructor(path: string); reload(): void; isValid(key: string): boolean }
```

Файл `DATA_DIR/host-keys.json`, права 600, пишется атомарно (временный файл и переименование):

```json
{ "keys": [{ "name": "masha-pc", "sha256": "<64 hex>", "createdAt": "2026-09-30T10:00:00.000Z" }] }
```

- Имя — 1–32 символа `a-z 0-9 -`, уникальное. Ключ — `qjk_` и 43 символа base64url; хранится только
  его SHA-256, сравнение — `timingSafeEqual`.
- `node dist/cli.js keys add <name>` печатает ключ в stdout один раз; потом его не узнать.
  `keys list` — имена и даты, `keys revoke <name>` — отзыв. Код выхода 1 при ошибке пользователя.

**Ловушки:**
- Отозванный ключ перестаёт работать для новых `create` и `resume`, но уже созданные комнаты живут.
