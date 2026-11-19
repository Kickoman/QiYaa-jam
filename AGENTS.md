# QiYaa Jam: rules for changing this repository

The code style is [docs/code-style.md](docs/code-style.md). The design and the plan are in
[docs/design/](docs/design/README.md); once behaviour is in `spec/jam/`, the spec wins over them.
Each module's README is its file-level reference.

## Behaviour lives in `spec/`

`spec/` is a submodule, [Kickoman/QiYaa-spec](https://github.com/Kickoman/QiYaa-spec), shared with
the desktop and Android apps. `spec/jam/` holds the protocol (JSON Schema and examples), the
limits, and the room, ordering, recovery, seed and host scenarios.

- **Change the spec before the code.** Commit the change to QiYaa-spec first (its own `npm run
  check` must pass), then bump `spec/` here in the same change as the code and tests. When the
  change affects the hosts or guests in the apps, open an issue in Kickoman/QiYaa or
  Kickoman/QiYaa-android.
- **Tests name the scenario.** `ROOM-37 …`, `REC-03 …`, `SEED-04 …`, ordering cases by file name.
- **Never edit `spec/` only here.** A change inside the submodule that is not pushed to QiYaa-spec
  breaks every other checkout.
- **Numbers come from `spec/jam/limits.md`**, never from memory or from the design documents.

## For agents

- Never commit or push. Leave the work in the working tree and describe it. If it should be several
  commits, propose the split.
- Match the newest well-reviewed module, not whatever file you happen to have open.
- Before you call a change done, run the full check and report failures as they are:

  ```bash
  git submodule update --init
  npm ci
  npm run check      # generate, format, lint, types, tests, build
  ```

  A change to the web guest also runs the browser tests (Chromium from `npx playwright install
  chromium` once): `npm run e2e -w web`.

  When `deploy/Dockerfile` or the dependencies change, also build and start the image:
  `docker build -f deploy/Dockerfile -t qiyaa-jam:dev .` and check `GET /healthz`.
- CI (`.github/workflows/ci.yml`) runs the same check and the browser tests on every push, builds the image, starts it,
  and publishes it to `ghcr.io/kickoman/qiyaa-jam`: `edge` from `master`, `X.Y.Z` from a tag
  `vX.Y.Z`.
- Never put a real domain, a host key, a token or a secret into the repository. Examples use
  `jam.example.org` and made-up values.
- Say explicitly what was not verified: a phone, the VPS, a real Yandex account.
