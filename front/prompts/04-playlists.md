# 04 — Playlists: a collection you can build, order, and play

Implementation brief for Phase 3.3 of `front/docs/PLAN.md` ("Playlists: list, create, rename, reorder, delete (`items[]` with `order`)"). Read `front/AGENTS.md`, `front/docs/PLAN.md` §2 C1–C6, §6.2, §7, §10, and the finished briefs `01-web-player.md`, `02-discover.md`, `03-history.md` before starting. This brief follows the same rules; where it repeats one, that is on purpose.

The work is **front-end only**. Every act already exists. Do not touch `back/`, do not regenerate declarations, and do not edit `src/types/declarations/selectInp.ts`.

---

## Mission

Replace the `PlannedSurface` at `/playlists` with a real, server-backed playlists surface:

- a list of the listener's playlists, newest change first, paginated;
- an inline create form;
- a detail page that shows the playlist in order, plays it as a **run**, and lets the listener rename it, add tracks, remove tracks, move tracks up and down, and delete it.

The result must be a surface a Persian-speaking listener can use end to end with a keyboard, on a phone-sized viewport, with honest empty/loading/error/failure states — not a demo that only works on the happy path.

---

## What this task must not do

- **No backend change.** `getMyPlaylists`, `createPlaylist`, `updatePlaylist`, `deletePlaylist` are the whole vocabulary. There is no "add item", "remove item", "reorder" act, and inventing a route would break the Lesan wire format.
- **No `syncLocalData` for playlists.** Web playlists are server-native: they are created online and read online. The mobile outbox (`playlists[]` in the sync batch, `clientId`, tombstones) is mobile's offline machinery and is deliberately not ported. Do not add `clientId` to a web read; `createPlaylist` never receives one.
- **No optimistic reorder.** A playlist write replaces the entire `items[]`. An optimistic move that fails would have to restore an array that may already be stale, i.e. reorder twice on screen. Disable the controls while a write is pending and re-read on success.
- **No `window.confirm` and no `alert()`.** Deletion is a two-step inline confirmation (below); failures are inline `role="alert"` banners.
- **No second HTTP path.** All reads and writes go through `callAct` inside a `"use server"` module.
- **No duplicated server state.** The page's props are the truth. Do not mirror `items` into a store or a `useState` that survives navigation; re-read after every write.
- **No `any`.** Parse wire values at the boundary (`src/lib/parse.ts` helpers) and keep the app types narrow.
- **No new floating surface.** Playlists are read content, not chrome: everything is a `Card`/row. Only the player bar may float.
- **No publishing UI.** `isPublic` exists in the model but no mobile screen offers it and this phase does not either. Never send it.
- **No description editor.** The backend has `description`; mobile never writes it. Render it if a playlist already has one, but this phase edits the title only.
- **No per-playlist track resolution on the list page.** Resolving every card's `items[]` is one library scan per card. Cards carry what the act already returned: title, description, item count, `updatedAt`.
- **No `getTrackDetail` N+1 on detail.** Resolve through one library index (below), with per-id fallbacks only for ids the index does not contain.

---

## 1. Ground truth

### 1.1 The model is an array of ids

`back/models/playlist.ts`:

```ts
clientId?: string            // mobile offline id; web never sets it
title: string
description?: string
isPublic: boolean            // default false
items: { trackId: string; order: number }[]   // default []
createdAt: Date
updatedAt: Date
user: User                   // relation
```

Every item names a **server track `_id`**. There is no `contentHash`, no title, no duration, no `sourceId` on the item. Everything a row draws has to come from a second lookup keyed by `trackId`.

`updatedAt` is written by the backend on every mutation, including a pure reorder, so the list (sorted `updatedAt: -1`) moves a playlist to the top whenever anything about it changes. That is the act's contract; do not sort client-side to "stabilise" it.

### 1.2 The acts

| Act | `set` | Notes |
|---|---|---|
| `getMyPlaylists` | `{ page?, limit?, skip? }` | `$sort: { updatedAt: -1 }`, default `limit 50`, **no total** |
| `createPlaylist` | `{ title, description?, isPublic? }` | forces `items: []`, `isPublic: false`; sets `createdAt`/`updatedAt` |
| `updatePlaylist` | `{ playlistId, title?, description?, isPublic?, items?: {trackId,order}[] }` | `$set`s only what is present; **verifies every `trackId` in `items` is owned by the user**; bumps `updatedAt` |
| `deletePlaylist` | `{ playlistId }` | scoped to the user; hard-deletes the row; returns `{ success: true }` |

`model` is always `"playlist"`. Sending `"playlists"` or `"Playlist"` fails validation in a way that looks like an auth problem.

The act names are PascalCase (`updatePlaylist`), not the kebab-case file names used for front modules.

### 1.3 Consequences that shape the implementation

1. **Order is data, not array position.** The act stores the array verbatim. Read order must sort by `order` (and use the array position only to break ties), exactly as mobile's `orderedTrackIds` does. Never render `items[0..n]` in array order.
2. **Writes are whole-array.** Add, remove and move are all "compute the new list, then call `updatePlaylist` once". Do not call the act once per track.
3. **Ownership is re-checked.** Adding a track that is not this user's fails the whole write with `Playlist contains a track you do not own`. The picker only offers tracks from the user's own library, so this is a defence, not a flow.
4. **Deletion is immediate and irreversible.** No tombstone, no undo. The two-step confirm must say what is deleted and what is not: the playlist goes, the tracks stay in the library, and history/annotations stay attached to those tracks.
5. **History outlives the playlist.** Runs and sessions store `contextType`/`contextKey`/`contextTitle` verbatim (`PlaybackContext` is written at play time). Deleting a playlist must not delete rows or attempt to rewrite history.

