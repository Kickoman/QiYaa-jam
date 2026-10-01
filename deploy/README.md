# `deploy/` — как джем живёт на VPS

Сервер джема — один контейнер за имеющимся nginx. nginx держит TLS и проксирует `/` и `/ws` на
`127.0.0.1:8090`. Наружу контейнер порт не публикует. Проверено разведкой
[docs/spikes/vps-websocket.md](../docs/spikes/vps-websocket.md).

| Файл | Что это |
|---|---|
| `Dockerfile` | Образ сервера: сборка на `node:22-alpine`, запуск от `node`, том `/data`, `STOPSIGNAL SIGTERM`, проверка `/healthz` |
| `compose.yml` | Сервер на VPS: образ из GHCR по тегу, `127.0.0.1:8090`, том `data`, закреплённая подсеть, 30 с на остановку, ротация логов |
| `deploy.sh` | Деплой тега `vX.Y.Z`: берёт `compose.yml` этого тега, `pull`, `up -d`; он же — принудительная команда ключа деплоя |
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

## Первая установка

На VPS, в `~/qiyaa-jam`:

```bash
mkdir -p ~/qiyaa-jam && cd ~/qiyaa-jam
curl -fsSLO https://raw.githubusercontent.com/Kickoman/QiYaa-jam/master/deploy/deploy.sh && chmod +x deploy.sh
printf 'PUBLIC_URL=https://jam.<домен>\n' > .env        # и ASSETLINKS_JSON=… для Android App Links
./deploy.sh vX.Y.Z
```

`.env` в репозиторий не попадает: там настоящий домен. Порт `127.0.0.1:8090` и подсеть
`172.30.90.0/24` не должны быть заняты (эхо разведки занимало ровно их).

## Деплой из CI

Тег `vX.Y.Z` → CI проверяет, собирает и публикует образ `X.Y.Z`, затем задание `deploy` заходит
по SSH и вызывает `deploy.sh` с этим тегом, а потом ждёт `200` от `/healthz`. Секреты репозитория:

| Секрет | Что там |
|---|---|
| `DEPLOY_SSH_KEY` | Закрытый ключ деплоя (ed25519) |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan <vps>` |
| `DEPLOY_TARGET` | `user@<vps>` |
| `DEPLOY_HEALTH_URL` | `https://jam.<домен>/healthz` |

Открытый ключ деплоя лежит в `~/.ssh/authorized_keys` на VPS с принудительной командой, так что
он умеет только одно — задеплоить тег:

```
command="/home/<user>/qiyaa-jam/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA… qiyaa-jam-deploy
```

`deploy.sh` принимает только `vX.Y.Z` (цифры, точки и `v`), всё остальное — код 2 до любых действий.

## Обновление, откат, логи

```bash
git tag v0.2.0 && git push origin v0.2.0      # обновление: CI делает всё сам
ssh <vps> '~/qiyaa-jam/deploy.sh v0.1.0'      # откат на прошлый тег
docker logs -f qiyaa-jam                      # логи: JSON-строки, по 10 МБ, три файла
cat ~/qiyaa-jam/deployed.log                  # когда какой тег ставился
```

При `up -d` старый контейнер получает SIGTERM, пишет комнаты в `/data/rooms.json`, новый читает их
при запуске (REC-10): гости и хозяин переподключаются и ничего не теряют. Том `data` переживает
обновления.

## Кто создаёт комнаты

Любое приложение QiYaa, без ключей и регистрации. Злоупотребления сдерживают лимиты
(`spec/jam/limits.md`): не больше 20 комнат на сервер, 2 живых комнат и 5 новых в час с одного IP.
Отказы видны в логах как `rooms-limited` с IP и числом живых комнат.

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

Эхо и сервер джема занимают один порт и одну подсеть: перед сервером эхо нужно остановить.

Страница `https://jam.<домен>/` показывает состояние соединения, сколько оно живёт, какой IP видит
сервер и сколько было переподключений. Кнопка «Не гасить экран» держит экран телефона включённым
во время долгой проверки. Удаление: `docker compose down` в той же папке.
