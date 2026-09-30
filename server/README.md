# `server/` — сервер джема

Держит комнаты джема в памяти: участников, очередь, порядок, права и лимиты. Говорит с хозяином и
гостями по протоколу из `spec/jam/protocol`, отдаёт веб-гостя и `/healthz`. Звук и токен Яндекса
сюда не приходят: поиск и проверку треков сервер только пересылает хозяину. Готовы протокол,
комната и `/healthz`; сеть и WebSocket — Kickoman/QiYaa-jam#8.

| Файл или папка | Что там |
|---|---|
| [src/protocol/](src/protocol/README.md) | Типы из схем спецификации и проверка сообщений Ajv |
| [src/room/](src/room/README.md) | Комната как чистый редьюсер: порядок, сиды, права, лимиты, `state` для каждого |
| [src/net/](src/net/README.md) | HTTP: `/healthz`, остальное — 404 |
| `src/log.ts` | `log(event, fields)` — строка JSON в stdout |
| `src/main.ts` | Читает окружение, запускает HTTP, выходит по SIGTERM |
| `scripts/generate-protocol.mjs` | Генерирует `src/protocol/generated/` из `spec/jam/protocol/schemas` |
| `test/` | Vitest: примеры протокола, эталоны порядка, сценарии `ROOM-` и `SEED-`, HTTP |

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

## `src/log.ts`

```ts
type LogFields = Readonly<Record<string, string | number | boolean | null>>;
function log(event: string, fields?: LogFields): void;   // {"time", "event", ...fields}
```

**Ловушки:**
- в поля не попадают имена, названия треков, тексты поиска и секреты (ROOM-63). Проверять это
  глазами при каждом новом вызове.

## `src/main.ts`

По SIGTERM сервер перестаёт принимать соединения и выходит с кодом 0, когда закрыты текущие.
Docker шлёт именно SIGTERM (`STOPSIGNAL` в `deploy/Dockerfile`). Сохранение комнат при остановке
добавит Kickoman/QiYaa-jam#10.
