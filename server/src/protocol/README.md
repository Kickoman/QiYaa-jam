# `server/src/protocol/` — сообщения протокола

Типы сообщений и их проверка. Всё берётся из `spec/jam/protocol/schemas`: `npm run generate`
кладёт в `generated/` типы TypeScript и сами схемы. Правила комнаты здесь не живут — только форма
сообщений.

| Файл | Что там |
|---|---|
| `generated/types.ts` | Типы всех сообщений и объектов: `ClientMessage`, `ServerMessage`, `StateMessage`, `Room`, `Track`, `SnapshotData`… Генерируется, в git не попадает |
| `generated/schemas.ts` | Все схемы для Ajv, `schemaBaseId`, списки `clientMessageTypes` и `serverMessageTypes`. Генерируется |
| `validate.ts` | `parseClientMessage`, `isServerMessage` |

## `validate.ts`

```ts
type ParsedClientMessage =
  | { kind: "message"; message: ClientMessage }
  | { kind: "malformed" }                                   // не JSON-объект
  | { kind: "unknown-type" }                                // нет type, чужой или выдуманный
  | { kind: "invalid"; type: ClientMessageType; id: string | null };

function parseClientMessage(text: string): ParsedClientMessage;
function isServerMessage(value: unknown): value is ServerMessage;
```

- `parseClientMessage` принимает текст кадра и проверяет его схемой своего `type`. Неизвестные поля
  пропускаются, как требует протокол. У `invalid` есть `id`, если он есть в сообщении и правильный:
  так `rejected{id, invalid-message}` называет запрос.
- `isServerMessage` — для тестов и отладочных проверок того, что сервер отправляет.
- Тесты читают все примеры из `spec/jam/protocol/examples`: правильные проходят, `invalid-*` —
  нет.

**Ловушки:**
- Ajv создаётся с `strictRequired: false`: схемы спецификации пишут `required` в `if/then`, и
  строгий режим Ajv считает это ошибкой. Остальные строгие проверки включены.
- Типы описывают только известные поля (`additionalProperties: false` при генерации), а схемы
  пропускают неизвестные. Не полагаться на то, что лишних полей в объекте нет.
- `generated/` нужно пересоздать после каждого обновления подмодуля `spec`. `npm run check` делает
  это сам.

## Не здесь

- Кто какое сообщение может слать и что сервер отвечает — в `src/net/` (#8) и `src/room/` (#7).
