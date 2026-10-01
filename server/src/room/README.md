# `server/src/room/` — комната

Правила комнаты из `spec/jam/room.md`, `ordering/` и `seeds.md` в виде чистых функций. На вход —
текущая комната, событие и время. На выход — новая комната и список эффектов: что отправить, кому,
когда разбудить. Сокетов, таймеров, часов и случайности здесь нет: время приходит в `context.now`,
новые id и секреты — в самом событии. Соединения, лимиты на IP и частоту, рукопожатие, реестр
комнат, частота снимков и файл комнат — в [`src/net/`](../net/README.md).

| Файл | Что там |
|---|---|
| `types.ts` | `RoomState`, `Participant`, `Item`, `RecentItem`, `PendingRequest`, `RoomEvent`, `Effect`, `Outcome` |
| `room.ts` | `createRoom`, `reduce`, `joinUrl`, `isHostOnline`, `isPublicIdFree` |
| `ordering.ts` | `orderQueue` — порядок очереди по `spec/jam/ordering` |
| `seeds.ts` | `pickSeeds`, `nextFallback` — сиды волны по `spec/jam/seeds.md` |
| `snapshot.ts` | `toSnapshot`, `fromSnapshot`, `snapshotProblem` — снимок комнаты по `recovery.md` |
| `view.ts` | `stateFor`, `roomFor`, `orderedQueue` — `state` для одного участника |
| `limits.ts` | Все числа из `spec/jam/limits.md` |
| `secrets.ts` | `hashSecret` — SHA-256 в hex |

Зависимости: `room → protocol` (только типы). Никакой сети:

```bash
grep -rlnE 'from "(ws|node:net|node:http)"' server/src/room/   # должно ничего не выводить
```

## `room.ts`

```ts
function createRoom(create: CreateRoom, context: RoomContext): Outcome;
function reduce(room: RoomState, event: RoomEvent, context: RoomContext): Outcome;
function joinUrl(publicUrl: string, roomId: string, joinSecret: string): string;
function isHostOnline(room: RoomState): boolean;
function isExpired(room: RoomState, now: number): boolean;
function isPublicIdFree(room: RoomState, publicId: string): boolean;

type RoomContext = { now: number; publicUrl: string };
type Outcome = { room: RoomState | null; effects: readonly Effect[] };   // room null — комната закончилась
```

События (`RoomEvent`):

| `kind` | Когда его шлёт `net` | Поля |
|---|---|---|
| `join` | соединение без роли прислало `join` | `connection`, `id`, `participantId`, `joinSecret`, `name`, `participantKind` (`web`/`qiyaa` из `hello.app`), `newPublicId` — свободный (`isPublicIdFree`) |
| `disconnected` | закрылось соединение участника | `publicId` |
| `message` | участник прислал проверенное схемой сообщение | `connection`, `from`, `message`, `fresh: {requestId, joinSecret}` — новые случайные значения на каждое сообщение |
| `resume` | хозяин прислал `resume`; комната живая или только что поднята из снимка | `connection`, `id`, `hostSecret`, `outbox`, `restored` |
| `timeout` | наступило время из эффекта `timer` | `requestId` |
| `tick` | периодически, раз в `PING_INTERVAL_MS` | — |

Эффекты (`Effect`) идут в том порядке, в каком `net` должен их выполнить:

| `kind` | Что сделать |
|---|---|
| `send` | отправить `message` в соединение `connection` |
| `admit` | привязать соединение к участнику `publicId` |
| `state` | каждому соединению комнаты — `stateFor(room, его publicId, now)` |
| `to-host` | отправить `message` в соединение хозяина |
| `timer` | в момент `at` прислать событие `timeout` с этим `requestId` |
| `drop` | всем соединениям участника — `kicked`, закрыть с кодом 1000 |
| `end` | всем соединениям — `ended{reason}`, закрыть с кодом 1000, удалить комнату |

Гарантии:
- Ответ на запрос (`ack`, `joined`, `rejected`…) всегда идёт раньше `state`, который показывает его
  результат.
- `version` растёт на 1 и `state` рассылается, только когда меняется то, что видно в `state`
  (ROOM-50, ROOM-51). Кэш поиска, запросы к хозяину и второе соединение того же участника версию
  не меняют.
- Отказ никогда не меняет комнату: `reduce` возвращает тот же объект.
- Секретов в `RoomState` нет, только хэши (ROOM-64). Сырые `participantId` и `joinSecret` видит
  только `onJoin` и сразу хэширует.

**Ловушки:**
- `newPublicId` должен быть свободен. Занятый — это ошибка вызывающего, и `reduce` бросает
  исключение.
- `recent[].playedAt` — время, когда элемент **перестал** быть текущим, а `lastServedAt` —
  когда он **начал** играть.
- Кэш результатов поиска (`searchCache`) и запросы к хозяину (`pending`) в снимок не попадают:
  после восстановления гость ищет заново.
- Когда хозяин уходит, все запросы к нему сразу получают `host-offline`, не дожидаясь тайм-аута.
- Лимиты частоты (`add`, `search`) проверяет `net`, а не комната.
- `resume` проверяет только секрет хозяина. Можно ли поднять комнату из снимка (снимок, секрет,
  лимиты на комнаты), решает `net` до события.
- `tick` заканчивает комнату (`end{expired}`), когда хозяина нет `ROOM_WITHOUT_HOST_MS` (REC-05) или
  ей `ROOM_MAX_AGE_MS` (ROOM-53). `hostLeftAt` ставится, когда закрывается последнее соединение
  хозяина, и сбрасывается при `resume`.

## `snapshot.ts`

```ts
function toSnapshot(room: RoomState): SnapshotData;                     // {format: 1, room}, секреты — хэшами
function snapshotProblem(data: SnapshotData, now: number): string | null;   // null — можно поднимать
function fromSnapshot(data: SnapshotData, now: number): RoomState;
```

- `toSnapshot` проходит схему `snapshot-data` и не содержит секретов — это проверяет тест.
- `snapshotProblem` ловит то, что схема не видит: комната старше `ROOM_MAX_AGE_MS` (REC-07), не
  ровно один хозяин, повтор `publicId` или `itemId`, `itemId` не меньше `nextItemNumber`.
- `fromSnapshot`: все участники не в сети, `hostLeftAt` = `now`, кэш поиска и запросы к хозяину
  пустые. Сиды пересчитываются, `seedsVersion` растёт, только если набор другой (SEED-10).
- Файл комнат при плановом перезапуске (`net/persistence.ts`) хранит те же снимки.

## `ordering.ts`

```ts
function orderQueue<T extends Orderable>(items: readonly T[], mode: OrderMode, lastServedAt: ReadonlyMap<string, number>): T[];
function itemNumber(itemId: string): number;   // "i10" → 10
```

Правило — в `spec/jam/ordering/README.md`, тесты — все его эталоны. Номер элемента сравнивается
как число, а не как строка.

## `seeds.ts`

```ts
function pickSeeds(candidates: readonly SeedCandidate[]): string[];            // до 5 "track:<id>"
function nextFallback(current: Fallback, candidates: readonly SeedCandidate[]): Fallback;
```

`seedsVersion` растёт, только если меняется **набор** сидов (SEED-05, SEED-08). `room.ts`
пересчитывает сиды после каждого видимого изменения.

## `view.ts`

```ts
function stateFor(room: RoomState, publicId: string, now: number): StateMessage;
```

Очередь — в порядке воспроизведения, у каждого свой `you`. Тест проверяет, что `state` любого
участника проходит схему протокола и не содержит ни одного секрета.
