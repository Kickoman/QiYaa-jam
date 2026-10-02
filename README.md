# QiYaa Jam

Общая очередь для компании. Один QiYaa (ПК или Android) — хозяин: он играет музыку через свой
аккаунт Яндекса. Гости сканируют QR-код и добавляют треки из браузера или из своего QiYaa. Здесь
живут сервер джема, который держит комнату и её правила, веб-страница гостя и лендинг QiYaa,
который сервер отдаёт на `/`. Хозяин и гость в
приложениях — в [Kickoman/QiYaa](https://github.com/Kickoman/QiYaa) и
[Kickoman/QiYaa-android](https://github.com/Kickoman/QiYaa-android).

| Папка | Что там |
|---|---|
| [server/](server/README.md) | Сервер джема: Node 22, TypeScript, `ws` |
| [web/](web/README.md) | Веб-гость (`/j/<roomId>`) и лендинг (`/`, `/ru`, `/en`) |
| [deploy/](deploy/README.md) | Образ Docker, nginx, как джем живёт на VPS |
| [tools/fake-host/](tools/fake-host/README.md) | Имитатор хозяина и сквозные тесты; `tools/rotor-spike/` — разведка ротора |
| [docs/](docs/design/README.md) | Проект и план (`design/`), отчёты разведок (`spikes/`), [код-стайл](docs/code-style.md) |
| `spec/` | Подмодуль [QiYaa-spec](https://github.com/Kickoman/QiYaa-spec): протокол, лимиты и сценарии в `spec/jam/` |

## Быстрый старт

```bash
git clone --recurse-submodules git@github.com:Kickoman/QiYaa-jam.git
cd QiYaa-jam
npm ci
npm run check                      # формат, линтер, генерация, типы, тесты, сборка
npm run dev                        # сервер на :8090 и имитатор хозяина: ссылка и QR в терминале
```

Нужен Node 22 (`.node-version`). Правила для изменений — [CLAUDE.md](CLAUDE.md).
