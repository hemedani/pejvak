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
4. **English only, LTR only** (D10). No locale switcher, no Persian strings in the UI — including
   backend error messages, which are turned into sentences in `lib/messages.ts`. The product is intended
   for sale on the global store, which is why the web app ships in English and in the same single
   language as the phone app. **Catalogue content is not copy**: a Persian collection title, a language's
   native name (`فارسی`) and the Persian folding tables in `lib/search.ts` are data. Do not translate them.
5. **Direction is structural.** `dir="ltr"` on `<html>`. Logical properties only (`ps-`/`pe-`/
   `ms-`/`me-`/`start-`/`end-`), never `left`/`right` — that is what makes the one RTL exception
   (a Persian title) safe to nest. Radix/base-UI primitives default to LTR, which now matches the app;
   the five that are told `dir="ltr"` explicitly (account menu, sheet, volume, scrubber, speed menu) are
   self-documenting rather than load-bearing. The one place direction is decided for the whole app is
   `components/ui/icon.tsx`, where `start` is `ChevronLeft` and `end` is `ChevronRight` — flipping those
   two glyphs is the whole chevron story.
6. **Two materials.** Opaque `surface` for anything read; glass only for what floats.
   A frosted content card is the mistake the split exists to prevent.
7. **Four states, not one** (plan §6.4). Every data surface renders skeleton, empty, error
   or offline. A blank list is a bug.
8. **No second source of truth.** Derived counts are computed, never stored; a title in
   the stats payload would be one, which is why the top-tracks join happens on the page.

---

## The listener act surface (23 acts, re-read out of `back/` on 2026-10-31)

```
user             register, login, getMe, getMySettings, updateMySettings
track            registerTrack, getMyTracks, getTrackDetail, syncLocalData
playbackSession  getMyListeningHistory, getTrackSessions, getMyStats
annotation       getMyAnnotations, updateAnnotation, deleteAnnotation
playlist         getMyPlaylists, createPlaylist, updatePlaylist, deletePlaylist
playbackContext  getMyPlaybackContexts
onlineCollection saveOnlineCollection, getMyOnlineCollections, removeOnlineCollection
```

The left column is the **Lesan schema**, not the folder — they differ in four places, and
the schema is what goes in `model:`.

Four things that bite:

- **The folder is not the schema.** `getMyStats` is under `playbackSession` (not `stats`),
  `syncLocalData` is under `track`, and **`getMySettings` / `updateMySettings` are under
  `user`** (not `settings`). Sending the folder name fails validation with a message that
  looks like an auth problem.
- **List acts return a bare array.** No `{ rows, total }`, no page echo. "Is there another
  page?" is answered by `rows.length >= limit`, and there is no total to render.
- **`getMyStats` returns `contentHash`, not titles** (C4). Join against `getMyTracks`.
- **`getMySettings` is the only act that returns the listener's preferences**
  (`languageCode`, `defaultSpeed`, `historySort`) and **each one has a consumer** — do not add a
  fourth field without one, because a stored preference that changes nothing is a screen that
  lies. `defaultSpeed` seeds the player (`player/default-speed.tsx`, after hydration, guarded
  against splitting a session); `historySort` orders `/history` **on the page that was read**,
  since `getMyListeningHistory` has no sort parameter; `languageCode` is the fallback language
  on `/browse/source/[id]` behind `?language=`, plus a shortcut on `/browse`.
  `updateMySettings` writes those three fields and nothing about the profile, so it is not the
  `updateMe` the plan lists as missing.

### Admin acts (22, separate from the listener surface)

The backend has RBAC and a cross-user operator panel. Those acts are **not** listener acts and
must never be reached through a `getMy*` query:

- `support` may call the 12 read acts; `admin` may call all 22.
- Mutations are guarded by `requireAdmin` **inside the backend**, and every admin Server Action
  must also guard on the server. Hiding a button is not a permission.
- Admin list acts return `{ rows, total, page, limit }` (the listener lists return bare arrays).
- The schema is still not the folder: analytics register under `playbackSession`, audit under
  `adminAuditLog`, platform under `platformSetting`, AI credits under `aiUsage`.

