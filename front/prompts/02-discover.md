# 02 — Discover: browsing and playing online collections

> Task brief for an implementation agent working in `/Users/syd/work/Pejvak/front`.
>
> Read `front/AGENTS.md` and `front/docs/PLAN.md` first. This document is a
> product and implementation contract for **Phase 4 — Discover**, including the
> **Phase 4.1 online layer** it depends on. Where this file and the plan disagree,
> the plan wins; where the plan is silent, this file is the decision. `mobile/`
> and `back/` are read-only references for this task.

## Mission

Turn the `/browse` placeholder into the web console's shelf of free audio: a
listener opens **کاوش**, chooses a language, sees the sources that serve it,
opens a collection, and starts streaming it through the player built in Phase 5.
The page also shows two personal shelves — **ادامه** (runs left part-way) and
**نشان‌شده‌ها** (favourited collections).

Discover is a **port of the mobile online layer with a server boundary**. The
rules that keep identity, ordering, duration and collection keys honest do not
change. What changes is where the bytes come from: the browser cannot call
`manahej.ir` or `aminikhaah.ir` directly (their APIs do not send CORS headers),
cannot download for offline use, and cannot read a source's HTML from the client
without exposing the user's IP to a third party. So **the catalogue is read by
Server Actions, and the `<audio>` element streams the resolved URL directly from
the source's CDN.**

## What this task must not do

- **Do not touch `mobile/` or `back/`.** This is a `front/` task. The backend
  already has `onlineCollection`, `getMyOnlineCollections`,
  `saveOnlineCollection`, `removeOnlineCollection`, `getMyPlaybackContexts` and
  the `syncLocalData` batch; use them.
- **Do not add a second HTTP path.** Every backend call goes through a Server
  Action using `callAct`; never `fetch(BACKEND_URL)` from a component, never
  React Query or SWR.
- **Do not fetch a _source_ from a client component.** Source adapters and their
  `fetch` calls are server-only. A client component may receive catalogue rows
  as plain props and may call a Server Action; it may not import an adapter.
- **Do not put `BACKEND_URL` or the JWT in the browser.** The token remains in
  the `httpOnly` `token` cookie.
- **Do not hand-edit `src/types/declarations/selectInp.ts`.** It is vendored and
  checked byte-for-byte by `npm run check:declarations`.
- **Do not store audio bytes, stream URLs, or download state on the server.**
  The server stores addresses and user state. `streamUrl` is resolved on demand
  and is never written to the database, a cookie, or `localStorage`.
- **Do not add a download button.** The web has no filesystem (plan §2 C2,
  Settings says so). A download control on a web page promises something the
  product cannot keep.
- **Do not auto-play on page load.** Browsers block it and the plan forbids it.
  The first sound is always a click.
- **Do not invent a second identity for a track.** `contentHash` is
  `SHA-256("online:<sourceId>:<externalId>")`; a collection key is
  `"<sourceId>:<externalId>"`. Never hash a URL, a title, or a file name.
- **Do not add a second icon family, palette, radius literal, or a new type
  ramp.** Use `src/components/ui/icon.tsx`, `src/styles/tokens.css`, and the
  existing `type-*` classes. Persian only, RTL only; code and comments stay
  English.

---

## 1. Ground truth

| Thing | What exists today |
|---|---|
| Route | `src/app/(shell)/browse/page.tsx` is a `PlannedSurface` placeholder. Nav item is «کاوش», icon `browse` (`Globe`). |
| Player | Phase 5 is shipped. `playQueueAt`, `enqueue`, `next`, `previous`, `seek`, `getEngine` live in `src/lib/player/controller.ts`; the queue is in `src/stores/player.ts`. |
| Online seam | `src/lib/player/stream.ts` already defines `registerStreamResolver`, `registerLiveSource`, `resolveStreamUrl` and `StreamError`. `src/lib/player/online-hash.ts` already defines `onlineIdentity` and `onlineContentHash`. |
| Run model | `src/lib/player/playbackContext.ts` has `latestPartialRun`, `isPartialRun`, `runResumeTargetSec`, `runFiguresFromSessions`. The player writes ended runs into `syncLocalData.contextPlays`. |
| Registration | `src/app/actions/player/register-track.ts` already registers an online track before its first session. `playerTrackFromTrack` / `pendingTrackFor` in `src/lib/player/from-track.ts` carry source ids, collection key and artwork. |
| Backend acts | `onlineCollection`: `getMyOnlineCollections`, `saveOnlineCollection`, `removeOnlineCollection`. Runs: `getMyPlaybackContexts`. Tracks: `getTrackDetail`, `getMyTracks`, `registerTrack`. |
| Backend model | `onlineCollection` fields: `clientId` (`sourceId:externalId`, not unique), `sourceId`, `externalId`, `title`, `subtitle`, `artworkUrl`, `languageCode`, `trackCount` (informational, maybe `0`), `pageUrl`, `isFavorite`, `lastOpenedAt`, `deletedAt`, `createdAt`, `updatedAt`. |
| Sync | `syncLocalData` accepts `onlineCollections[]` as a fifth payload, and `syncPlayerData` currently sends only sessions/annotations/contextPlays. **This task does not need to extend sync** — the web saves collections through `saveOnlineCollection` directly. |
| Mobile | `mobile/src/lib/online/*` (adapters, types, registry, series, languages, transport) and `mobile/src/app/(tabs)/discover.tsx`, `mobile/src/app/online/*`, `mobile/src/components/online/*` are the source to port. |

**A deliberate web-only deviation:** there is no `download_jobs`,
`online_collections` SQLite table, or `DownloadService` here. Do not port them.
The browser's "saved" state is the server row; the browser's "offline" state does
not exist.

---

## 2. The phase split

Do this in two commits/layers, even if they land together:

**4.1 — the online layer**, with no UI:

- `src/lib/online/types.ts` — the vocabulary.
- `src/lib/online/{text,series,languages,archive-languages,catalogue}.ts` —
  pure, client-safe.
- `src/lib/online/adapters/*.ts` — server-only, one per source kind.
- `src/lib/online/{cache,errors}.ts`, `src/lib/online/server.ts` — server
  plumbing.
- `src/app/actions/online/*.ts` — the Server Actions.
- `src/lib/online/__tests__/*.test.ts` — fixtures for the parsers.

**4 — Discover**, the UI:

- `src/app/(shell)/browse/page.tsx`, `browse/language/[code]`, `browse/source/[id]`,
  `browse/collection/[sourceId]/[externalId]`.
- `src/components/online/*`.
- `src/components/player/online-stream-bridge.tsx`.
- `src/lib/online/continue.ts` (pure derivation).

The player works without Discover; Discover must not work by reaching around it.

**Deviation from plan §4.2, stated deliberately.** The plan says "a Next route
handler proxy where [the source] does not [allow CORS]". This brief uses
**Server Actions** instead. The constraint that matters is that the browser never
calls a source: both approaches satisfy it, both run server-side and
authenticated, and both are allow-listed. Server Actions reuse `callAct`'s auth
and error vocabulary, need no public endpoint, and cannot accidentally become an
open proxy. There is no route handler in this task; if one is added later it is
because a caller outside the app needed it.

