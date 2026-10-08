# `server/src/net/` — сеть

Всё, что трогает сокеты: HTTP, WebSocket, рукопожатие, лимиты на IP и частоту, баны, роли
соединений и выполнение эффектов комнаты. Правил комнаты здесь нет — их решает `src/room/`, а
`net` только передаёт ему события и делает то, что он вернул.

| Файл | Что там |
|---|---|
| `server.ts` | `JamServer` — HTTP + WebSocket, реестр комнат, соединения, лимиты, таймеры |
| `http.ts` | `createHttpServer` — `/healthz`, `assetlinks.json`, лендинг и веб-гость, остальное 404 |
| `ids.ts` | `ids` — случайные `roomId`, `publicId`, секреты, id запросов и соединений |
| `real-ip.ts` | `clientIp`, `parseTrustedProxies` — IP клиента с учётом `X-Real-IP` |
| `rate-limit.ts` | `RateLimiter` (token bucket), `Violations` (нарушения и бан) |
| `persistence.ts` | `saveRooms`, `takeRooms` — файл комнат на время планового перезапуска |
| `telemetry.ts` | `TelemetryReceiver` — `POST /api/telemetry` (spec/telemetry): проверка пакета, лимиты, по строке лога на событие |
| `room-log.ts` | `roomChanges`, `roomSummary`, `Tally` — события комнаты для логов из разницы двух состояний и итог комнаты |

Зависимости: `net → room → protocol`. `ws` импортирует только `server.ts`.

## `server.ts`

```ts
class JamServer {
  constructor(options: JamServerOptions);
  readonly http: Server;
  get roomCount(): number;
  listen(port: number, host: string): Promise<AddressInfo>;
  close(): Promise<void>;   // соединения закрываются с 1001
}
type JamServerOptions = HttpOptions & {
  publicUrl: string;                       // его origin — единственный разрешённый Origin браузера
  trustedProxies: ReadonlySet<string>;
  roomsFile?: string | null;               // файл комнат: читается при запуске, пишется в close()
  now?: () => number;                      // для тестов
  timing?: Partial<{ handshakeMs; pingIntervalMs; deadAfterMs; snapshotIntervalMs }>;   // для тестов
};
```

Путь соединения:

1. **Upgrade** на `/ws` (другой путь — 404). Отказ до WebSocket: IP в бане — 429 (ROOM-57); чужой
   `Origin` — 403, без `Origin` можно (ROOM-59); открытых соединений с IP уже максимум или новых за
   минуту слишком много — 429 (ROOM-58).
2. **Рукопожатие.** Первое сообщение — `hello` за `HANDSHAKE_MS`, иначе закрытие с 1008 и нарушение
   (ROOM-54). Чужая версия протокола — `rejected{update-required, serverProtocol}` и закрытие с 1000,
   это не нарушение.
3. **Без роли:** `create` (не из браузера; лимиты на новую комнату, см. ниже),
   `join` (сначала лимит неудачных входов с IP), `resume`. Остальное — `not-allowed`.
   `resume` (не из браузера): живая комната получает событие `resume` сразу. Незнакомая поднимается
   из снимка, если он есть, про эту комнату, проходит `snapshotProblem`, SHA-256 секрета совпадает и
   лимиты на новую комнату пропускают; иначе `room-not-found`, `bad-secret`, `server-full` или
   `rate-limited` (REC-06…09).
4. **С ролью:** у гостя сначала лимиты `add` и `search` на участника, затем событие в комнату.
   Каждое сообщение получает свежие `requestId` и `joinSecret` для редьюсера.

**Лимиты на новую комнату** (`create` и подъём из снимка, ROOM-02, ROOM-03): сначала
`ROOMS_PER_SERVER` на сервер (`server-full`), затем `IP_LIVE_ROOMS` живых комнат и
`IP_ROOMS_PER_HOUR` новых за час с IP соединения (`rate-limited`, в логе `rooms_limited`). Комната
считается за IP, с которого её создали или подняли, всю жизнь: `roomIps` (только в памяти, не в
снимке и не в файле комнат; после перезапуска старые комнаты ни за кем не числятся). Отказ не
тратит лимит.

Проверка каждого кадра: бинарный — 1008; больше лимита соединения — 1009 (ROOM-55); не JSON-объект
или неизвестный `type` — 1008; известный, но не по схеме — `rejected{id?, invalid-message}` и 1008
(ROOM-56). Каждое закрытие с 1008 и 1009 — нарушение для IP; третье за `BAN_MS` — бан на `BAN_MS`.

