# `deploy/` — как джем живёт на VPS

Сервер джема — один контейнер за имеющимся nginx. nginx держит TLS и проксирует `/` и `/ws` на
`127.0.0.1:8090`. Наружу контейнер порт не публикует. Проверено разведкой
[docs/spikes/vps-websocket.md](../docs/spikes/vps-websocket.md). Сервера джема ещё нет, поэтому
пока здесь только эхо-сервер разведки. Компоуз, ключи хозяина, обновление и откат добавит
Kickoman/QiYaa-jam#12.

| Файл | Что это |
|---|---|
| `nginx.conf.example` | `server`-блок nginx: `Upgrade`/`Connection` для `/ws`, `X-Real-IP`, долгий `proxy_read_timeout` |
| `echo/` | Эхо-сервер разведки: тестовая страница, `/healthz`, WebSocket `/ws` с ping раз в 25 с и JSON-логом IP |

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
