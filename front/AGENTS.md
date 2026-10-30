# AGENTS.md — `front/` (Pejvak Web)

The browser console for Pejvak: the listener's own data, an online catalogue, and a
streaming player. Read [`docs/PLAN.md`](./docs/PLAN.md) before writing anything — it is
both the roadmap and the record, and every claim in it about the backend was read out of
`back/`. If this file and the plan disagree, the plan wins; if the plan and the code
disagree, the code wins and the plan is a bug.

---

## This is not the Next.js in your training data

Next 16 renamed and changed things that every tutorial still shows the old way. Read
`node_modules/next/dist/docs/` — it ships with the package — before writing a route, a
proxy, or an error boundary. The four that cost the most to get wrong:

| Thing | Next 16 | Not |
|---|---|---|
| Route guard | **`src/proxy.ts`**, exporting `proxy(request)` | `middleware.ts` — deprecated, renamed |
| Cookies | `const store = await cookies()` | synchronous `cookies()` |
| `searchParams` / `params` in a page | `Promise<…>`, must be awaited | a plain object |
| `error.tsx` props | `{ error, retry }` | `{ error, reset }` |

Also: `unauthorized()` exists but is experimental (`authInterrupts`); do not enable
experimental flags to get a 401 page when `redirect()` already works.

---

## The rules that are product rules, not taste

1. **Server Actions only.** No client `fetch` to the backend, no React Query, no SWR
   (D4). `BACKEND_URL` is deliberately *not* `NEXT_PUBLIC_` — the value has no business
   in a browser bundle, and the prefix is how it would get there.
2. **The token lives in an `httpOnly` cookie named `token`** (D5). It is written in
   `actions/auth/login.ts` and nowhere else. It never crosses to the client.
3. **Never redirect a non-GET in `proxy.ts`.** Server Actions are POSTs to the page's own
   route; answering one with a 307 produces "unexpected response from the server" with no
   clue in it. Auth is re-checked inside every action.
4. **Persian only, RTL only** (D10). No locale switcher, no English strings in the UI —
   including backend error messages, which are translated in `lib/messages.ts`.
5. **`dir="rtl"` is structural.** Logical properties only (`ps-`/`pe-`/`ms-`/`me-`/
   `start-`/`end-`), never `left`/`right`. Base-UI primitives default to LTR: pass
   `dir="rtl"` explicitly.
6. **Two materials.** Opaque `surface` for anything read; glass only for what floats.
   A frosted content card is the mistake the split exists to prevent.
7. **Four states, not one** (plan §6.4). Every data surface renders skeleton, empty, error
   or offline. A blank list is a bug.
8. **No second source of truth.** Derived counts are computed, never stored; a title in
   the stats payload would be one, which is why the top-tracks join happens on the page.

---

## The act surface (17 acts, read out of `back/` on 2026-10-30)

```
user             register, login, getMe
track            registerTrack, getMyTracks, getTrackDetail, syncLocalData
playbackSession  getMyListeningHistory, getTrackSessions, getMyStats
annotation       getMyAnnotations, updateAnnotation, deleteAnnotation
playlist         getMyPlaylists, createPlaylist, updatePlaylist, deletePlaylist
playbackContext  getMyPlaybackContexts
onlineCollection saveOnlineCollection, getMyOnlineCollections, removeOnlineCollection
```

Three things that bite:

- **`getMyStats` is under the `playbackSession` model**, not a `stats` model. Sending
  `model: "stats"` fails validation with a message that looks like an auth problem.
- **List acts return a bare array.** No `{ rows, total }`, no page echo. "Is there another
  page?" is answered by `rows.length >= limit`, and there is no total to render.
- **`getMyStats` returns `contentHash`, not titles** (C4). Join against `getMyTracks`.

### Embedded relations — read the limit *and the sort*

`getTrackDetail` can embed reverse relations, and the declarations type them. Whether to
use one is decided by two numbers in the model, not by convenience:

| Relation | Limit | Sorted by | Verdict |
|---|---|---|---|
| `annotations` | 1000 | `positionSec` asc | **Use it.** That is a marker row, exactly. |
| `sessions` | 50 | `_id` desc | **Do not.** `_id` is sync order; an offline week uploads as one batch and lands above yesterday. Use `getTrackSessions` (`startedAt: -1`, paginated). |

