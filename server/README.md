# `server/` — сервер джема

Держит комнаты джема в памяти: участников, очередь, порядок, права и лимиты. Говорит с хозяином и
гостями по протоколу из `spec/jam/protocol`, отдаёт лендинг, веб-гостя и `/healthz`, принимает
телеметрию приложений (`POST /api/telemetry`, `spec/telemetry`). Звук и токен Яндекса
сюда не приходят: поиск и проверку треков сервер только пересылает хозяину. Готовы протокол,
комната, сеть с WebSocket, лимиты на комнаты, снимки и восстановление после перезапуска.

| Файл или папка | Что там |
|---|---|
| [src/protocol/](src/protocol/README.md) | Типы из схем спецификации и проверка сообщений Ajv |
| [src/room/](src/room/README.md) | Комната как чистый редьюсер: порядок, сиды, права, лимиты, `state` для каждого |
| [src/net/](src/net/README.md) | HTTP и WebSocket: рукопожатие, лимиты, баны, роли, выполнение эффектов комнаты |
| `src/log.ts` | `log.info(event, fields)` и др. — строка JSON в stdout по общей схеме логов |
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
| `WEB_ROOT` | нет | Папка собранного `web/` (лендинг и веб-гость); без неё `/`, `/ru`, `/en` и `/j/…` отвечают 404 |
| `SERVICE_NAME` | `qiyaa-jam` | Поле `service` в логах |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` или `error`: что ниже — не пишется |
| `JAM_VERSION` | `dev` | Версия в событии `startup`; на VPS — тег из `tag.env` |

## `src/log.ts`

```ts
type LogFields = Readonly<Record<string, string | number | boolean | null>>;
const log: { debug, info, warn, error: (event: string, fields?: LogFields) => void };  // поток internal
function emit(level, stream: "http_request" | "internal", event: string, fields?: LogFields): void;
function configureLog(options: { write?; level? }): void;   // тесты: куда писать и какой уровень
```

Одна строка JSON на событие в stdout, в схеме общего хранилища логов: `ts`, `service`, `stream`,
`level`, `event`, `message`, у запросов — `http_method`, `http_path`, `http_status`,
`duration_ms`. Остальные поля коллектор кладёт в `attrs`. Логи собирает агент на хосте: он читает
контейнеры с меткой `logging: "true"` (`deploy/compose.yml`), сам сервер никуда их не шлёт.

| Событие | Когда | Поля |
|---|---|---|
| `startup`, `shutdown` | запуск (по нему считаются падения в цикле), SIGTERM | `version`, `rooms` |
| `http_request` (поток `http_request`) | каждый HTTP-запрос и апгрейд `/ws` | маршрут (`/j/{roomId}`, неизвестное — `/*` и `raw_path`), статус, длительность, `client_ip`, `peer_ip`, `user_agent`, `referrer_host` у страниц, `reason` у отказа в апгрейде |
| `ws_hello`, `ws_close`, `ws_dead` | приложение поздоровалось; соединение закрылось | `app`, `app_version`; `role`, `code`, `seconds` |
| `room_created`, `room_restored`, `room_ended` | комната появилась, поднята из снимка, закончилась | настройки и `app` хозяина; итог комнаты: `minutes`, `guests`, `guest_tracks`, `host_tracks`, `played_items`, `played_vibe`, `searches`, `kicked`, `listen_shared` |
| `guest_joined`, `guest_kicked`, `guest_search`, `track_added`, `track_started`, `listen_shared`, `host_left`, `host_back`, `settings_changed` | события в комнате, из разницы состояний (`net/room-log.ts`) | вид гостя, кто добавил, источник трека (`item`/`vibe`), есть ли ссылка для прослушивания |
| `jam_stats` | раз в минуту | `rooms`, `hosts_online`, `guests`, `guests_online`, `rooms_sharing`, `queued`, `connections` и по приложениям, `rss_mb`, `heap_mb` |
| `rejected`, `violation`, `ban`, `rooms_limited` | отказы и нарушения | `reason`, `code`, `client_ip` |
| `app_start`, `app_exit`, `app_crash`, `app_unclean_exit`, `app_error`, `app_feature` (поток `telemetry`, `service: qiyaa-desktop`) | телеметрия приложения ПК, принятая на `POST /api/telemetry` | поля события из `spec/telemetry` в snake_case, `machine`, `client_ip`, `client_at`; у крэша — `frames` строкой и `signature` (сигнал и первые четыре кадра) |

`/assets/*` и `/healthz` пишутся на уровне `debug`, то есть при `LOG_LEVEL=info` не пишутся.

**Ловушки:**
- в поля не попадают имена, названия треков, тексты поиска, секреты, `roomId` и `participantId`
  (ROOM-63). `test/net/logs.test.ts` проводит вечер джема и ищет всё это в логах; новое поле —
  проверять тем же тестом.
- числа в `attrs` хранятся строками: в SQL их читают через `toFloat64OrZero(attrs['rooms'])`.

## `src/main.ts`

По SIGTERM сервер пишет комнаты в `DATA_DIR/rooms.json`, закрывает соединения с 1001 и выходит с
кодом 0; при запуске читает этот файл и удаляет его (REC-10). Docker шлёт именно SIGTERM
(`STOPSIGNAL` в `deploy/Dockerfile`), а `stop_grace_period` в compose должен оставить на это время.
Ключей хозяина нет (до 2026-10-01 были): комнату создаёт любое приложение, а от злоупотреблений
защищают лимиты на комнаты одного IP и всего сервера (ROOM-02, ROOM-03). Старый `host-keys.json` в
томе данных сервер не читает, его можно удалить.