---

## 3. File map

```
src/lib/online/
  types.ts                 # OnlineLanguage, OnlineSource, OnlineCollection, OnlineTrack, OnlineAdapter, errors
  text.ts                  # cleanText, encodeNonAscii, asString
  series.ts                # seriesNameOf, buildSeriesSections (port as-is)
  languages.ts             # LANGUAGES, AVAILABLE_LANGUAGES, findLanguage
  archive-languages.ts     # ARCHIVE_LANGUAGES, ARCHIVE_LANGUAGE_CODES, facets
  catalogue.ts             # source metadata helpers: sourcesForLanguage, findSource, sourceLanguages
  adapters/
    manahej.ts
    aminikhaah.ts
    aminikhaah-podcasts.ts
    archive.ts
    librivox.ts
    radiobrowser.ts
  registry.ts              # SOURCES, getAdapter (server-only)
  cache.ts                 # bounded 5-minute catalogue/collection cache (server-only)
  errors.ts                # OnlineSourceError → ActFailure
  server.ts                # adapter calls, validation, timeouts
  player-track.ts          # OnlineTrack + collection → PlayerTrack
  continue.ts              # runs + saved collections → ContinueItem[]
  __tests__/

src/app/actions/online/
  get-online-sources.ts        # optional; pages may read registry directly
  get-browse-collections.ts
  get-online-collection.ts
  resolve-online-stream.ts
  save-online-collection.ts
  remove-online-collection.ts
  get-my-online-collections.ts
  get-my-contexts.ts

src/app/(shell)/browse/
  page.tsx
  language/[code]/page.tsx
  source/[id]/page.tsx
  collection/[sourceId]/[externalId]/page.tsx

src/components/online/
  artwork.tsx
  collection-card.tsx
  collection-grid.tsx
  source-card.tsx
  source-list.tsx
  language-list.tsx
  language-search.tsx
  track-row.tsx
  track-list.tsx
  play-collection-button.tsx
  favorite-button.tsx
  remove-button.tsx
  continue-shelf.tsx
  favorite-shelf.tsx
  browse-tabs.tsx
  source-problem.tsx

src/components/player/
  online-stream-bridge.tsx
```

Do not create a third component directory. `src/components/online` follows the
existing `src/components/domain` convention.

---

## 4. The online vocabulary

Port `mobile/src/lib/online/types.ts` **with its comments**. The important
shapes:

```ts
export type OnlineLanguage = {
  code: string;
  name: string;        // English, for the one predictable catalogue order
  nativeName: string;  // what the listener reads
  direction: "ltr" | "rtl";
  available: boolean;  // derived from the registry, never hand-set
};

export type OnlineSourceKind =
  | "manahej" | "aminikhaah" | "aminikhaahpodcasts"
  | "archive" | "librivox" | "radiobrowser";

export type OnlineSource = {
  id: string;
  kind: OnlineSourceKind;
  name: string;
  nativeName: string;
  languageCode: string;
  languageCodes?: readonly string[];
  live?: boolean;
  homepage: string;
  description: string;
  attribution?: string;
};

export type OnlineCollection = {
  key: string;          // `${sourceId}:${externalId}`
  sourceId: string;
  externalId: string;
  title: string;
  subtitle: string | null;
  artworkUrl: string | null;
  trackCount: number;   // 0 means "not known before opening"
  languageCode: string;
  pageUrl: string | null;
};

export type OnlineTrack = {
  externalId: string;
  title: string;
  artist: string | null;
  albumTitle: string | null;
  artworkUrl: string | null;
  streamUrl: string;    // short-lived; never stored
  durationSec: number;  // 0 means "ask the audio element"
  order: number;        // 1-based
  pageUrl: string | null;
};
```

`OnlineAdapter` stays three reads plus three optional verbs:
`listCollections`, `getTracks`, optional `getCollection`, optional
`searchCollections`, optional `notePlaybackStarted`.

**Do not copy `DownloadState`, `describeDownloadState`, `naming.ts`, or
`parseDownloadedFolderKey`.** They describe a device filesystem the web does not
have. `describeKnownTrackCount` and `describeCollectionLine` **do** belong: an
unknown size must render as nothing, never as «۰ قطعه».

### 4.1 Identity

Use the existing `src/lib/player/online-hash.ts`. Do not add a second copy.

- `onlineIdentity(sourceId, externalId)` → `online:<sourceId>:<externalId>`.
- `onlineContentHash(...)` → SHA-256 hex, memoised, Web Crypto.
- Collection key → `${sourceId}:${externalId}`; parse it with a pure
  `parseCollectionKey` that returns `null`, never throws, for a bad URL.

An online track's `contentHash` is computed **on the client** when a queue is
built. A `getOnlineCollection` Server Action may not return hashes: it runs on
the server and Web Crypto is not guaranteed there; more importantly, identity
belongs with the player's queue snapshot.

### 4.2 Text and titles

Port `mobile/src/lib/online/text.ts` (`cleanText`, `export function asString`).
`cleanText` decodes HTML entities, collapses whitespace, and returns `null` for
an empty result — the callers use `null` to drop a row.

Port `series.ts` unchanged. It is already pure and tested; its imports become
`@/lib/search` (`foldText`) and `@/lib/online/text`. The comment about **a
series is not a collection** is the rule that keeps a title-derived section from
becoming a download/identity unit. Do not give a series its own route or key.

---

## 5. Adapters: server-only, allowlisted, bounded

### 5.1 The boundary

Every adapter file starts with:

```ts
import "server-only";
```

It may import `online/types`, `online/text`, `online/transport`, and nothing from
`src/components` or `src/stores`. It must never be imported by a
`"use client"` file.

`transport.ts` is server-only too:

- `DEFAULT_TIMEOUT_MS = 20_000`.
- Merge a caller `AbortSignal` with `AbortSignal.timeout(...)` so either cancels.
- `requestJson<T>` and `requestText` throw a typed `OnlineSourceError` with
  `offline`, `not_found`, `invalid_response`, or `timeout`.
- Do **not** follow redirects blindly. Use `redirect: "manual"` for the archive's
  download redirect where the adapter only needs the URL; for JSON endpoints set
  `redirect: "error"`. Never accept an arbitrary URL from a request body; the
  adapters construct every URL from constants and validated ids.
- Cap a response body. `Content-Length` is a hint; read at most ~8 MB and stop.
- Set a browser-like `User-Agent` only if the source rejects the default; do not
  spoof a real person's browser.

The fixed host allowlist is exactly the sources registered in
`registry.ts`:

`manahej.ir`, `aminikhaah.ir`, `dl.aminikhaah.ir`, `archive.org`,
`librivox.org`, `api.librivox.org`, `de1.api.radio-browser.info`, and the
archive's `ia*.us.archive.org` redirect targets.