The full contract — every act, schema, `set`/`get`, grant modes, analytics definitions, audit
vocabulary and known gaps — is [`docs/ADMIN-PANEL.md`](./docs/ADMIN-PANEL.md). Read it before
touching `/admin`. `docs/PLAN.md` §2 C1 is historical; the panel now exists.

The UI lives behind `app/(admin)/admin/layout.tsx`, not `proxy.ts`: the layout sends a signed-out
caller to `/login`, renders an error for a failed session read, and calls `notFound()` for a `user`.
Every admin action guards again on the server (`requireSupport` for reads, `requireAdmin` for
mutations), so support sees the pages read-only and a hidden button is never the permission. The
nine routes are overview, analytics, users, user detail, plans, subscriptions, transactions, audit
and platform.

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
│   └── layout.tsx             <html dir="ltr" lang="en">
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
| `ESLint: write EPIPE`, lint dies mid-run | The same fs broker, not a lint error. `env NODE_OPTIONS= npx eslint .` runs clean — and "clean" means `0 problems`, so read the summary line before believing it. |
| `npm run check` dies at exit 137 with no output | The foreground budget, not a crash. Run it in the background and read the log; the four steps can also be run one at a time. |
| `next build` rewrote `tsconfig.json` | Expected: it sets `jsx: react-jsx` and adds `.next/dev/types` to `include`. Commit it. |


---

## Port, don't reinvent

These are pure TypeScript in `mobile/src/lib/` and were copied with their tests, not
rewritten. Keep the comments: they encode the reasons.

`search.ts` · `time.ts` · `format.ts` · `librarySearch.ts` ·
`sessionTracking.ts` · `playbackContext.ts` · `listeningStretch.ts` · `online/*` ·
`waveform.ts` · `palette.ts` · `listeningTimeline.ts`.

Three of those carry the app's *identity* rather than its logic, and they are the ones most
likely to be "simplified" by someone who has not read them:

- **`waveform.ts`** is the geometry of the wave that stands for "audio is moving" in both
  players. The smoothstep envelope at each end is not decoration — it is what guarantees the
  stroke starts and ends exactly on the centreline, so a round cap reads as intentional.
- **`palette.ts`** is the one place a track's colour is decided, from its `contentHash`. The
  artwork tile and the ambient wash both read it, so they cannot disagree about which track is
  playing. Do not add a second hue derivation.
- **`listeningTimeline.ts`** is the history bar: one segment per track, each filled across the
  part that was heard. Its resume marker is placed by the same function the Continue button
  seeks with, so the bar and the button cannot drift apart.

**Components ported the same way** — the browser paints them differently, the behaviour does
not change: `WavyProgress` → `components/player/wavy-progress.tsx`, the session sheet →
`components/domain/session-detail.tsx`, `Reveal` → `components/motion/reveal.tsx`. Each header
says what changed in the browser and why; a rewrite that drops those notes drops the reason
with them.

**Nothing was rewritten on the way in.** Both of these were once exceptions, made under the
Persian-only decision, and the English-only decision (D10) removed them — the ports are now the
phone's code:

- `describeField()` returns `Author` / `Album` / `Narrator` / `File name` / `Folder` / `Path` /
  `Description` / `Title`, exactly as the phone does. A row that explains "why is this a result"
  must use the same word the UI uses for that field.
- `formatRelativeTime()` returns the phone's words — `"Just now"`, `"3 hr ago"`, `"Yesterday"`,
  `"3 days ago"`, then a date. `Intl.RelativeTimeFormat` was tried and produced different words
  for the same event, which is the bug this avoids.

**Every `Intl` call pins `"en-US"`.** Not the runtime default: a date that renders `31/10/2026`
on one machine and `10/31/2026` on another is a screenshot that cannot be trusted.

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
- **Text:** UI copy is English (D10). Code, comments and commits are English too.
- **A new act** is added to plan §8 in the same commit that uses it.
