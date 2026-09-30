# `server/src/net/` — сеть

HTTP и, позже, WebSocket: всё, что трогает сокеты. Правил комнаты здесь нет. Сейчас только HTTP;
WebSocket, рукопожатие, лимиты на IP и `X-Real-IP` добавит Kickoman/QiYaa-jam#8.

| Файл | Что там |
|---|---|
| `http.ts` | `createHttpServer` — `/healthz`, остальное 404 |

## `http.ts`

```ts
function createHttpServer(): Server;   // node:http, ещё не слушает
```

- `GET /healthz` → 200, `text/plain`, тело `ok\n`. Строка запроса не важна.
- Любой другой метод или путь → 404 с пустым телом (ROOM-62). Статика веба и `/j/<roomId>`
  появятся вместе с веб-гостем.