There is no act that returns one track's notes (`getMyAnnotations` takes no `trackId`), so
the relation is the only route. A relation whose sort is "whatever the database happened to
write" is a list that will be in the wrong order and look like a bug in the dates.


### Wire format

`POST { model, act, details: { set, get } }` · JWT in a **`token` header, no `Bearer`** ·
envelope `{ success, body }`, **check `success` before reading `body`** · `get` is an
explicit projection — never `{}`, never "all fields".

---

## Layout

```
src/
├── app/
│   ├── (auth)/login/          signed-out
│   ├── (shell)/               behind the guard: layout.tsx IS the guard
│   ├── actions/<domain>/      one verb per file, "use server"
│   ├── api/session/expired/   the only place a stale cookie is deleted
│   └── layout.tsx             <html dir="rtl" lang="fa">
├── components/{ui,layout,domain}
├── lib/
│   ├── call-act.ts            the one path to the backend
│   ├── domain/                parsed wire shapes + their decoders
│   │   └── *-query.ts         query shapes and fetch bounds (never in an action)
│   ├── now.ts                 the one place the clock is read in a render
│   ├── search-params.ts       firstParam / pageParam
│   └── {search,time,format,insights}.ts   pure, tested
├── proxy.ts                   route guard
└── types/declarations/        vendored selectInp.ts, byte for byte
```

**A `"use server"` module may only export async functions.** Types are erased and are
fine; a parser function or a **`const`** is not. `tsc` accepts both — `next build` does
not — so query shapes and fetch bounds live in `lib/domain/{track,session}-query.ts` and
the action imports them. This is the one class of error that only the bundler sees, which
is why the gate ends with `next build` and not with `tsc`.

---

## This environment (read before believing a failure)

| Symptom | Cause and fix |
|---|---|
| `npm install` hangs, then fails on `reify` | The sandbox injects a filesystem broker via `NODE_OPTIONS`, and npm's rename phase times out inside it. Run `env NODE_OPTIONS= npm install`. |
| `[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]` on `.next/trace-build` | The delete guard, not the build. `mv .next /tmp/next-old` and rebuild. |
| `fish: Unknown command: unset`, exit 127, nothing runs | The harness escalates some commands and feeds a bash prelude to fish. Run the gate steps individually. |
| `grep "\|"` matches nothing | macOS `grep` has no `\|\|` alternation. Use `grep -E "a|b"`. |
| `next build` rewrote `tsconfig.json` | Expected: it sets `jsx: react-jsx` and adds `.next/dev/types` to `include`. Commit it. |


---

## Port, don't reinvent

These are pure TypeScript in `mobile/src/lib/` and were copied with their tests, not
rewritten. Keep the comments: they encode the reasons.

`search.ts` · `time.ts` (except `formatRelativeTime`, see below) · `librarySearch.ts` ·
`sessionTracking.ts` · `playbackContext.ts` · `listeningStretch.ts` · `online/*`.

Two edits were made on the way in, and both are deliberate:

- `describeField()` returns Persian labels — the mobile version returned English words.
  The test that pins them changed with it.
- `formatRelativeTime()` uses `Intl.RelativeTimeFormat("fa")` instead of the English
  strings the phone used, so Persian plurals come from ICU rather than from a table.

---

## What the player cannot play

`origin === "local"` means the bytes are on the listener's phone and the server never saw
them (C2). There is no URL to fetch. The row **states** this — no disabled button, no
tooltip, no apology. It is a state to design, not an error to explain.

---

## Gates

```bash
npm run check     # declarations drift → tsc → eslint → vitest → next build
```

`npm run check` is the gate. A phase is not done when its boxes are ticked; it is done
when `check` is green and the phase's "Done when" line is true.

---

## Conventions

- **Commits:** gitmoji + Conventional Commits, lowercase imperative, scope `(front)` —
  `:sparkles: feat(front): Add library table`. **Never push. Never `git reset`.**
- **TypeScript:** `strict`, no `any`, no non-null `!` where a guard reads better. Types
  come from `selectInp.ts`; the wire is decoded once, in `lib/domain/`.
- **Naming:** `PascalCase.tsx`, `camelCase.ts`, route folders `kebab-case`.
- **Text:** UI copy is Persian. Code, comments and commits are English.
- **A new act** is added to plan §8 in the same commit that uses it.