### 5.2 The port list

Port from `mobile/src/lib/online/`:

| Mobile | Front | Change |
|---|---|---|
| `manahej.ts` | `adapters/manahej.ts` | unchanged; source metadata, category list, playlist JSON, signed URLs |
| `aminikhaah.ts` | `adapters/aminikhaah.ts` | add `node-html-parser` for the search page, or omit `searchCollections` and say so |
| `aminikhaahPodcasts.ts` | `adapters/aminikhaah-podcasts.ts` | unchanged |
| `archive.ts` | `adapters/archive.ts` + `archive-languages.ts` | split: the language table is pure/client-safe; the adapter is server-only |
| `librivox.ts` | `adapters/librivox.ts` | unchanged |
| `radiobrowser.ts` | `adapters/radiobrowser.ts` | unchanged; `live: true` |
| `transport.ts` | `transport.ts` | `server-only`, no React Native `fetch` assumptions |
| `series.ts` | `series.ts` | imports only `foldText`, `cleanText` |
| `languages.ts` | `languages.ts` | import `ARCHIVE_LANGUAGE_CODES` from `archive-languages.ts` |
| `index.ts` | `registry.ts` | drop DB/download exports; keep `SOURCES`, `getAdapter`, `findSource` |

Keep every comment that explains a source's shape — the manahej signed URLs, the
aminikhaah "catalogue does not state a size", the archive's `MM:SS` duration and
disjoint language facets, the radiobrowser live stream. Those comments are the
reason the port is safe.

### 5.3 Adding `node-html-parser`

`aminikhaah.ts` reads its search results page as HTML because the site exposes no
search endpoint. The mobile app uses `node-html-parser@^9.0.5`. The front has no
parser. Choose one:

1. **Recommended:** add `node-html-parser` to `front/package.json` (a
   server-only dependency) and port the search function with its tests. Run
   `npm install` and commit the lockfile change. A hand-written regex parser is
   not an acceptable substitute — HTML is not regular and a selector-based
   parser is the whole point.
2. **Acceptable scope cut:** omit `searchCollections` for this source in Phase 4
   and do not install the dependency. The source page still supports the
   crate-level search over the loaded catalogue (see §9.4); mark the gap in the
   code with a `// TODO(phase-4.2)` comment that names the escape hatch. Do not
   pretend the source has a search it does not.

Do not add a parser to the client bundle. The adapter is `server-only`.

### 5.4 The archive is one source per language

`archiveSources()` fans `ARCHIVE_LANGUAGES` into source ids `archive-fa`,
`archive-de`, and so on. The registry builds them at module load:

```ts
export const SOURCES = [
  manahejAdapter.source,
  aminikhaahAdapter.source,
  aminikhaahPodcastsAdapter.source,
  librivoxAdapter.source,
  radioBrowserAdapter.source,
  ...archiveSources(),
];
```

`sourceLanguages` returns `languageCodes` when present, otherwise
`[languageCode]`. `sourcesForLanguage` filters on that — never on
`source.languageCode === code`, because a multi-language source would vanish from
every language but its first.

### 5.5 The in-process cache

`cache.ts` is server-only and bounded:

```ts
type Entry<T> = { value: T; expiresAt: number };
const CATALOGUE_TTL_MS = 5 * 60_000;
const COLLECTION_TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 50;
```

- `cachedCatalogue(sourceId, languageCode, loader)`
- `cachedTracks(sourceId, collectionKey, loader)`

Keys must include **every** input that changes the result (`sourceId`,
`languageCode`, `collectionKey`). Expired entries are removed on read; when the
map passes `MAX_ENTRIES`, evict the oldest insertion. A cache miss is the only
place `listCollections`/`getTracks` is called.

Why a process cache instead of `unstable_cache`: it also stores the signed URLs
for a few minutes, which is desirable, and it needs no request-scoped cookie or
path tagging. On a cold serverless instance the first request pays the source's
latency once. If the app is deployed with more than one process the cache is
per-process — that is fine; it is a latency optimisation, never correctness.

Never cache `saveOnlineCollection` writes or a stream resolution's personal
state.

---

## 6. Server actions

All live in `src/app/actions/online/`, start with `"use server"`, and return
`ActResult<T>`. A `"use server"` module may export only async functions — put
shared types in `src/lib/online/*`, not beside the action.

### 6.1 `get-browse-collections.ts`

```ts
export async function getBrowseCollections(input: {
  sourceId: string;
  languageCode?: string;
  page?: number;
  limit?: number;
  query?: string;
}): Promise<ActResult<{
  collections: OnlineCollection[];
  page: number;
  limit: number;
  hasMore: boolean;
}>>;
```

- Validate `sourceId` through `findSource`; unknown source is `fail("validation", ...)`, not a crash.
- `findSource` + `getAdapter`; `getAdapter` returning `null` is the same validation failure.
- Before hitting the network, if `query` is non-empty and the adapter has
  `searchCollections`, call it; otherwise call `listCollections({ languageCode })`
  through the cache and filter with `src/lib/search.ts` (`createSearchIndex`
  over `[title, subtitle, source.name]`, then `searchIndex`). **Fold the text.**
  A raw `includes()` misses `كتاب` for `کتاب`.
- Sort: keep the adapter's order. Manahej is busiest-first, archive is
  most-downloaded, aminikhaah is the site's own order. Do not re-sort by title;
  a browse list's order is the source's editorial decision.
- Paginate in memory: `page` is 1-based, `limit` defaults to 24, clamp to
  `1..96`. `hasMore = page * limit < collections.length`.
- Wrap adapter errors with `onlineFailure(error)` (§11).

### 6.2 `get-online-collection.ts`

```ts
export async function getOnlineCollection(input: {
  sourceId: string;
  externalId: string;
}): Promise<ActResult<{
  collection: OnlineCollection;
  tracks: OnlineTrack[];
}>>;
```

- Validate both ids; reject an empty `externalId`.
- Resolve the collection metadata with `adapter.getCollection?.(externalId)`
  when present, otherwise scan `listCollections` (cached) for the matching
  `externalId`. A missing collection is `fail("validation", "not_found")` with a
  Persian "این مجموعه در منبع پیدا نشد" in the UI (not a retryable error).
- Load tracks through `cachedTracks(sourceId, key, () => adapter.getTracks(key))`.
  For aminikhaah, `getTracks` also resolves the collection detail — reuse that
  metadata rather than two round trips.
- If the source reports `trackCount: 0`, the opened collection supplies the real
  count for **display only**. Never write `trackCount` back here; the server row
  is updated when the listener saves/favourites/plays (§7.3).
- Return tracks in the adapter's order, with `order` normalised to `1..n`.

### 6.3 `resolve-online-stream.ts`

```ts
export async function resolveOnlineStream(input: {
  sourceId: string;
  externalId: string;
  collectionKey: string;
}): Promise<ActResult<{ streamUrl: string; durationSec: number }>>;
```