### 1.4 The acts you may call from a server component

`callAct` (`src/lib/call-act.ts`) returns `ActResult<unknown>`; `"unauthorized"` failures already redirect to login. Everything below is typed through the vendored declaration.

---

## 2. Domain model

New file: **`src/lib/domain/playlist.ts`**.

```ts
import { asArray, asBoolean, asInt, asRecord, asString, asTimestamp } from "../parse";

export type PlaylistItem = { trackId: string; order: number };

export type Playlist = {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  /** In stored order; use `orderedItems()` to read it. */
  items: PlaylistItem[];
  createdAt: number;
  updatedAt: number;
};

/** One item joined to the library row it points at. */
export type PlaylistEntry = {
  item: PlaylistItem;
  /** `null` when the id is no longer in this user's library. */
  track: TrackSummary | null;
};
```

### 2.1 Projection

```ts
export const PLAYLIST_GET = {
  _id: 1,
  title: 1,
  description: 1,
  isPublic: 1,
  items: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;
```

Deliberately no `user`, no `clientId`. The list does not render either.

### 2.2 Parsing

`parsePlaylist(raw: unknown): Playlist | null`:

- require `_id` and `title`; a row without either is dropped, not rendered as "Untitled";
- `description`: `asString` then trim; empty → `null`, so a blank description is never an empty line;
- `isPublic`: `asBoolean`;
- `items`: `asArray`, then for each entry keep `{ trackId, order }` only when `trackId` is a 24-hex string; `order` is `asInt` with a fallback of the entry's array index. Backend validators guarantee this; parsing it anyway means a malformed response cannot crash a render or produce `NaN` sorting;
- collapse duplicate `trackId`s keeping the first (the same track twice in one playlist is a bug, not a feature);
- timestamps through `asTimestamp`; a missing `createdAt` falls back to `updatedAt`, and vice versa. If both are missing the row still renders — relative time can say «هرگز» — but sort order in the list comes from the server, not from these values.

`parsePlaylistList(raw): Playlist[]` mirrors `parseTrackList`.

### 2.3 Ordering

```ts
/** Items in playback order: sort by `order`, array position breaks ties. */
export function orderedItems(playlist: Playlist): PlaylistItem[];
```

Implementation keeps `{ item, index }`, sorts by `order` then `index`, and maps back. Do not mutate `playlist.items`.

