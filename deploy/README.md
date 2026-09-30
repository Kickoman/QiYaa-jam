# `deploy/` — как джем живёт на VPS

Сервер джема — один контейнер за имеющимся nginx. nginx держит TLS и проксирует `/` и `/ws` на
`127.0.0.1:8090`. Наружу контейнер порт не публикует. Проверено разведкой
[docs/spikes/vps-websocket.md](../docs/spikes/vps-websocket.md). Compose, ключи хозяина,
обновление и откат добавит Kickoman/QiYaa-jam#12.

| Файл | Что это |
|---|---|
| `Dockerfile` | Образ сервера: сборка на `node:22-alpine`, запуск от `node`, том `/data`, `STOPSIGNAL SIGTERM`, проверка `/healthz` |
| `nginx.conf.example` | `server`-блок nginx: `Upgrade`/`Connection` для `/ws`, `X-Real-IP`, долгий `proxy_read_timeout` |
| `echo/` | Эхо-сервер разведки: тестовая страница, `/healthz`, WebSocket `/ws` с ping раз в 25 с и JSON-логом IP |

## Образ

```bash
docker build -f deploy/Dockerfile -t qiyaa-jam:dev .     # из корня репозитория, с подмодулем spec
docker run --rm -p 127.0.0.1:8090:8090 -v jam-data:/data qiyaa-jam:dev
```

Сборка генерирует типы из `spec/jam/protocol` и компилирует `server/`. В итоговом образе только
`server/dist` и зависимости времени выполнения (`ws`, `ajv`), около 170 МБ вместе с Node. По
`docker stop` сервер получает SIGTERM и выходит с кодом 0. CI собирает образ на каждый push,
запускает его и проверяет `/healthz`. Публикует в `ghcr.io/kickoman/qiyaa-jam`: `edge` с `master`,
`X.Y.Z` с тега `vX.Y.Z`.

## Ключ хозяина

Комнату создаёт только приложение с ключом хозяина. Ключ выдаётся на человека или устройство:

```bash
docker compose exec jam node server/dist/cli.js keys add masha-pc     # печатает ключ один раз
docker compose exec jam node server/dist/cli.js keys list
docker compose exec jam node server/dist/cli.js keys revoke masha-pc
```

Напечатанный ключ вставляется в настройки QiYaa рядом с адресом сервера и больше нигде не
хранится: на сервере лежит только его SHA-256 в `/data/host-keys.json`. Сервер замечает новый или
отозванный ключ сам; `docker compose kill -s SIGHUP jam` перечитывает файл сразу.

## nginx

1. DNS-запись `jam.<домен>` на VPS.
2. `nginx.conf.example` → `/etc/nginx/sites-available/qiyaa-jam`, домен заменить, ссылка в
   `sites-enabled/`.
3. `sudo certbot --nginx -d jam.<домен>` — сертификат, как у остальных поддоменов.
4. `sudo nginx -t && sudo systemctl reload nginx`.

**Ловушки:**
- без `Upgrade`/`Connection` WebSocket не поднимется;
- `X-Real-IP` сервер берёт только от доверенного соседа (`TRUSTED_PROXY`), см. ниже.

## Доверенный прокси

Контейнер получает соединения nginx **от шлюза своей docker-сети**, а не от `127.0.0.1`. Поэтому
подсеть сети compose закреплена, и `TRUSTED_PROXY` — её шлюз:

```yaml
networks:
  default:
    ipam:
      config:
        - subnet: 172.30.90.0/24
          gateway: 172.30.90.1
```

Проверка: в логе контейнера у запросов через nginx `"trusted":true`, а `ip` — адрес клиента.

```bash
docker logs qiyaa-jam-echo 2>&1 | tail -3
```

## Эхо-сервер разведки

```bash
rsync -a --exclude node_modules deploy/echo/ <vps>:qiyaa-jam-echo/
ssh <vps> 'cd qiyaa-jam-echo && docker compose up -d --build'
```

Страница `https://jam.<домен>/` показывает состояние соединения, сколько оно живёт, какой IP видит
сервер и сколько было переподключений. Кнопка «Не гасить экран» держит экран телефона включённым
во время долгой проверки. Удаление: `docker compose down` в той же папке.