Лимит кадра соединения: 4 КиБ до `hello` и для браузера и гостей; 256 КиБ для desktop и android до
роли и для хозяина. Кадр больше 256 КиБ `ws` обрывает сам с 1009, это тоже считается нарушением.

Эффекты комнаты выполняются так, как описано в [`src/room/README.md`](../room/README.md): `state`
уходит каждому соединению комнаты со своим `you`, `to-host` — соединению хозяина, `timer` —
`setTimeout`, который потом присылает `timeout`; `drop` — `kicked` и 1000; `end` — `ended` всем, 1000,
комната удаляется вместе с её таймерами.

Ping — каждые `PING_INTERVAL_MS`; соединение без pong дольше `DEAD_AFTER_MS` обрывается (ROOM-61).
Там же чистятся пустые корзины лимитов, и каждая комната получает `tick` — так истекают комнаты.

**Снимки (REC-12).** После каждого эффекта `state` хозяин получает `snapshot`: сразу, если с прошлого
прошло `SNAPSHOT_INTERVAL_MS`, иначе один отложенный — с последним состоянием комнаты.

**Новый хозяин вытесняет старого (REC-04).** Когда соединение становится хозяином, прежние
соединения хозяина помечаются `replaced`, закрываются с 1000 и больше ничего не получают и не шлют.
Их закрытие всё равно уменьшает счётчик соединений хозяина.

**Плановый перезапуск (REC-10).** `close()` пишет все комнаты снимками в `roomsFile` (временный файл
и переименование), потом закрывает соединения с 1001. При запуске файл читается и удаляется;
комнаты, не прошедшие схему или `snapshotProblem`, пропускаются с записью в лог. Битый файл
переименовывается в `rooms.json.broken`.

**Ловушки:**
- Лимиты `add` и `search` считаются на участника (`roomId/publicId`), а не на соединение: две
  вкладки одного гостя делят один лимит.
- Неудачный вход — это `bad-secret` и `room-not-found`. Когда их с IP больше лимита, даже верный
  секрет получает `rate-limited` (ROOM-58).
- Логи не содержат имён, названий треков, текстов поиска и секретов (ROOM-63). IP в логах есть:
  по нему разбираются с баном.

## `http.ts`

```ts
function createHttpServer(options: {
  assetlinksJson: string | null;
  webRoot: string | null;
  trustedProxies?: ReadonlySet<string>;   // для client_ip в логах и лимитов телеметрии
}): Server;
```

| Путь (`GET` или `HEAD`, у телеметрии — `POST`) | Ответ |
|---|---|
| `/healthz` | 200 `ok` |
| `POST /api/telemetry` | пакет телеметрии (`spec/telemetry`): 204, или 400 / 413 / 429; события — строками лога в потоке `telemetry` (TEL-11, TEL-12) |
| `/.well-known/assetlinks.json` | тело из `ASSETLINKS_JSON`, если задано |
| `/`, `/ru`, `/en` | лендинг: `webRoot/site/be.html`, `ru.html`, `en.html`, `no-cache` |
| `/j/<roomId>` | веб-гость: `webRoot/index.html`, `no-cache` |
| `/assets/…` | файл из `webRoot/assets/`, кэш на год |
| всё остальное | 404 с пустым телом (ROOM-62) |

На `HEAD` Node сам не шлёт тело, поэтому `HEAD` идёт тем же путём, что `GET`.

**Ловушки:**
- Путь нормализуется и сверяется с `webRoot`: `..` наружу не выпускает, это проверяет тест с сырым
  запросом. `fetch` сам схлопывает `..`, поэтому им такое не проверить.

## `real-ip.ts`

```ts
function parseTrustedProxies(value: string | undefined): ReadonlySet<string>;   // по умолчанию {"127.0.0.1"}
function clientIp(remoteAddress, realIpHeader, trustedProxies): string;
```

`X-Real-IP` берётся, только если соединение пришло от доверенного адреса (ROOM-60). В Docker это шлюз
сети compose, а не `127.0.0.1` — см. `deploy/README.md`.

## `rate-limit.ts`

```ts
class RateLimiter { constructor(capacity: number, windowMs: number); take(key, now): boolean; allows(key, now): boolean; spend(key, now): void; forgetIdle(now): void }
class Violations { constructor(beforeBan: number, banMs: number); record(ip, now): boolean /* true — забанен */; isBanned(ip, now): boolean }
```

`RateLimiter` — token bucket: сразу можно `capacity` раз, дальше `capacity` за `windowMs`
равномерно. `spend` списывает попытку, даже если корзина пуста: так считаются неудачные входы.