`order` values from the backend are not guaranteed to be contiguous (mobile's `normalizeOrder` writes 0..n-1, but an old row or a hand-written update may not). Contiguity is not a read assumption; it is a write invariant (below).

---

## 3. Reading: one library index, then join

### 3.1 Why not `getTrackDetail` per item

Playlist items are ids only, so the detail page must join them against the library. A playlist of 200 tracks would be 200 `getTrackDetail` round trips if joined naively — the N+1 the plan forbids. Instead:

1. read the library once, in pages of 100, up to **50 pages (5,000 tracks)**, using the existing `getMyTracks` action (`sortBy: "createdAt"`, `sortOrder: "desc"` — a stable order matters only for reproducibility, not for the join);
2. build `byId` in memory;
3. for ids still missing after the scan, call `getTrackDetail` with **bounded concurrency 8**, deduped by id. These are almost always deleted tracks; the fallback exists so a legitimately old playlist in a >5,000-track library still resolves.

Stop scanning as soon as `hasMore === false`. On a read failure, propagate the failure — the detail page renders an error state with a retry, not a half-resolved list.

### 3.2 The action

New file: **`src/app/actions/playlists/get-my-playlist.ts`** with:

```ts
export type PlaylistDetailData = {
  playlist: Playlist;
  /** Same length and order as `playlist.items` after parsing; `track: null` when gone. */
  entries: PlaylistEntry[];
  /** The whole library, for the add-track picker. */
  library: TrackSummary[];
};

export async function getMyPlaylistDetail(
  playlistId: string,
): Promise<ActResult<PlaylistDetailData | null>>;
```

Flow:

- a non-ObjectId string returns `ok(null)` **before** any network call (the same rule as `get-track-detail.ts`), so a hand-typed URL is a 404, not a validation error;
- locate the playlist: `getMyPlaylists` has no singular read. Scan pages of 50, up to **20 pages**, for `_id === playlistId`. A miss inside the cap is `ok(null)`; if the cap is reached without a match, return `fail("validation", "این فهرست پیدا نشد.")` rather than pretending the row does not exist. Add a short comment explaining the cap (a personal account with >1,000 playlists is outside the app's design, and the alternative is a write-on-read hack);
- fetch the library index (below), join `orderedItems(playlist)` against it;
- return the library array exactly once; the picker and the join share it.

The library index lives beside it, in the same file or **`get-library-index.ts`**, and is a plain async function (not a Page):

```ts
export const PLAYLIST_LIBRARY_PAGE_SIZE = 100;
export const PLAYLIST_LIBRARY_MAX_PAGES = 50;

export async function getLibraryIndex(): Promise<ActResult<TrackSummary[]>>;
```

It must not return a `Map` across the server/client boundary; callers build their own map. `getMyPlaylistDetail` calls it directly (server-to-server), never through a client component.

### 3.3 The list read

New file: **`src/app/actions/playlists/get-my-playlists.ts`**:

```ts
export const PLAYLIST_PAGE_SIZE = 20;

export type PlaylistPage = {
  playlists: Playlist[];
  page: number;
  limit: number;
  hasMore: boolean;
};

export async function getMyPlaylists(
  query: { page?: number; limit?: number } = {},
): Promise<ActResult<PlaylistPage>>;
```

Same shape as `get-my-tracks.ts`: clamp `page >= 1`, `limit >= 1`, `hasMore = playlists.length >= limit`. The act has no total; never render "page 3 of 12".

---

## 4. Pure operations (`src/lib/playlists.ts`)

Ported from `mobile/src/lib/playlists.ts`, minus `contentHash` and local ids. Keep the functions pure and total.

```ts
/** Rewrites `order` to 0..n-1 over the given sequence. */
export function normalizeItems(items: readonly PlaylistItem[]): PlaylistItem[];

/** Appends ids in order, skipping any already present and any repeats in `trackIds`. */
export function appendTracks(
  items: readonly PlaylistItem[],
  trackIds: readonly string[],
): PlaylistItem[];

/** Removes one id, then renumbers. Returns the input unchanged when absent. */
export function removeTrack(items: readonly PlaylistItem[], trackId: string): PlaylistItem[];

/** Moves one position up/down; clamps at the edges; returns input unchanged when it cannot move. */
export function moveItem(
  items: readonly PlaylistItem[],
  from: number,
  to: number,
): PlaylistItem[];

/** Entries that this browser can actually stream, in order. */
export function playableEntries(entries: readonly PlaylistEntry[]): PlaylistEntry[];
```

Rules, each of which is a test:

- `normalizeItems` assigns `order = index`; it assumes the input is already in the desired sequence. Every mutation that changes sequence ends with it.
- Adding dedupes against the existing set **and** within the batch: the same track twice in one add is one row.
- Removing an id that is not there is a no-op that still returns a normalized copy (callers can always send the result).
- `moveItem` validates both indices; `from === to` is a no-op. "Move up" is `moveItem(items, index, index - 1)`; "move down" is `index + 1`. There is no drag-and-drop.
- `playableEntries` needs `isPlayableOnWeb` from `lib/domain/track` and keeps `TrackSummary` non-null. A local-origin track is a real playlist member that this browser cannot play; it is never silently deleted.

### 4.1 Why up/down and not drag

Drag is a pointer-only interaction with a long tail of edge cases in RTL (drop targets, autoscroll, touch). Mobile itself uses move-up/move-down row actions. Two buttons are keyboard-operable, announce their target, and cannot drop an item "between" rows. Use `Icon name="up"` / `Icon name="down"` (vertical chevrons; they mean position, not reading direction).

---

## 5. Mutations

All in `src/app/actions/playlists/`, all `"use server"`, all returning `ActResult`.

### 5.1 Create

```ts
export async function createPlaylist(input: {
  title: string;
}): Promise<ActResult<Playlist | null>>;
```

- trim; reject an empty title **before** the call with `fail("validation", "نام فهرست را بنویسید.")`; cap at 120 characters (`maxLength` in the field too);
- `callAct("playlist", "createPlaylist", { set: { title }, get: PLAYLIST_GET })`;
- parse and return, or `null` if the response is not a playlist (never invent a row);
- `revalidatePath("/playlists")`.

Identity is `_id`. Two playlists may share a title; never dedupe by name.

### 5.2 Update

```ts
export type PlaylistPatch = {
  title?: string;
  items?: readonly PlaylistItem[];
};

export async function updatePlaylist(
  playlistId: string,
  patch: PlaylistPatch,
): Promise<ActResult<Playlist | null>>;
```

- validate the id; a bad id is `ok(null)` (the caller's page is already 404);
- title, when present: trim, reject empty/over 120;
- items, when present: validate every `trackId`, dedupe keeping the first occurrence, then `normalizeItems`. Sending the final order is the contract; do not sort here (the caller already did);
- send only the defined fields. Omit `description` and `isPublic` entirely so an update preserves them;
- parse the returned document (the act returns the updated row for `get`);
- `revalidatePath("/playlists")` and `revalidatePath(`/playlists/${playlistId}`)`.

A whitespace-only title never reaches the backend. A title that becomes empty is not a rename; it is a validation failure.

### 5.3 Delete

```ts
export async function deletePlaylist(playlistId: string): Promise<ActResult<boolean>>;
```

- invalid id → `ok(true)`; nothing to delete;
- `callAct("playlist", "deletePlaylist", { set: { playlistId }, get: { success: 1 } })`;
- `revalidatePath("/playlists")`;
- the detail page must not `notFound()` after the action returns — it navigates to `/playlists` with `router.replace` (see 7.4). History rows that reference the playlist keep their captured title.

### 5.4 Failure handling in the client

The pattern is the login form's, not a bespoke one:

```tsx
const [pending, startTransition] = useTransition();
const [error, setError] = useState<string | null>(null);

function run(write: () => Promise<ActResult<unknown>>) {
  setError(null);
  startTransition(async () => {
    const result = await write();
    if (!result.success) {
      setError(failureMessage(result.error));
      return;
    }
    router.refresh();
  });
}
```

- `failureMessage` is the only place a failure becomes a Persian sentence. Do not print backend `detail`.
- `useTransition` disables every mutating control while a write is in flight (move, remove, add, rename save, delete). Two concurrent whole-array writes are the one way to corrupt order from the UI, so do not allow them.
- No `useOptimistic`: see "what this task must not do".
- The banner is `role="alert"` with `Icon name="error"`, `bg-danger-soft text-danger`, exactly as the login form draws it.
- On success, close/clear the relevant local UI state (rename form, picker selection) **after** the transition settles; leave `router.refresh()` to re-render the server props.

`router.refresh()` is called after the action, inside the transition; it is what makes the freshly written order visible without a full reload. `revalidatePath` in the action covers navigations from other screens.

### 5.5 Concurrency, stated rather than solved

The backend is last-write-wins. The page writes the array it last read. If the same playlist is edited in two tabs, the later write wins and the other tab sees the result after the next refresh. The UI's contract is: controls disabled during a write, and every successful write followed by a fresh read. Do not add a client-side version field or a `baseUpdatedAt` check — there is nothing in the act to compare it against without an extra read, and PLAN Phase 3.3 does not ask for conflict resolution. Put one short comment where the editor computes a write, so the next implementer does not read this as an oversight.

---

## 6. Pages and components

### 6.1 `/playlists` — `src/app/(shell)/playlists/page.tsx`

Server component, `export const metadata = { title: "فهرست‌ها" }`.

- `searchParams` is a `Promise` in Next 16. Read `page` with `pageParam`; every other parameter is ignored (there is no sort control).
- one read: `getMyPlaylists({ page, limit: PLAYLIST_PAGE_SIZE })`;
- header: `PageHeader` (overline «مجموعه‌های شما», title «فهرست‌ها», description «ترکیب دلخواهی از ترک‌ها، با ترتیب قابل تغییر.»);
- `PlaylistCreateForm` sits above the list, always visible — including in the empty state. A create form that disappears when there are zero playlists makes the empty state a dead end;

```tsx
// client component
<TextField label="فهرست تازه" placeholder="نام فهرست" maxLength={120} ... />
<Button variant="primary" disabled={pending || title.trim().length === 0}>ساخت</Button>
```

Submitting with Enter submits the form (a real `<form onSubmit>`), not just the button. On success: clear the field, keep focus in it, `router.refresh()`.

- list: a `Card` per playlist, each card a link to `/playlists/${id}`. The whole card is not one `<a>` around interactive content — there is none inside the card, so the title link and the `Link` wrapper can both exist; prefer one `<Link>` wrapping the card with `className="block"` for the hit area, and an explicit link affordance («باز کردن») as the visible action.
- card content, in the three-tier order: title (`type-heading`), description (`type-caption text-text-tertiary`, one line, clamped), meta row (`type-numeric`): `{fa(count)} ترک` · `آخرین تغییر {formatRelativeTime(updatedAt, now)}`. `count` is `playlist.items.length` — exact, because the act returned the array. Empty description adds nothing; never print a placeholder dash.
- pagination: `Pagination` with `page`, `hasMore`, and `buildHref` that preserves no other params (`?page=` only). Page 1 omits the parameter.
- states:
  - loading: the route's `app/(shell)/loading.tsx` is the default; additionally, if the page wraps the read in `Suspense`, the fallback is `TableSkeleton rows={5}` inside a `Card`. Do not render a blank page while the read is pending;
  - failure: `<Card><ErrorState failure={result.error} retryHref={page > 1 ? `/playlists?page=${page}` : "/playlists"} /></Card>`;
  - empty (but successful): `EmptyState` (icon `playlist`) inside the same `Card`, title «هنوز فهرستی نساخته‌اید», description «ترک‌ها را در یک فهرست جمع کنید تا پشت‌سرهم بشنوید.» — no `action`, because the create form is directly above and a second "create" control would jump the listener past it. The form is the action.
- no per-card actions. Delete and rename live on the detail page, where the contents are visible (see 7.4).

### 6.2 `/playlists/[id]` — `src/app/(shell)/playlists/[id]/page.tsx`

Server component:

```tsx
export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getMyPlaylistDetail(id);
  if (!result.success) { /* ErrorState inside the page, with retryHref */ }
  if (result.body === null) notFound();
  const { playlist, entries, library } = result.body;
  ...
}
```

- `notFound()` for both a malformed id and a missing one; the page then uses the app's `not-found.tsx`. Do not build a second 404 design.
- no `generateMetadata` that re-reads the playlist; use a static title «فهرست». (A second read for the tab title is not worth a round trip.)
- pass `playlist`, `entries`, `library`, and a server-computed `now` (from `lib/now`) to **`PlaylistEditor`**, a client component. All interactivity lives there so the header's "add" toggle can open the picker lower on the page.

#### The editor's anatomy

```
<header>
  overline «فهرست»
  title  playlist.title            ← replaced by rename form when active
  meta   {count} ترک · {duration of playable} · {k} فقط در گوشی   (drop empty parts)
  actions: [پخش] [تغییر نام] [افزودن ترک]
</header>
<Card>  ordered rows  </Card>       ← empty → EmptyState «این فهرست خالی است»
<Card>  picker (only when the add toggle is on) </Card>
<Card>  danger zone: two-step delete </Card>
```

- The count is the **number of entries**, including unavailable and local ones. Duration is the sum of `playableEntries` durations (`formatSpan`), and is omitted when 0. `k` is the number of entries that are not playable in this browser; the clause appears only when `k > 0`, in `text-text-tertiary`. An empty playlist's meta is just «۰ ترک».
- **Do not number rows by `order`.** The value is an invariant, not a display. Rows show position by their sequence, and the index used by move/remove is the **entry index** in `orderedItems`.
- `پخش` is the only filled (`variant="primary"`) action. It is disabled when `playableEntries.length === 0`, with the caption «هیچ ترک این فهرست در وب پخش نمی‌شود.» below the header (see 8).
- Rename and add are `variant="secondary"`.

#### Row anatomy

A dense sequence inside **one** `Card` (`ListGroup`-equivalent on web: rows with `border-b border-outline-variant last:border-b-0`, hairline inset to the text). Each row:

- leading: a small square artwork thumb when `track.artworkUrl` exists, otherwise a `rounded-[var(--radius-md)] bg-surface-sunken` tile with `Icon name="playlist"`; the thumb is `size-10`/`size-12`, `object-cover`;
- copy: title (`type-body-strong`, truncate), then a meta line: artist/collection (`type-caption text-text-tertiary`) · duration (`formatClockFa`, `type-numeric`). For a `track: null` entry: title «این ترک دیگر در کتابخانه نیست» in `text-text-tertiary`, no duration;
- status for a local-origin track: a `Badge` «فقط در برنامهٔ اندروید» (secondary tone). This is a fact about where the bytes are, not an error;
- actions, end-aligned: up, down, remove.

Action rules:

- up is disabled at index 0, down at the last index; `aria-label` includes the track title: `بالا بردن «${title}»`, `پایین بردن «${title}»`;
- remove is labelled `برداشتن «${title}» از فهرست` — it removes the membership, it does not delete the track. Icon `delete` is acceptable for the glyph only if the label carries the distinction; a text button «برداشتن» is clearer and preferred for the single row action;
- while `pending`, all three are disabled (`aria-disabled` plus a real `disabled` attribute on the `<button>`s);
- after a successful move, focus stays on the button that was pressed (the row moved, the control is the same control). After a remove, move focus to the «افزودن ترک» button if the row was last, otherwise to the remove button of the row that took its place. Do this with a ref + `useEffect` keyed on the pending→settled transition, or by focusing synchronously after the action resolves; do not leave focus on a removed node (browser falls back to `<body>`, and a screen reader restarts at the top);
- after a successful add, announce `{n} ترک افزوده شد` in a `role="status"` line under the picker.

Unavailable entries are removable and movable like any other. They are not selectable for playback.

#### Rename

In-place, not a modal: pressing «تغییر نام» replaces the header title with a `TextField` (label «نام فهرست», `maxLength={120}`, `autoFocus`) and two buttons, «ذخیره» (`primary`, disabled when trimmed-empty or pending) and «لغو» (`ghost`). Enter submits, Escape cancels, blur does **not** save (a stray click would commit a half-typed name). On success the field closes and the new title is the server-rendered one.

#### Add-track picker

A server-fetched library (`library`) handed to a client `PlaylistTrackPicker`. No modal, no new route, no floating surface:

- opened by «افزودن ترک»; pressing it again closes it and clears the selection;
- candidates = `library` minus ids already in `playlist.items`; recompute from props on every render (never cache membership in state), so a successful add removes those rows without an effect;
- a local `TextField` (label «جست‌وجو در کتابخانه») filters client-side using the **existing** folding helpers: build `createSearchIndex(candidates, trackSearchFields)` in a `useMemo` keyed on `candidates`, and hits with `searchIndex(index, foldQuery(query))`. Never write an `includes()` over raw text. No debounce: the index is in memory, and the fold happens once per data change, not per keystroke;
- each candidate row is a checkbox + title + meta (artist, duration, and «فقط در برنامهٔ اندروید» for local origin). Local rows are addable: a playlist is a cross-device list, and the phone can play them. They just cannot be streamed here;
- selection is a `Set<string>` in state; the footer button reads `افزودن {n} ترک` and is disabled when `n === 0` or pending;
- add calls `updatePlaylist(id, { items: appendTracks(playlist.items, [...selection]) })` — **one** write for the whole batch;
- on success: clear the selection, keep the picker open (a listener adding a folder is rarely done after one row), `router.refresh()`;
- the candidate list is inside `max-h-[24rem] overflow-y-auto` with a visible scrollbar; 500 rows in a card is acceptable for a personal library, and the search is what makes it usable. If the list is empty after filtering, show a single caption «ترکی با این نام پیدا نشد.»;
- when every library track is already in the playlist, the picker says «همهٔ ترک‌های کتابخانه در این فهرست هستند.» and renders no search field.

Length is not capped artificially; the picker shows what the index returned. If the library exceeds `PLAYLIST_LIBRARY_MAX_PAGES`, the index is what it is — do not claim completeness in copy.

#### Delete

A "danger zone" `Card` at the bottom: title «حذف فهرست», one caption «فهرست حذف می‌شود؛ ترک‌ها، تاریخچه و یادداشت‌ها در کتابخانه می‌مانند.», then a `variant="danger"` button «حذف فهرست».

Two-step, inline:

1. first press swaps the button row for an `role="alertdialog"`-styled block (a bordered `Card`-internal panel with `bg-danger-soft`) asking ««{title}» حذف شود؟» and two buttons: «حذف قطعی» (`danger`, pending-aware) and «لغو» (`ghost`);
2. «لغو» restores the first state and returns focus to the delete button; a 6-second timer also restores it, so a pressed-accidentally state does not linger;
3. «حذف قطعی» calls `deletePlaylist(id)`; on success `router.replace("/playlists")` then `router.refresh()`; on failure show the standard `role="alert"` banner and stay on the page.

No `window.confirm`, no modal, no undo toast. The copy names what survives, because that is the only thing a listener can be wrong about.

### 6.3 Components and files

```
src/lib/domain/playlist.ts                        types, PLAYLIST_GET, parse
src/lib/playlists.ts                              pure operations
src/lib/__tests__/playlists.test.ts               ops + parsing
src/app/actions/playlists/get-my-playlists.ts     list read
src/app/actions/playlists/get-my-playlist.ts      detail read (+ getLibraryIndex)
src/app/actions/playlists/create-playlist.ts
src/app/actions/playlists/update-playlist.ts
src/app/actions/playlists/delete-playlist.ts
src/app/(shell)/playlists/page.tsx                replace PlannedSurface
src/app/(shell)/playlists/[id]/page.tsx           new route
src/components/domain/playlist-create-form.tsx    client
src/components/domain/playlist-card.tsx           server/presentational
src/components/domain/playlist-editor.tsx         client; header + rows + picker + delete
src/components/domain/playlist-track-picker.tsx   client, used by the editor
src/components/domain/playlist-play-button.tsx    client, used by the editor
```

Keep `playlist-editor.tsx` the only stateful orchestrator; the picker and play button take callbacks/props. Do not put a `useState` copy of `items` in the editor: derive `ordered = orderedItems(playlist)` from props every render, and pass the results of write actions back through `router.refresh()`.

---

## 7. Playback

### 7.1 The queue is built from what is playable, in playlist order

`PlaylistPlayButton` receives `tracks: TrackSummary[]` — already filtered and ordered by the server page with:

```ts
const playable = playableEntries(entries).map((entry) => entry.track!);
```

`!` is safe because `playableEntries` guarantees non-null; prefer a type predicate to keep the non-null assertion out of the code:

```ts
export type PlayableEntry = PlaylistEntry & { track: TrackSummary };
export function playableEntries(entries: readonly PlaylistEntry[]): PlayableEntry[];
```

On click:

```ts
const queue = tracks.map(playerTrackFromTrack);
const context: PlaybackContext = { type: "playlist", key: playlist.id, title: playlist.title };

// Same-browser resume: an open run for this playlist tells us where it stopped.
const open = playerStorage().getOpenRun();
let index = 0;
let startPositionSec = 0;
if (open && sameContext({ type: open.contextType, key: open.contextKey }, context) && open.endedAt === null) {
  const found = queue.findIndex((track) => track.contentHash === open.lastTrackId);
  if (found >= 0) {
    index = found;
    startPositionSec = open.lastPositionSec;
  }
}

await playQueueAt(queue, index, { context, startPositionSec });
```

- Map with `playerTrackFromTrack` **on the client**, not on the server: it is what applies `isLiveSource`, and the live registry is populated by `OnlineStreamBridge` in the browser (`02-discover.md`). A queue built on the server would mark a live station as seekable.
- `contentHash` comes from the server row verbatim; never recompute it from a URL or a title.
- The context key is the playlist's server `_id`. This is what ties sessions and runs to the playlist, and what makes the mini-player able to name it.
- `trackCount` is `queue.length`. A playlist with three local tracks and five online ones runs as five — a run counts what this device could play, and including unplayable rows would make a run that can never complete. State this in a comment where the queue is built, and surface the difference in the header meta (6.2).
- The button is disabled when `queue.length === 0`; label «پخش» with `Icon name="play"`.
- Starting playback from the middle of the list is not a feature of this phase: the row's title is a link to `/library/[trackId]`? **No** — a row in a playlist is not a track page entry point in mobile. Keep rows non-navigating; the play button starts at index 0 (or the open run's position).

### 7.2 What the listener should observe

- `PlayerBar` shows the track and the playlist context; `PlayerScreen` header shows «پلی‌لیست» and the playlist title (existing `describeContextType`).
- The queue sheet lists exactly the playable entries, in playlist order.
- Finishing a track advances to the next playlist item; the run finalizes as `completed` only when every queued item finished.
- Track Detail and History show sessions with `contextType: "playlist"`; `03-history.md` already renders the context label.
- Playing the same playlist again in the same browser picks up at the open run's track/position. Cross-device resume is not part of this phase (see 10).

### 7.3 No extra action

The detail page already holds the resolved tracks, so playback needs no `play-playlist` server action and no client-side `getTrackDetail`. Do not add one "for the list card": the list card does not play.

---

## 8. Copy

Persian, sentence case, no exclamation marks. Counts use Persian digits (`fa(n)`), durations use `formatSpan` / `formatClockFa`.

| Place | Text |
|---|---|
| page title / H1 | «فهرست‌ها» |
| overline | «مجموعه‌های شما» |
| page description | «ترکیب دلخواهی از ترک‌ها، با ترتیب قابل تغییر.» |
| create label / placeholder / button | «فهرست تازه» / «نام فهرست» / «ساخت» |
| empty list | «هنوز فهرستی نساخته‌اید» — «ترک‌ها را در یک فهرست جمع کنید تا پشت‌سرهم بشنوید.» |
| card meta | «{n} ترک · آخرین تغییر {relative}» |
| detail overline | «فهرست» |
| actions | «پخش» · «تغییر نام» · «افزودن ترک» |
| meta extra | «{k} فقط در گوشی» |
| empty playlist | «این فهرست خالی است» — «از «افزودن ترک» شروع کنید.» |
| row remove | «برداشتن» / aria «برداشتن «{title}» از فهرست» |
| row missing | «این ترک دیگر در کتابخانه نیست» |
| local badge | «فقط در برنامهٔ اندروید» |
| picker title | «افزودن ترک» |
| picker search | «جست‌وجو در کتابخانه» |
| picker empty | «ترکی با این نام پیدا نشد.» |
| picker all-present | «همهٔ ترک‌های کتابخانه در این فهرست هستند.» |
| picker submit | «افزودن {n} ترک» |
| picker success | «{n} ترک افزوده شد» |
| rename labels | «نام فهرست» / «ذخیره» / «لغو» |
| play disabled | «هیچ ترک این فهرست در وب پخش نمی‌شود.» |
| danger title / copy | «حذف فهرست» / «فهرست حذف می‌شود؛ ترک‌ها، تاریخچه و یادداشت‌ها در کتابخانه می‌مانند.» |
| confirm question | ««{title}» حذف شود؟» |
| confirm buttons | «حذف قطعی» / «لغو» |
| not found | the app's `not-found.tsx` |
| create/rename validation | «نام فهرست را بنویسید.» |
| locate failure | «این فهرست پیدا نشد.» |

Do not translate backend messages or print `error.detail`.

---

## 9. RTL, layout, a11y

- The app is `dir="rtl"`. Use logical spacing (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start/end`), never left/right literals. Action clusters sit at the **end** edge; leading artwork at the **start**.
- A row's action buttons stay in a fixed order regardless of title length: up, down, remove. Do not reflow them under the title; truncate the copy instead (`min-w-0`, `truncate`).
- Tap/click targets: minimum 40×40 for icon buttons (`size-10` with `size="icon"`), 44 where the row is tall. Disabled buttons keep their space.
- Every icon-only control has an `aria-label` with the track or playlist name. Checkboxes in the picker have a real `<label>`/`htmlFor`; the whole row is not one giant label with nested controls.
- `aria-disabled` alone does not stop activation; use the native `disabled` attribute.
- Tab order: header actions → rows (up/down/remove per row) → picker → danger zone. No `tabIndex` overrides.
- Focus rings: rely on the existing `focus-visible:ring-2 ring-[var(--accent)]`; do not remove outlines.
- Reduced motion: no custom animation here. Do not add entrance animations per row; the list is dense content and the web shell already owns page motion.
- RTL numeric islands: a playlist title in Persian is fine; durations and times rendered by `formatClockFa` already carry Persian digits. Do not set `dir="ltr"` on a whole row.
- Empty, loading, error, and pending are distinct: `Skeleton`/`TableSkeleton` while loading, `EmptyState` when empty, `ErrorState` on a read failure, an inline `role="alert"` on a write failure, and disabled controls while pending. A blank card is a bug.

---

## 10. Tests

Vitest. New **`src/lib/__tests__/playlists.test.ts`** covering the pure layer and the parser. No component render tests — the repo has none for domain screens, and the high-value logic is here.

Domain/parsing:

1. `parsePlaylist` rejects a row without `_id` or `title`; trims a blank description to `null`; defaults `isPublic` to false.
2. Items with a non-ObjectId `trackId` are dropped; items with a missing `order` fall back to their array index; duplicate ids collapse keeping the first.
3. Timestamps parse from a Date and from an ISO string to the same ms; a missing `createdAt` falls back to `updatedAt`.
4. `orderedItems` returns order 2 before order 5 even when the array is reversed; equal `order` values keep array order (stable).

Operations:

5. `normalizeItems` rewrites gaps (`[0, 3, 7]` → `[0, 1, 2]`) and does not mutate its input.
6. `appendTracks` skips an id already present, collapses repeats in one batch, appends in the given order, and returns a normalized list.
7. `appendTracks(items, [])` returns `normalizeItems(items)`.
8. `removeTrack` removes and renumbers; removing an absent id is a no-op copy.
9. `moveItem` moves up and down, clamps at both edges, and treats `from === to` and out-of-range indices as no-ops.
10. `playableEntries` drops `track: null`, drops `origin: "local"`, and preserves the input order of the survivors.

Add the parser cases to the new file (import `parsePlaylist` from `lib/domain/playlist`) rather than bloating `domain.test.ts`; both are fine, one file is easier to read.

Run:

```bash
npx vitest run src/lib/__tests__/playlists.test.ts
```

Then the full gate (the brief is not done until these pass, not "should pass"):

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run check:declarations` must stay green and untouched — this phase adds no wire shape.

---

## 11. Acceptance criteria

- `/playlists` no longer shows `PlannedSurface`; it lists the listener's playlists sorted as the act returns them, with exact item counts and a relative "last changed" line.
- Creating with a blank or whitespace title is impossible in the UI and rejected before any network call; creating a valid title adds a card and an empty detail page, and survives a reload.
- Two playlists may share a title; both are listed and independently addressable.
- Pagination appears only when there is another page; `?page=2` renders the second page on first paint and works with the back button.
- A malformed or foreign id at `/playlists/[id]` renders the app's 404, not an error card and not an empty playlist.
- The detail page shows every stored item in `order` sequence, including tracks that no longer exist (as removable unavailable rows) and local tracks (with the «فقط در برنامهٔ اندروید» badge).
- Add appends the selected ids in one `updatePlaylist` call, skips duplicates, excludes already-present candidates from the picker, and keeps the picker open with the selection cleared.
- Move up/down is disabled at the edges, persists across reload, and does not fire twice on a double click (controls disabled while pending).
- Remove takes the track out of the playlist only; the same track is still in `/library`, with its history and annotations intact.
- Rename trims, rejects empty, persists, and closes the form; Escape cancels without writing.
- Delete requires two presses, names what survives, removes the card from the list, and returns to `/playlists`; the deleted playlist's id 404s afterwards.
- Play starts the playable items in playlist order, with `PlaybackContext = {type: "playlist", key: id, title}`, and a queue whose length equals the playable count; local/missing entries never enter the queue. A playlist with no playable items has a disabled play button and the explanatory caption.
- Replaying the same playlist in the same browser resumes the open run's track and position; a new browser starts at the first playable item.
- Every read failure renders `ErrorState` with a retry link; every write failure renders the inline `role="alert"` banner and leaves the rendered list unchanged. Neither prints a backend `detail`, and neither is a blocking modal.
- Backend down: the list and detail still render their error states with the shell (sidebar/player bar) intact; nothing crashes, nothing hangs on a spinner forever.
- Keyboard-only: create, open a card, rename, add via the picker (search, check, submit), move, remove, delete-confirm, and play are all reachable and operable; focus never lands on `<body>` after a row disappears.
- No `window.confirm`, no `alert`, no `useOptimistic`, no `any`, no direct `fetch`, no second copy of `items` in a store.

---

## 12. Manual verification

1. `npm run dev`, sign in, go to `/playlists`.
2. Create «صبح‌ها» with the form's Enter key; confirm it appears with «۰ ترک» and the correct relative time.
3. Create «صبح‌ها» again; confirm two distinct cards (identity is `_id`, not title).
4. Open the first; confirm the empty state, then add three tracks — one of them a local-origin track if the account has one. Confirm one network write (the UI disables once), the count becomes ۳, and the local row carries the badge.
5. Move the middle row up and down; reload; confirm the order survived and the list card moved to the top (updatedAt changed).
6. Remove a row; reload; confirm the playlist has one fewer item and `/library` still lists the track, with its last-played unchanged.
7. Press play: confirm the player bar names the playlist, the queue sheet has only the playable tracks, and the local track is absent. Let one track finish; confirm the next starts and the context label appears in `/history` after sync.
8. Navigate away and back; press play again; confirm it resumes at the open run's position.
9. Rename to «صبح‌های آرام», press Escape on a second attempt (no write), then save a real change; reload; confirm the header and the card agree.
10. Rename to whitespace: the save button stays disabled; no request.
11. Delete: first press shows the danger panel; «لغو» restores and focuses the delete button; wait six seconds on a second attempt and confirm it restores on its own; then «حذف قطعی» and confirm the redirect, the card's disappearance, and the 404 on the old URL.
12. Type `/playlists/not-an-id` and `/playlists/0123456789abcdef01234567`; both hit the 404 page.
13. Stop the backend (`docker compose -f docker-compose.dev.yml stop back` or equivalent on the dev setup), reload `/playlists` and a detail page: both show `ErrorState` with a retry, inside the shell. Restart it and retry.
14. Tab through the whole detail page; confirm every control is reachable, labels are announced with the track name, and focus is visible.
15. Resize to a 360-px viewport; confirm rows truncate instead of overflowing, the action cluster stays at the inline-end edge, and the picker scrolls internally.
16. Run the full command gate from section 10.

---

## 13. Out of scope (state this in the PR/commit body)

- **No public/shared playlists.** `isPublic` is preserved but never offered.
- **No description editing.** It renders if present.
- **No playback from a list card.** Playing requires the resolved, ordered, playable queue that only the detail read builds; a card-level play would force a library scan per card.
- **No drag-and-drop.** Up/down only.
- **No multi-select or batch add on the playlist detail** (batch add is inside the picker for one write); no "add to another playlist" flow from a playlist.
- **No cross-device resume for a playlist.** Same-browser resume comes from the open run; account-wide continue is the `/browse` Continue section (`02-discover.md`) and history (`03-history.md`).
- **No playlist statistics panel.** Runs are queryable with `getMyPlaybackContexts`, but a per-playlist stats card would add a second read to every detail view for a number no screen requires yet.
- **No reorder animation, no undo toast, no optimistic UI.**
- **No offline write queue.** The web client is online-only; the mobile outbox stays mobile's.
