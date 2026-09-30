# Code style

These are the rules of the QiYaa apps (`QiYaa/docs/code-style.md`, `QiYaa-android/CLAUDE.md`),
adapted to TypeScript on Node. Sections 1–4 hold in any language, section 5 is specific to this
repository. Where existing code disagrees with these rules, match the newest, most-reviewed module
rather than the oldest.

Prose documentation (`README.md` files, `docs/`) is written in Russian. The developer rules (this
file, `CLAUDE.md`), identifiers, comments and commit messages are in English. The spec is in
English too.

## 1. Comments: as few as possible, ideally none

Explanations belong in the module's README, not in the source.

Allowed in code:
- a short technical note that the code cannot tell you: a units convention, a platform quirk,
  where a number comes from (`// limits.md: add by a guest`);
- a genuinely exceptional decision, where the obvious reading of the code is wrong and the reason
  is not written anywhere else. One or two lines;
- a one-line reason inside an intentionally empty `catch`.

Not allowed: JSDoc on every function, restating the next line, a comment after each field of a
type, design rationale or history, commented-out code, `TODO` without an owner, banner separators.

When you feel the need to explain code, update the README instead. If a name needs a comment,
rename it first.

## 2. Documentation lives next to the code, one README per module

Every folder that is a module of its own has a `README.md`: `server/`, and each folder under
`server/src/`. The top-level `README.md` says what the project is, gives the layout, a quick start
and the check command. `docs/` holds the design, the plan and the spike reports.

A module README follows this shape:

1. `# \`server/src/module/\` — what it is`, then one paragraph: what the folder does, what it does
   *not* do, and which folder does that.
2. A file table: `| File | Contains |`.
3. The dependency direction, with any module-wide invariant as one command that must print
   nothing:

   ```bash
   grep -rlnE 'from "(ws|node:net|node:http)"' server/src/room/   # must print nothing
   ```

4. One section per file: the exported signatures in a code block, what the unit guarantees, and a
   **Traps:** list of what will bite the next person.
5. Wire and storage formats spelled out, with what the parser refuses.
6. A **Not here** section when readers are likely to look in the wrong place.

State each fact in one place and link to it. Be concrete: real numbers, names and limits. A
measurement says how it was taken. Update the README in the same change as the code.

## 3. Structure

- **Folder = module = README.** `server/src/protocol` (generated types, validation), `room`
  (the room as pure functions), `net` (HTTP, WebSocket, rate limits), plus `main.ts`. Dependencies
  point one way: `main → net → room → protocol`. Nothing imports upwards.
- **Pure functions apart from I/O.** The room is a reducer `(room, event, now) → {room, effects}`
  without sockets, timers or the clock: time is a parameter, and effects are data that `net`
  carries out. Every room rule then runs in a test without a port or a timer.
- **`main.ts` only reads the environment and wires.** Behaviour lives in the modules.
- **Split by stage, not by kind:** `protocol/`, `room/`, `net/`, never `utils/` or `helpers/`.
- **Few dependencies.** `ws` and `ajv` at run time, no web framework. A new dependency needs a
  reason in the README of the module that uses it.

## 4. Behaviour

**Errors.**
- A bug, a broken configuration or a contract mismatch throws an `Error` whose message carries the
  values: `PORT must be a port number, got "abc"`.
- Expected misses are **data**: a discriminated union (`{kind: "invalid", type, id}`), a `null`,
  or a `rejected` reason. Anything a client can cause is data, never an exception.
- Catch once at the top: the handler of a connection or of a timer catches, logs and closes. Deeper
  code does not catch. A caught error you inspect is named `failed`, one you drop `ignored`, with
  the reason in one line.
- Never classify an error by its message.

**Validation.**
- Everything from the network is `unknown` until the protocol schema accepts it. After that the
  code works with the generated types and does not check the shape again.
- Treat every size and count from a client as untrusted, and bound it before storing anything:
  the frame limit, the schema's `maxItems`, the room limits.

**Determinism.**
- An order that anyone can see is sorted with a total order and an explicit tie-break (the queue
  order in `spec/jam/ordering`). `Map` keeps insertion order; do not let that become visible
  behaviour by accident.
- Time comes in as a parameter (`now`), so tests control it.

**Numbers.** Every size, timeout and rate comes from `spec/jam/limits.md`. In code they live in
one place (`room/limits.ts` once it exists), named after the row, and nowhere else.

**Privacy.** Logs are JSON lines through `log.ts`: connections, refusals with their reason,
counters. Never names, track titles, search texts, secrets or `participantId`s (ROOM-63).

**Names.** Whole words: `participant`, not `p`; `request`, not `req`; `failed`, not `e`.
Established abbreviations: `id`, `url`, `ip`, `http`, `ws`, `json`, `ms`. Loop indices and short
lambda parameters are fine when the body is a line or two.

## 5. TypeScript and Node

**Language and build**
- Node 22 (`.node-version`), ES modules only, TypeScript 6.0 with the flags of
  `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, unused
  locals and parameters as errors. TypeScript 7 waits until typescript-eslint supports it.
- Relative imports end in `.js` (NodeNext resolution). Type-only imports use `import type`.
- Prettier (`.prettierrc.json`, width 100) is the authority on layout, and CI fails on any
  difference: `npm run format`.
- ESLint is `strictTypeChecked` from typescript-eslint, plus `curly`, `eqeqeq` and `no-console`.
  Fix a finding rather than silence it. A disable comment needs its reason on the same line.
- The generated protocol files (`server/src/protocol/generated/`) are built from the spec by
  `npm run generate` and never committed or edited.

**Naming**

| What | Style | Example |
|---|---|---|
| Functions, variables, parameters | `camelCase` | `parseClientMessage`, `serverTime` |
| Types, type aliases | `PascalCase` | `ParsedClientMessage`, `StateMessage` |
| Limits from `limits.md` | `UPPER_SNAKE_CASE` in `room/limits.ts` | `GUEST_ADDS_PER_MINUTE` |
| Files | `kebab-case.ts` | `rate-limit.ts`, `real-ip.ts` |
| Tests | `test/<file>.test.ts`, sentences as names | `"ROOM-37 started moves the item out of the queue"` |

**Types and APIs**
- Data is a `type` with `readonly` fields and readonly arrays. Classes only for objects with a
  lifecycle (a connection, the room registry), never for data.
- A kind is a string-literal union or a discriminated union with `kind`, never a number or a
  boolean pair. `switch` over a union is exhaustive (the lint rule checks it).
- No `any`, no non-null `!` on data from outside, no `as` except right after validation.
- Return results by value. No out-parameters, no mutation of arguments.

## 6. Tests

- Vitest, in `<workspace>/test/`. Unit tests for pure code; integration tests on real sockets on
  port 0 for `net`. Time-dependent rules use an injected clock or fake timers, never real sleeps.
- A test that checks a spec scenario names its ID first (`ROOM-37 …`, `HOST-05 …`). Ordering cases
  are named by their file (`ordering/latecomer-joins-next-round`). Protocol examples are read
  from `spec/jam/protocol/examples` and named by their path.
- Test helpers are functions at the bottom of the test file; shared ones go in `test/support/`.
- **Tests come before refactoring.** Pin current behaviour first, as a separate step.
- Never change an existing expectation to make a change pass. Adding cases is fine. If an
  expectation really has to change, say so and why, and change the spec first.