This is the server half of `StreamResolver`.

- `parseCollectionKey` the input and require `sourceId` to match the key's
  source. A mismatched key is a caller bug: `fail("validation", ...)`.
- Find the track in `cachedTracks`. A missing item is `not_found`, **not** a
  retryable failure.
- Return the adapter's `streamUrl` and `durationSec`. Do not `HEAD` the URL;
  a media element is the authority on whether it plays.
- Never log the URL. Signed URLs are bearer tokens for the source's bytes.

### 6.4 `get-my-online-collections.ts`

```ts
export async function getMyOnlineCollections(input?: {
  isFavorite?: boolean;
  sourceId?: string;
  languageCode?: string;
  sortBy?: "updatedAt" | "lastOpenedAt" | "title";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}): Promise<ActResult<{
  collections: OnlineCollectionRow[];
  page: number;
  limit: number;
  hasMore: boolean;
}>>;
```

Call `callAct("onlineCollection", "getMyOnlineCollections", …)`. Projection:
`clientId, sourceId, externalId, title, subtitle, artworkUrl, languageCode,
trackCount, pageUrl, isFavorite, lastOpenedAt`. Parse defensively; the backend
returns a bare array (no total). Rebuild `key` from `sourceId:externalId` — do
not trust `clientId` alone.

`OnlineCollectionRow` extends `OnlineCollection` with
`isFavorite: boolean; lastOpenedAt: number | null; updatedAt: number | null`.

### 6.5 `get-my-contexts.ts`

```ts
export async function getMyContexts(input?: {
  contextType?: "online" | "playlist";
  contextKey?: string;
  page?: number;
  limit?: number;
}): Promise<ActResult<PlaybackContextRow[]>>;
```

Call `callAct("playbackContext", "getMyPlaybackContexts", …)`. Projection:
`clientId, contextType, contextKey, contextTitle, trackCount, startedAt, endedAt,
lastIndex, lastPositionSec, listenedSec, finishedCount, completed, interrupted,
updatedAt`.

`PlaybackContextRow` mirrors the fields. The act returns a bare array sorted
newest-first; **do not re-sort** and do not add a total.

This is the whole of Continue's server data. There is no new backend act.

### 6.6 `save-online-collection.ts`

```ts
export async function saveOnlineCollection(input: {
  collection: Pick<OnlineCollection, "sourceId" | "externalId" | "title" | "languageCode" | "trackCount"> &
    Partial<Pick<OnlineCollection, "subtitle" | "artworkUrl" | "pageUrl">>;
  isFavorite?: boolean;
  /** Defaults to Date.now(). Do not send a client clock for updatedAt. */
  lastOpenedAt?: number;
}): Promise<ActResult<OnlineCollectionRow>>;
```

Call `saveOnlineCollection` with:

```ts
set: {
  sourceId, externalId, title, languageCode,
  trackCount: Math.max(0, Math.round(trackCount)),
  ...(subtitle ? { subtitle } : {}),
  ...(artworkUrl ? { artworkUrl } : {}),
  ...(pageUrl ? { pageUrl } : {}),
  ...(isFavorite === undefined ? {} : { isFavorite }),
  ...(lastOpenedAt === undefined ? {} : { lastOpenedAt }),
  updatedAt: Date.now(),
}
```

Three rules, all visible in the backend validator:

- **`updatedAt` is the server's `Date.now()`**, not the browser's. A skewed
  client clock must not make a save lose last-write-wins to a stale one.
- **`clientId` is never sent.** The backend derives it from `sourceId` +
  `externalId`; a client-chosen key could disagree with the run's `contextKey`.
- **Upsert, not create.** Calling it twice with `isFavorite: true` must leave
  one row. The act already enforces per-user uniqueness.

Return the parsed row from the `get` projection `selectStruct("onlineCollection", 1)`
or the fields listed above.

### 6.7 `remove-online-collection.ts`

```ts
export async function removeOnlineCollection(input: {
  sourceId: string;
  externalId: string;
}): Promise<ActResult<null>>;
```

Call `callAct("onlineCollection", "removeOnlineCollection", …)`. This is the only
verb that removes a saved collection from the shelf. Un-favouriting is **not** a
removal: it is `saveOnlineCollection({ isFavorite: false })`, because the
listener may still want it in Continue. Use a distinct control and distinct copy
for each.

---

## 7. Client wiring

### 7.1 Registering stream resolvers

The controller resolves through `stream.ts`; something must register a resolver
per source in the browser. Add `src/components/player/online-stream-bridge.tsx`
(`"use client"`):

```tsx
"use client";

import { useEffect } from "react";
import { registerLiveSource, registerStreamResolver } from "@/lib/player/stream";
import { resolveOnlineStream } from "@/app/actions/online/resolve-online-stream";

export function OnlineStreamBridge({
  sources,
}: {
  sources: readonly { id: string; live: boolean }[];
}) {
  useEffect(() => {
    for (const source of sources) {
      if (source.live) registerLiveSource(source.id);
      registerStreamResolver(source.id, async (input) => {
        const result = await resolveOnlineStream(input);
        if (!result.success) throw new Error(result.error.message);
        return result.body;
      });
    }
  }, [sources]);
  return null;
}
```

Mount it in `src/app/(shell)/layout.tsx` next to `<PlayerBar />`, passing
`SOURCES.map(({ id, live }) => ({ id, live: live === true }))` from the server.
`SOURCES` is server-only; only the serialisable `{ id, live }` crosses the
boundary.

Rules:

- Register **once per mount**, not per render; the `useEffect` keyed on a stable
  serialised source list is enough.
- A resolver throws `StreamError` codes only where the player knows how to react.
  A failed Server Action is `source-unavailable`; a missing track is `not-found`.
  The action's `ActFailure.kind` and `detail.code` decide which.
- The registry is process-global in the browser by design
  (`clearStreamRegistryForTests` exists). Do not hold a resolver in React state.
- `registerLiveSource` must run before any queue is built so
  `playerTrackFromTrack`/`playerTrackFromOnline` set `isLive` correctly.

### 7.2 Building an online queue

Add `src/lib/online/player-track.ts`:

```ts
export async function playerTrackFromOnline(
  source: OnlineSource,
  collection: Pick<OnlineCollection, "key" | "title">,
  track: OnlineTrack,
): Promise<PlayerTrack>;
```

- `contentHash: await onlineContentHash(source.id, track.externalId)`.
- `origin: "online"`.
- `sourceId: source.id`; `externalId: track.externalId`.
- `collectionKey: collection.key`; `collectionTitle: collection.title`.
- `title`, `artist` (from `track.artist`), `albumTitle` (collection title),
  `artworkUrl` (track artwork, else collection artwork), `durationSec`.
- `serverId: null` — registration happens on first play, as it already does.
- `isLive: source.live === true || isLiveSource(source.id)`.

Building a 60-track queue awaits 60 hashes. `onlineContentHash` memoises, and
`Promise.all` is fine; each hash is a tiny SHA-256 over a short string. Do not
add a worker.

Then play:

```ts
await playQueueAt(queue, index, {
  context: { type: "online", key: collection.key, title: collection.title },
  startPositionSec: resumeTargetSec,
});
```

`playQueueAt` opens the run with `trackCount = queue.length`. This is the only
place a collection becomes a run. Do **not** call `registerTrack` before
`playQueueAt`: the controller's existing `loadCurrent` fires it, and duplicating
it here would race the first session for the server id.

### 7.3 Saving when it matters

- **Favourite toggle** → `saveOnlineCollection({ collection, isFavorite: next })`.
  Optimistic UI: flip locally, call, revert + Persian notice on failure.
- **First play of a collection** → `saveOnlineCollection({ collection,
  lastOpenedAt: Date.now() })`, fire-and-forget **after** `playQueueAt` has
  started. A failed save must not stop playback. This is what puts the collection
  in Continue on another device even if the listener never pressed the heart.
- **Opening a collection page** does **not** write. A Server Component render
  must not mutate, and a page view is not a decision.
- **Remove from shelf** → `removeOnlineCollection`; confirm first, because it is
  the one action that destroys the saved row. The control is bordered in the
  danger colour, not filled: it is destructive but not primary.

Do not add `onlineCollections` to the player's `syncLocalData` batch. The web is
online when it browses, so the direct act is simpler and avoids inventing a local
queue the web does not have. If a later offline web mode arrives, that is its own
design.

### 7.4 Continue

`src/lib/online/continue.ts` is pure:

```ts
export type ContinueItem = {
  key: string;
  sourceId: string;
  externalId: string;
  title: string;
  trackCount: number;
  finishedCount: number;
  lastIndex: number;
  lastPositionSec: number;
  resumeTargetSec: number;
  run: PlaybackContextRow;
  collection: OnlineCollectionRow | null;
};

export function buildContinueItems(
  runs: readonly PlaybackContextRow[],
  collections: readonly OnlineCollectionRow[],
  limit = 12,
): ContinueItem[];
```

Rules, ported from mobile:

- Only `contextType === "online"`, only ended runs with `endedAt !== null`, and
  only runs for which `isPartialRun` is true. A finished course is not
  "continue".
- One row per `contextKey`: the newest run (the act already sorts
  newest-first), not one per attempt.
- The run is authoritative for **where**; the saved collection is used only for
  artwork/subtitle. `collection` may be `null` — a run outlives a collection the
  listener removed. Render the run's own `contextTitle` in that case.
- `resumeTargetSec = runResumeTargetSec(run)`; it is 0 for a completed run.
- Skip malformed keys (`parseCollectionKey` returns `null`).

The `/browse?tab=continue` page calls `getMyContexts({ contextType: "online",
limit: 36 })` and `getMyOnlineCollections({ sortBy: "lastOpenedAt", limit: 100 })`
in parallel, then `buildContinueItems`. Two reads, one render.

**Known boundary:** the player keeps a run open until the queue ends or the
player is closed; a bare pause does not close it, so a run started in this tab
and never closed will not appear in Continue on another device. Do not paper
over this by writing runs from Discover. It is a player lifecycle rule; note it
in the Continue empty state only if the list is empty ("اجرای نیمه‌تمام هنوز
ثبت نشده است"). Do not read `localStorage` in a Server Component to fake it.

### 7.5 Resume

- A Continue card's **primary** action resumes: `lastIndex` + `resumeTargetSec`.
- A collection page's primary action:
  - If a partial run exists → «ادامه از …» with a secondary «از ابتدا».
  - If the last run completed → «پخش دوباره» from index 0.
  - If no run → «پخش» from index 0.
- `resumeTargetSec` is a whole number of seconds; the player clamps it again.
- **A live source has no resume.** `runResumeTargetSec` must never be applied to
  `source.live`: always 0, and the collection page hides progress/"resume at"
  copy.

---

## 8. Routes

All routes live under the existing `(shell)` layout, so `getMe` guards them and
the sidebar + player bar are present. Each page is an async Server Component:
`params` and `searchParams` are Promises in Next 16.

### 8.1 `/browse`

`src/app/(shell)/browse/page.tsx`

- `metadata = { title: "کاوش" }`.
- `PageHeader` overline «کتابخانهٔ آزاد», title «کاوش», description: «صداهای
  رایگان از منبع‌های خودشان، برای شنیدن در همین مرورگر.»
- `BrowseTabs`: three links, URL state `?tab=continue|favorites|browse`.
  Default `browse`. Each tab is a `<Link>` (navigation state belongs in the URL)
  with `aria-current="page"`; no client state and no animation.
- Tab labels: «ادامه», «نشان‌شده‌ها», «کاوش».
- Wrap each panel in `Suspense` with a `CollectionSkeleton` (grid of six
  `Skeleton` tiles). The header and tabs paint immediately.
- **Landing makes no third-party request.** `tab=browse` renders
  `LanguageList` from the static `LANGUAGES` catalogue. Continue/Favorites read
  only the backend. No adapter runs until a language's source page is opened.
- Do not add a search field on `/browse`; the first search is the language list
  (§9.1). A second search box above it would be two search models on one screen.

### 8.2 `/browse/language/[code]`

- `params.code` → `findLanguage`. Unknown code → `notFound()`.
- Header: overline «زبان», title `language.nativeName`, description
  `language.name` + « · » + the number of sources.
- `SourceList`: every `sourcesForLanguage(code)` as a `SourceCard`. A language
  with no sources renders an `EmptyState` «هنوز منبعی برای این زبان نیست» with a
  link back to `/browse`. The full catalogue keeps unavailable languages visible
  (marked «به‌زودی»), so the list must not silently vanish.
- Each source card links to `/browse/source/[id]?language=[code]`.
- A «زبان دیگر» link back to `/browse?tab=browse`.
- No adapter call here: source metadata is static. This page is instant.

### 8.3 `/browse/source/[id]`

- `params.id` → `findSource`; unknown → `notFound()`.
- `searchParams`: `page`, `q`, `language`.
- Header: overline = source native name, title = source name, description =
  source description, actions = attribution link to `source.homepage`
  (`rel="noreferrer noopener"`, opens a new tab).
- A source may serve several languages: show a small `Badge` for the current
  language (from `?language`, else `source.languageCode`).
- `CollectionGrid` of `CollectionCard`s from `getBrowseCollections`.
- `SearchField` for this source's catalogue: a form with `method="get"` and a
  hidden `language` input, so search works without JavaScript. Debounce is not
  needed for a form submit; if a client-side instant filter is added, it must
  use `useDeferredValue` and the folded index — never a raw `includes()`.
- Empty query result vs empty source are different: «چیزی پیدا نشد» with the
  query echoed, versus «این منبع فعلاً مجموعه‌ای ندارد».
- `Pagination` with `buildHref` preserving `q` and `language`.
- Error: `SourceProblem` (§11) with a retry link to the same URL.

### 8.4 `/browse/collection/[sourceId]/[externalId]`

Use **two segments**, not a single `sourceId:externalId` segment. A colon in a
URL path segment is legal but awkward to share, and a static prefix is easier to
route than a key with a colon.

- Validate `sourceId` with `findSource`; unknown → `notFound()`.
- Call `getOnlineCollection({ sourceId, externalId })`.
- NotFound from the source → `notFound()` (a real 404 page), not an error state.
- Header:
  - `TrackArtwork`-style cover (reuse `src/components/online/artwork.tsx`, a
    collection-shaped leaf; do not pass a fake `PlayerTrack`).
  - Title, subtitle, source name + language.
  - `describeCollectionLine` for the meta line, using the **opened** track count
    when the catalogue reported 0.
  - Actions: `PlayCollectionButton`, `FavoriteButton`, «صفحهٔ منبع» link
    (`pageUrl`), `RemoveButton` when the collection is in the shelf.
- Track list:
  - A `ListGroup`/`Card`-shaped list, not a table: the rows are homogeneous and
    the web has plenty of width, but a table would suggest columns the source
    does not provide.
  - Each row: index (tabular), title, artist, duration (`formatClockFa`, «—»
    when 0), a play button that starts **the whole collection at that index**
    (so the run's `trackCount` is the collection, not one track), and a link to
    the item's `pageUrl` when present.
  - Long titles truncate with a `title` attribute; no tooltip component.
  - Duration 0 means unknown; never print «۰:۰۰» as if it were a real length.
- Series grouping: only for sources whose `kind` is `manahej` or
  `aminikhaah` and whose tracks return more than one group of two or more. Use
  `buildSeriesSections`; a section heading is a `<h3>`; the standalone bucket is
  last and labelled in Persian («قطعه‌های پراکنده»), **not** the mobile English
  constant. If there is only one standalone section, render the flat list — the
  grouping helped nothing.
- The page loads tracks in one action call; do not fetch a collection twice
  (metadata + tracks) from the client.

---

## 9. Components

Everything here is a **server component by default**. A component becomes
`"use client"` only when it owns a browser API, a user event that calls a Server
Action, or the player store. Keep the client boundary at the smallest leaf.

### 9.1 `LanguageList` / `LanguageSearch`

- The catalogue is `LANGUAGES`, ordered by English `name`. That order never
  changes with the UI locale; it is the one stable order on every device.
- Each row: native name (title), English name (caption), ISO code (mono,
  `dir="ltr"`), and a right-pointing chevron at the **end** edge (`ms-auto`).
- An available language links to `/browse/language/[code]`; an unavailable one
  is a non-interactive row with a `Badge tone="muted"` «به‌زودی». Do not hide
  it: "we have nothing yet" is a different answer from "this language does not
  exist".
- `LanguageSearch` is a client leaf over the **static** list:
  - `useState` query, `useDeferredValue`, fold with `foldText`.
  - `createSearchIndex` over `languageSearchFields(language)` in a `useMemo`
    keyed on the catalogue, hits in another keyed on the deferred query.
  - Fields: `nativeName` (title), `name`, `code`, archive facets (alias). A
    field with no value is `null`, never `""`.
  - No network, no spinner, no debounce timer. Filtering 46 rows is free.
  - If `createSearchIndex` needs a generic `Item` id, use the language `code`.
- Group by the first letter of the English name? **No.** English initials are
  noise in a Persian RTL list. One flat list with a sticky search field is the
  right shape.

### 9.2 `SourceCard`

- One `Card`, padded, with the source's native name as the title, the Latin name
  as the overline, the description as a caption, and a `Badge` for language
  (native name) and a second for «زنده» only when `source.live`.
- The whole card is a link; the arrow is at the end edge.
- No logo: sources do not provide a reliably licensed mark. Do not hotlink a
  favicon.

### 9.3 `CollectionCard`

Props: `collection: OnlineCollection`, optional `run` info (finished/trackCount
for Continue), optional `favorite` state, optional `href`.

- Artwork: `src/components/online/artwork.tsx` — a client leaf that renders an
  `<img>` with `referrerPolicy="no-referrer"`, `loading="lazy"`,
  `decoding="async"`, and a deterministic Persian-initial or `Icon` fallback
  when `artworkUrl` is missing **or the image fails to load**. Use the
  collection key for the fallback's hue, just as `TrackArtwork` does. Do not use
  `next/image`; the source hosts are arbitrary and not in `remotePatterns`, and
  adding every archive storage host is a maintenance trap.
- Body: title (2-line clamp), source native name (overline), and
  `describeCollectionLine` (subtitle · known size).
- A collection with `trackCount === 0` prints **nothing** for size. This is the
  archive/aminikhaah "unknown until opened" rule. Never print «۰ قطعه».
- No download state, no download button, no "downloaded" badge. The web does not
  download.
- Continue cards additionally show `describeRunOutcome` (from
  `src/lib/player/playbackContext.ts`, already Persian) and a progress bar whose
  value is `runProgressRatio`. The primary button is «ادامه» and resumes; the
  card body links to the collection.
- Hover raises the card by the existing elevation token; no transform, no
  shadow-on-hover animation (`prefers-reduced-motion` is not needed because
  there is no motion).

### 9.4 `CollectionGrid`

- CSS grid: 1 column at base, 2 at `sm`, 3 at `lg`, 4 at `xl`.
- Every card in a row is the same height; the title clamp is what makes that
  true.
- Empty/error slots render inside the grid's parent `Card`, not as a bare
  paragraph.

### 9.5 `TrackRow` / `TrackList`

- Compose from plain elements; there is no mobile `RowShell` on the web.
- Leading index is `type-numeric`, `dir="ltr"`; duration is tabular.
- The play control is a `Button variant="ghost" size="icon"` with an accessible
  label «پخش از این قطعه». It calls `PlayCollectionButton`'s shared handler; do
  not duplicate the queue-building logic in every row.
- The current row (same `collectionKey` and same `contentHash` as the player's
  `current`) shows an accent dot or a filled play glyph, but **do not subscribe
  the whole list to the store**. A single client `NowPlayingRow` leaf may select
  `current.contentHash`; the rest of the row is server-rendered.
- No per-row glass, no hover-only controls that disappear on touch. The play
  button is always present.

### 9.6 `PlayCollectionButton`

`"use client"`. Props: `collection: Pick<OnlineCollection,"key"|"title"|"sourceId"|"externalId"|"artworkUrl">`,
`tracks?: OnlineTrack[]` (already loaded), `index?: number`,
`startPositionSec?: number`, `label`, `variant`.

- If `tracks` is absent, it calls `getOnlineCollection` on click and uses the
  returned tracks. This is how a Continue card plays without navigating.
- Builds the queue with `playerTrackFromOnline`, then `playQueueAt`.
- `pending` state: disable the button and swap the glyph for a small spinner
  while resolving/hashing. Do not start a second queue on a double click
  (`useRef` guard).
- On failure: an inline danger notice under the button with the mapped Persian
  sentence and a «تلاش دوباره» button. Never `alert()`.
- Do not navigate. The player bar appears; the listener stays where they are.
- A live source: label «پخش زنده», no resume, no duration.

### 9.7 `FavoriteButton`

`"use client"`, a `useState` optimistic boolean + `useTransition`.

- `aria-pressed` and a distinct filled/outlined heart; label «نشان کردن» /
  «نشان‌شده».
- Calls `saveOnlineCollection({ collection, isFavorite: next })`; on failure,
  revert and show a Persian inline notice.
- On the collection page, the initial `isFavorite` comes from a
  `getMyOnlineCollections({ sourceId, ... })` lookup or an optional
  `isFavorite` field added to `getOnlineCollection`'s result. Do not add a new
  backend act; query the existing list filtered by source and find the key.
  (If that is two reads on one page, it is two small reads; the alternative is a
  second source of truth.)
- A favourite is not a saved shelf row by itself? It **is**: `saveOnlineCollection`
  upserts the row with `isFavorite: true`, and the row is what Favorites lists.

### 9.8 `RemoveButton`

- Only shown when the collection exists in `getMyOnlineCollections` for this
  user/source.
- Opens a small confirmation (`Sheet` or Radix dialog already used by the
  player) with the title and «این مجموعه از فهرست شما حذف می‌شود.». Confirm →
  `removeOnlineCollection`, then `router.refresh()`.
- Destructive but secondary: `Button variant="danger"`? Check the button
  variants. Use the existing danger variant, not a red fill on the page header.
- Do not use `window.confirm`.

### 9.9 `BrowseTabs`

- Links, not buttons. `?tab=` preserves nothing else (this page has no other
  params). Use `aria-current="page"` on the active tab.
- The active tab is the standard accent-soft pill used by `NavLink`; no sliding
  indicator (plan §7.7: no motion on navigation).
- On narrow widths, horizontal scroll with `overflow-x-auto`; the tabs must
  never wrap onto two lines.

### 9.10 `SourceProblem`

A server-rendered error/empty component for third-party failures. It takes
`{ code, title?, sourceName?, retryHref }` and renders an `Icon`, a Persian
sentence, and a retry link. Copy by code:

| code | Persian |
|---|---|
| `offline` | «به منبع وصل نشدیم. اتصال خود را بررسی کنید.» |
| `timeout` | «منبع دیر جواب داد. دوباره تلاش کنید.» |
| `invalid_response` | «پاسخ منبع خوانا نبود. شاید ساختارش عوض شده است.» |
| `not_found` | «این مجموعه در منبع پیدا نشد.» |
| `unavailable` | «این منبع فعلاً در دسترس نیست.» |

Never show the source's raw English error to the listener. Keep the technical
message in `<details>` as `ErrorState` does.

---

## 10. Page composition and states

Every data surface follows the existing four-state contract:

1. **Loading** — a skeleton with the shape of the result. For grids, six
   `CollectionCard`-shaped `Skeleton`s. For track lists, eight row-shaped
   skeletons.
2. **Empty** — `EmptyState` with an action:
   - Continue: «چیزی برای ادامه نیست» → «کاوش مجموعه‌ها» → `/browse?tab=browse`.
   - Favorites: «هنوز مجموعه‌ای نشان نکرده‌اید» → «کاوش مجموعه‌ها».
   - Source catalogue: «این منبع مجموعه‌ای ندارد» → back to the language.
   - Search: «چیزی پیدا نشد» with the query and a «پاک کردن جست‌وجو» link.
3. **Failed** — `SourceProblem` (third-party) or `ErrorState` (backend), with a
   retry link. Never a blank grid, never a thrown error.
4. **Offline / degraded** — a `SourceProblem code="offline"` **plus** the
   shelf data that still works. Continue and Favorites are backend reads; if the
   backend is reachable but the source is not, the shelf still renders and only
   the source panel says it failed. If the backend is offline, the shell itself
   shows its error state; do not double-report.

`Suspense` boundaries belong around the **data panel**, not around the page, so
the header and tabs stay visible while a slow source answers.

---

## 11. Errors, validation, and honesty

`src/lib/online/errors.ts`:

```ts
export type OnlineFailureCode =
  | "offline" | "timeout" | "not_found" | "invalid_response" | "unavailable";

export function toActFailure(error: unknown): ActError;
```

Mapping:

- `OnlineSourceError.code === "offline"` → `fail("offline", ...)`.
- `"timeout"` → `fail("offline", ...)`; a timeout is a connection problem to
  the listener, and `detail.code = "timeout"` chooses the specific sentence.
- `"not_found"` → `fail("validation", ...)`; not retryable.
- `"invalid_response"` → `fail("server", ...)`; retryable by the UI, because a
  transient bad response is plausible.
- Anything else → `fail("server", ...)`.
- Put the code in `detail: { code }` so `SourceProblem` can read it without
  parsing English.

Rules:

- A source that has changed shape is a **server** failure with a specific
  sentence, not a crash and not a silently empty list.
- `getOnlineCollection` returning not-found is a 404, not an error with retry.
- A bad URL (`sourceId` unknown, empty `externalId`) never reaches an adapter.
- Do not surface the source's HTTP status. The listener cannot act on `503`.
- Do not log signed URLs. Log the source id, the adapter method, and the error
  code only.

---

## 12. Security and performance

- **SSRF:** adapters build URLs from constants and validated ids only. Never
  accept a URL from `searchParams`, a form field, or a header. The `externalId`
  is validated as `^\d+$` for manahej/aminikhaah; the archive's identifier is
  `^[A-Za-z0-9._-]+$`; librivox likewise. If an adapter must accept a broader id,
  constrain it before interpolation.
- **No token leakage:** source calls do not carry the Pejvak JWT. They are
  unauthenticated public reads. Keep them in a separate fetch function from
  `callAct`; never pass the cookie through.
- **Response size:** cap the body read; reject a non-JSON response to
  `requestJson` with `invalid_response`.
- **Caching:** bounded, TTL'd, per-process, keyed by every input. Do not cache
  errors forever; a failed load may be retried immediately.
- **Cost:** a catalogue page is one upstream request per source (manahej: two —
  categories + playlist; aminikhaah: many pages). The 5-minute cache is what
  keeps a page refresh from re-crawling. Do not prefetch every source on
  `/browse`.
- **No client-side secret:** the only client-visible third-party data is the
  resolved stream URL, which is necessary and short-lived. Do not put it in the
  URL bar or `localStorage`.
- **RTL/Persian:** use logical CSS (`ps-*`, `pe-*`, `ms-auto`, `me-*`), never
  `left`/`right`. Numbers use `faNumber`/`fa` where the existing screens do;
  ISO codes and URLs stay `dir="ltr"`.
- **Accessibility:** each collection card is a single link with its title as the
  accessible name; the play/favourite buttons are separate controls and must not
  be nested inside the link. Use `aria-pressed` for favourites, `aria-busy` while
  a play action resolves, and a visible focus ring from the existing tokens.
- **No keyboard trap:** the language search input is a normal `TextField`; the
  grid is ordinary links. `Enter` on a card navigates; `Space` on a play button
  plays.

---

## 13. Tests

Add Vitest tests beside the pure modules. No render tests for the visual layer
(the project has none), but test the decisions that are easy to get wrong:

### Adapters and parsers

- `manahej`: category filtering (`parent === radio`, `count > 0`), ordering
  (busiest first, id tiebreak), playlist mapping drops a row with no `mp3` or no
  `sourcePostID`, `encodeNonAscii` does not double-encode `%`, duration is 0
  when `length: false`.
- `aminikhaah`: `parseAminikhaahDuration` for `MM:SS`, `HH:MM:SS`, garbage, and
  `0`; hidden/deleted rows are dropped; `absoluteUrl` for absolute, `//`, and
  root-relative values; duration uses seconds, never minutes.
- `archive`: `parseArchiveDuration` treats a colon string as **minutes**, a bare
  number as seconds, and garbage as 0; `.mp3` extension decides playability
  regardless of the `format` label; a `{}` detail response is not-found; language
  facets are OR'd; `trackCount` is 0 for a listing.
- `aminikhaah` search (if implemented): a fixture HTML page yields album ids,
  titles, and covers; a result with no title is skipped; `node-html-parser` is
  the only HTML reader.
- `radiobrowser`: `live` is true; no duration.
- `series`: the existing mobile cases (part marker, trailing number, subtitle
  fold, singletons), ported with the same expectations.

### Pure domain

- `parseCollectionKey` for valid, empty-source, empty-external, and no-colon.
- `onlineIdentity` / `onlineContentHash`: deterministic, different for two
  external ids, same for the same id under two different URLs (there is no URL
  input, which is the point).
- `describeKnownTrackCount(0) === null`; `describeCollectionLine` joins only
  the true parts.
- `buildContinueItems`: drops completed runs, dedupes by key newest-first, keeps
  a run with no saved collection, skips a malformed key, respects `limit`,
  computes `resumeTargetSec`.
- `playerTrackFromOnline`: carries source/external/collection ids, sets
  `isLive`, `serverId: null`, and hashes once per identity.
- Source registry: every source's language is available; `sourcesForLanguage`
  finds an archive source; duplicate source ids fail.

### Server actions

Mock `callAct` and the adapter/cache. Assert:

- `saveOnlineCollection` sends `updatedAt` (a number), never `clientId`, and
  converts `trackCount` to a non-negative integer.
- `getMyOnlineCollections` parses a bare array and rebuilds `key`.
- `getMyContexts` passes `contextType`/`contextKey` through and does not sort.
- `resolveOnlineStream` rejects a mismatched `collectionKey` and a missing track.
- `getBrowseCollections` folds the query (a query with an Arabic kaf finds a
  Persian-kaf title) and paginates with `hasMore`.

### Not tested

- Tailwind classes, layout, hover states, the artwork fallback's pixels.
- A live network call. Every adapter test uses a fixture; no test hits a real
  source.

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

`npm run check` also runs `check:declarations` and is the final gate.

---

## 14. Acceptance criteria

A reviewer can walk through these and see each one:

1. `/browse` no longer shows `PlannedSurface`; it shows «کاوش» and three tabs.
2. `?tab=browse` lists the whole language catalogue in English-name order, with
   native names; an unavailable language is visible and marked «به‌زودی», not
   hidden.
3. Typing `فارسی` and `Persian` and `fa` all find Persian in the language search;
   typing `كتاب` with an Arabic kaf finds the same result as `کتاب`. No network
   request is made while typing.
4. Opening Persian lists manahej, aminikhaah, aminikhaah podcasts, and an
   archive source; opening English lists the archive and Librivox.
5. Opening a source lists collections without a download control; an unknown
   size prints no size, not «۰ قطعه».
6. Opening a collection shows its cover, title, source, track count when known,
   and every track; the size reported by the source at open is what the page
   shows.
7. Pressing «پخش» builds one queue from the whole collection, starts the first
   track, shows the player bar, records a session and an online run, and does not
   autoplay on page load.
8. Pressing the play control on track 5 starts at track 5, with the run's
   `trackCount` equal to the full collection.
9. Pressing «ادامه» on a Continue card resumes at `lastIndex` and
   `resumeTargetSec`; «از ابتدا» starts at index 0, position 0.
10. Favouriting a collection writes one row with `isFavorite: true` and the
    Favorites tab lists it; pressing again writes `false` and it leaves the tab.
11. «حذف از فهرست» asks first, removes the row, and returns the listener to a
    refreshed shelf.
12. A source that is down shows a Persian source-specific error with retry while
    Continue and Favorites still render; a collection that does not exist is a
    404, not a retry loop.
13. A signed manahej URL that expires mid-session triggers **one** re-resolve on
    error; a second failure shows a clear error, not an infinite retry.
14. A live radio source has no duration, no resume, and no progress bar.
15. A streamed track appears in Library/History after the player syncs; its
    `contentHash` is the same on a second visit and after a reload.
16. No `BACKEND_URL`, JWT, or adapter module appears in the client bundle
    (`npm run build` + inspect the route's chunks, or verify the
    `server-only` import fails the build if violated).
17. `npm run check` passes; no new `any`, no English UI copy, no hard-coded
    radius, no second icon import.

---

## 15. Manual verification

No development server is started by this task unless the listener asks. When
asked:

1. `npm run dev`, sign in, open `/browse`.
2. With DevTools' Network tab filtered to `manahej`, `aminikhaah`, `archive`,
   reload `/browse?tab=browse` and confirm **zero** third-party requests.
3. Open فارسی → رادیو مناهج. Confirm the source's own card shows the category
   count and no download control.
4. Open a category. Confirm the track list, durations, and that a second open
   within five minutes does not re-request the playlist (the cache).
5. Press play. Confirm the `<audio>` element's `src` is the source's URL, the
   player bar appears, and Network shows a `registerTrack` call followed by the
   first session on pause.
6. Reload and open the collection again. Confirm the Continue tab contains it
   only if the run was finalized (queue ended or player closed), which is the
   documented boundary — not a bug in Discover.
7. Throttle to offline and open a source. Confirm the Persian offline state and
   that the tabs still switch.
8. Add `?q=كتاب` with an Arabic kaf and confirm Persian-kaf results appear.

---

## 16. Out of scope

- Downloads, offline caching of audio, service workers, filesystem APIs.
- Playlists (Phase 3.3) and their run UI.
- Search across all sources at once; each source is searched on its own page.
- Recommendations, charts, continue-on-another-device conflict resolution.
- Extending `syncLocalData` with `onlineCollections`; the web uses the direct
  act.
- Any `mobile/`, `back/`, or declaration change.

If a requirement here cannot be met without touching one of those, stop and say
so rather than inventing a workaround.
