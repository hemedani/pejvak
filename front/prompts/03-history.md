# 03 — History: every listen, grouped and paged without splitting a stretch

> Task brief for an implementation agent working in `/Users/syd/work/Pejvak/front`.
>
> Read `front/AGENTS.md` and `front/docs/PLAN.md` first. This is **Phase 3.2 —
> History**. Where this file and the plan disagree, the plan wins; where the plan
> is silent, this file is the decision. `mobile/` and `back/` are read-only
> references for this task.

## Mission

Replace the `/history` placeholder with a day-grouped list of what the listener
actually heard. A *session* is one continuous play of one track; a *stretch* is
several sessions heard without a deliberate track change. The screen lists
stretches, because "chapter 4 → chapter 7, 38 minutes" is the thing the listener
remembers, and a list of eight rows for one commute reads as eight listens.

The page must page through history **without ever cutting a stretch in half and
then judging it from the prefix**. That is the hard part, and it is the reason
this brief exists.

History is **read-only on the web**. There is no delete-session act, no soft
delete, and no local session table. Do not add a delete control that cannot
work; do not hide it behind a tooltip. The phone owns removal.

## What this task must not do

- **Do not touch `mobile/` or `back/`.** No new act, no schema change.
- **Do not add a second HTTP path.** Every read goes through a Server Action
  using `callAct`.
- **Do not re-implement session maths.** `durationListenedSec`, `completed`,
  `interrupted` and `seeked` are written by the phone. Report them; never
  recompute "did they finish" from positions.
- **Do not split a stretch across pages.** Do not render a verdict for a
  stretch whose members are only partly loaded.
- **Do not add sort controls the backend cannot honour.** The act sorts by
  `startedAt: -1` only. Newest-first is the contract. "Oldest" and "longest"
  are deferred until an act can sort; a control that only reorders the current
  page is a lie about the whole history.
- **Do not add deletion.** There is no backend verb for it.
- **Do not add a second join.** `getMyListeningHistory` can project the `track`
  relation (`selectInp.ts` allows `track: { _id, title, … }`). Use it. The
  mobile app joined against SQLite; the web must not fetch every track and join
  in memory.
- **Do not write English UI copy.** Persian only, RTL only. Code and comments
  stay English.
- **Do not add a chart or a second type ramp.** The dashboard has the activity
  chart; History is a list.

---

## 1. Ground truth

| Thing | What exists |
|---|---|
| Route | `src/app/(shell)/history/page.tsx` is a `PlannedSurface`. |
| Act | `playbackSession.getMyListeningHistory` — `set: { page, limit, skip, from, to }`, sorted `startedAt: -1`, no total. |
| Projection | Fields include `startedAt`, `endedAt`, `startPositionSec`, `endPositionSec`, `durationListenedSec`, `playbackSpeed`, `completed`, `interrupted`, `seeked`, `stretchId`, `contextPlayId`, `contextType`, `contextKey`, and the embedded `track` relation (`_id`, `title`, `durationSec`, `author`, `narrator`, `artworkUrl`, `origin`, `sourceId`, `externalId`, `collectionKey`, `collectionTitle`). |
| Parser | `src/lib/domain/session.ts` has `SessionSummary` and `SessionDetail`. It does **not** parse the `track` relation or `contextPlayId`/`contextKey`; this task adds a history-specific parser beside them. |
| Window | `src/app/actions/sessions/get-sessions-in-window.ts` handles the dashboard chart. It is not the history reader. |
| Track page | `/library/[trackId]` exists and plays an online track via `PlayTrackButton`. |
| Player | `playQueueAt` accepts `startPositionSec`; `resumePositionSec` and `clampResumePosition` live in `src/lib/player/resume.ts`. |
| Mobile model | `mobile/src/lib/listeningStretch.ts` (`buildStretch`, `groupSessionsIntoStretches`, `stretchResumeTarget`) and `mobile/src/lib/history.ts` (`historyCursorFor`, `groupByDay`, `buildStretchSections`, `stretchResumeTarget`, `describeStretchTitle`) are the source. Port the semantics, **not** the local-DB types. |

**A difference the port must absorb:** the mobile `LocalSession` carries
`trackId`; the server session carries `contentHash` and the embedded `track`
relation. Identity for grouping stays `stretchId`; the track link uses the
relation's `_id`, and the stable key for "same track across devices" stays
`contentHash`.

---

## 2. Domain model

Add `src/lib/domain/history.ts`. Keep it pure: parsing is there, no React, no
fetch, no `Date.now()` at module scope.

### 2.1 `HistoryTrack`

```ts
export type HistoryTrack = {
  id: string;            // server _id, for /library/[trackId]
  contentHash: string;
  title: string;
  durationSec: number;
  author: string | null;
  narrator: string | null;
  artworkUrl: string | null;
  origin: "local" | "online" | string;
  sourceId: string | null;
  externalId: string | null;
  collectionKey: string | null;
  collectionTitle: string | null;
};
```

Parse the relation defensively. A relation that arrives without `_id` or
`contentHash` is **not** a reason to drop the session: history happened. Keep
the session with `track: null` and render «ترک حذف‌شده»; the row has no track
link. (The model declares the relation required, but a projection or a future
`hardCascade` can hand us a gap, and a dropped row would silently shorten the
listener's history.)

### 2.2 `HistorySession`

```ts
export type HistorySession = {
  id: string;
  contentHash: string;
  track: HistoryTrack | null;
  startedAt: number;
  endedAt: number | null;
  startPositionSec: number;
  endPositionSec: number;
  durationListenedSec: number;
  playbackSpeed: number;
  completed: boolean;
  interrupted: boolean;
  seeked: boolean;
  stretchId: string;
  contextPlayId: string | null;
  contextType: "online" | "playlist" | string | null;
  contextKey: string | null;
};
```

- `stretchId` may be absent on old rows. Fall back to the session `_id` — a row
  with no group is a stretch of one, exactly as the mobile v10 backfill rules.
- `contentHash` falls back to `track?.contentHash ?? ""`; never invent one.
- `durationListenedSec` is clamped to `>= 0` by `parse` but never "corrected"
  against positions. It is wall-clock played time, not a position delta.

### 2.3 Projections

Add to `src/lib/domain/history.ts`:

```ts
export const HISTORY_SESSION_GET = {
  _id: 1,
  contentHash: 1,
  startedAt: 1,
  endedAt: 1,
  startPositionSec: 1,
  endPositionSec: 1,
  durationListenedSec: 1,
  playbackSpeed: 1,
  completed: 1,
  interrupted: 1,
  seeked: 1,
  stretchId: 1,
  contextPlayId: 1,
  contextType: 1,
  contextKey: 1,
  track: {
    _id: 1,
    contentHash: 1,
    title: 1,
    durationSec: 1,
    author: 1,
    narrator: 1,
    artworkUrl: 1,
    origin: 1,
    sourceId: 1,
    externalId: 1,
    collectionKey: 1,
    collectionTitle: 1,
  },
} as const;
```

Do not add `deviceInfo`, `user`, `sessions`, or `annotations`; the list has no
use for them, and a nested relation would multiply the payload.

`parseHistorySession(raw)` returns `HistorySession | null`, using the existing
`asRecord`/`asString`/`asInt`/`asTimestamp` helpers. `parseHistoryList` filters
nulls and **preserves order**.

---

## 3. Stretches

Port `mobile/src/lib/listeningStretch.ts` into `src/lib/history.ts` with the
new row type. Keep the comments; replace `LocalSession` with `HistorySession`
and `trackId` with `track?.id ?? null`.

```ts
export type ListeningStretch = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  startTrackId: string | null;
  startContentHash: string;
  startPositionSec: number;
  endTrackId: string | null;
  endContentHash: string;
  endPositionSec: number | null;
  trackCount: number;
  listenedSec: number;
  playbackSpeed: number;
  seeked: boolean;
  completed: boolean;
  interrupted: boolean;
  contextPlayId: string | null;
  contextType: string | null;
  contextKey: string | null;
  members: HistorySession[];
  isComplete: boolean;
};
```

The rules, unchanged:

1. **Order members by `startedAt`.** Do not trust the query's order for the
   first/last track; rows can arrive from a pull in a different order.
2. `listenedSec` is the sum of member `durationListenedSec` — not
   `endPositionSec - startPositionSec`.
3. `seeked` is true if **any** member was scrubbed.
4. `completed` is the **last** member's `completed`; `interrupted` is true if
   **any** member was interrupted.
5. `isComplete` is `endedAt !== null && completed && !seeked &&
   first.startPositionSec === 0`. It means "heard from the first second of the
   first track through the end of the last with no gap", which is stricter than
   `completed`.
6. `outcome`: complete → `complete`; no `endedAt` → `open`; completed → `finished`;
   otherwise `interrupted`.
7. **One verdict per stretch**, and only when all its members were read.

Group by `stretchId`, sorted by `startedAt` descending. A single-member group is
still a stretch; the UI renders it as one row.

### 3.1 Resume target

```ts
export function stretchResumeTarget(stretch: ListeningStretch): {
  trackId: string | null;
  contentHash: string;
  positionSec: number;
};
```

- Completed stretch → **start** track and `startPositionSec` (seeking to the end
  would finish it instantly).
- Otherwise → **end** track and `endPositionSec`, falling back to
  `startPositionSec` while the last session is still open.
- Always clamp to `>= 0` and round.
- A live track has no resume; History does not know a track is live from the
  relation alone. The resume button checks before playing (§6.3) and hides the
  action for a live source.

### 3.2 Outcome labels

Do not copy English strings from mobile. A small pure mapper:

| outcome | label | badge tone |
|---|---|---|
| `complete` | «کامل» | `accent` |
| `finished` | «تا پایان ترک» | `neutral` |
| `interrupted` | «قطع‌شده» | `danger` |
| `open` | null (no verdict) | — |

`finished` is not "complete": the last track ran out, but the listen did not
begin at the first second, skipped a stretch, or was scrubbed. Saying «کامل»
there would be a stronger claim than the stored data supports.

### 3.3 Title and meta

- Title: start track title → (if more than one track) end track title, joined
  with a left-right arrow `→` inside a `dir="ltr"` span, because the titles are
  Persian and the arrow is punctuation. If `track` is null on either end, use
  «ترک حذف‌شده».
- Meta line: `HH:mm – HH:mm` (local time), track count only when > 1
  («۳ قطعه»), and `contextTitle` when present.
- Detail line: positions `formatClockFa(start) – formatClockFa(end)` only when
  the listen moved; speed when ≠ 1; «پرش» badge when `seeked`.
- Right side: listened time via `formatSpan` in tabular numerals, and the speed
  under it (or omit the speed when 1×).
- Do not repeat the status as a border, a wash, and a badge. The badge is the
  only verdict.

---

## 4. The history read: cursor, lookahead, complete stretches

### 4.1 Why the obvious paging is wrong

`getMyListeningHistory` returns **sessions**, sorted newest-first, with
`page`/`limit`/`skip`. A page of 50 rows can end in the middle of a stretch. If
the UI groups that page and renders "۲ از ۵ قطعه, interrupted", it has invented a
verdict from a prefix: the other three members are on the next page, and the
last loaded session was not the last one heard.

The fix is to page by **whole stretches**, with a lookahead row proving the
boundary. Do not change the backend.

### 4.2 The action

`src/app/actions/sessions/get-history-page.ts`

```ts
export type HistoryPage = {
  stretches: ListeningStretch[];
  /** Rows consumed so far; the next page starts here. */
  after: number;
  hasMore: boolean;
};

export async function getHistoryPage(input: {
  after?: number;
  from?: number;
  to?: number;
}): Promise<ActResult<HistoryPage>>;
```

Constants live in `src/lib/domain/history-query.ts` (a `"use server"` module
cannot export them):

```ts
export const HISTORY_BATCH_ROWS = 100;
export const HISTORY_MAX_ROWS = 2000;
export const HISTORY_PAGE_ROWS = 100;
```

Algorithm, exactly:

1. `after = Math.max(0, Math.floor(input.after ?? 0))`;
   `from`/`to` are optional integer timestamps, already normalised.
2. Fetch with `callAct("playbackSession", "getMyListeningHistory", {
   set: { skip: offset, limit: HISTORY_BATCH_ROWS + 1, ...(from), ...(to) },
   get: HISTORY_SESSION_GET })`.
   `+1` is the **lookahead**, not a display row.
3. Split the result into `batch` (first `HISTORY_BATCH_ROWS`) and `lookahead`
   (the extra row, or `null`). Append `batch` to `collected`, deduping by
   session `id`.
4. Group `collected` into stretches **without emitting yet**.
5. If `lookahead` is `null`, history ended: emit every group; `hasMore = false`.
6. If `lookahead` exists and its `stretchId` differs from the last collected
   row's `stretchId`, the last group is complete: emit every group;
   `hasMore = true`.
7. If the ids match, the last group continues past the batch. Advance
   `offset += batch.length` and go to step 2. **Do not append the lookahead**;
   it becomes the first row of the next batch because `skip` now points at it.
8. If `collected.length` reaches `HISTORY_MAX_ROWS` while still unresolved,
   **drop the last (incomplete) group**, set `after` to the count of rows in the
   emitted groups, and return `hasMore = true`. The next page starts at the
   dropped group's first row, so nothing is lost and no verdict is invented.
   This is a pathological bound (a single stretch of 2,000 sessions); it is the
   only case where a page can return fewer than one full group's worth.
9. `after = input.after + emittedRowCount` where `emittedRowCount` is the number
   of sessions in the emitted groups (not the collected count), so the lookahead
   and any dropped group's rows are re-read next time.
10. `hasMore = lookahead !== null || (collected.length > emittedRowCount)`.
    A short batch with no lookahead is the end.

Edge cases:

- **A single stretch longer than a batch** is read in multiple batches and
  rendered once. That is the point.
- **Duplicate rows** from an overlapping batch are deduped by `_id`; the
  lookahead is not added twice.
- **New sessions arriving between pages** can shift `skip`. Dedupe hides a
  duplicate but cannot detect a gap. Accept it, exactly as the library's
  offset pagination does; history is append-only and a listener reading page 2
  seconds after page 1 is not racing a sync in practice. Do not invent a keyset
  cursor the act cannot filter (`to` is inclusive on `startedAt`, and seconds
  collide).
- **A page boundary in the middle of a stretch that is also the end of
  history**: `lookahead === null`, so all groups are complete and emitted.
- **A malformed `stretchId`** is impossible from the act, but a missing one was
  normalised to the session id in §2.2.

The action returns stretches, not raw rows: the grouping rule is the trimming
rule, and splitting them across the wire would let a caller render an incomplete
group.

### 4.3 Date range

The act supports `from`/`to` as millisecond timestamps. The URL carries dates:

- `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Parse with `Date.parse(`${value}T00:00:00`)` (local midnight). Invalid or
  absent → `undefined`. `to` is inclusive: use `startOfDay(to) + 86_400_000 - 1`.
- If `from > to`, ignore both and show the unfiltered list, with a caption
  «بازهٔ نامعتبر بود؛ همهٔ تاریخچه نمایش داده می‌شود». Do not throw.
- Changing either date resets `after` to 0. The filter form must not carry the
  old cursor; a page 4 of a different range does not exist.
- A range form is a plain `<form method="get">` with two `<input type="date">`
  and a submit button, so it works without JavaScript. Style it with
  `TextField`/`Button`; do not build a date picker. Native date UI follows the
  browser's locale; the Jalali *display* is not controllable, and inventing a
  Jalali picker is a library-sized task, not a filter control.
- Show the active range as a caption with `formatDate(from)` / `formatDate(to)`
  and a «پاک کردن بازه» link.

### 4.4 One read per page

`getHistoryPage` is the only call. Do not additionally fetch tracks; the
`track` relation is already in the projection. Do not call `getMyStats`; the
header's summary is computed from the loaded stretches and says "in this page".

---

## 5. Day grouping and section building

Put pure helpers in `src/lib/history.ts` beside the stretch model:

```ts
export type HistorySection = {
  key: string;
  /** Persian day label, or null for a flat list. */
  title: string | null;
  data: ListeningStretch[];
  /** Total listened time in the group; enables a day header figure. */
  listenedSec: number;
};

export function buildHistorySections(
  stretches: readonly ListeningStretch[],
  now: number,
): HistorySection[];
```

- Group by the day the stretch **started**. A listen that ran past midnight
  belongs to the evening it began, which is where a listener looks for it.
- Use `startOfDay(startedAt)` from `src/lib/time.ts` as the key. Do not group by
  a formatted string.
- Sort days descending. Within a day, keep the act's newest-first order.
- Day label:
  - same local day as `now` → «امروز»
  - previous day → «دیروز»
  - otherwise `formatDayHeading(startedAt)` plus the Jalali year when it is not
    the current year (`Intl.DateTimeFormat("fa-IR", { year: "numeric" })`). A
    history from three years ago must not print two «۱۴ مهر» headings with no
    way to tell them apart.
- Each section's `listenedSec` is the sum of its stretches, rendered in the
  section header at the end edge. It is a fact about the loaded page; do not
  label it as a lifetime figure.
- The section header is not sticky. A sticky header over a page that can be one
  enormous stretch adds a layer for no gain.

No "oldest" or "longest" builder. The model can be extended later when the act
can sort; until then, a second ordering would be applied only to the fetched
page and would misrepresent every page after the first.

---

## 6. The page and components

### 6.1 `/history`

`src/app/(shell)/history/page.tsx`, async Server Component:

- `metadata = { title: "تاریخ شنیدن" }`.
- `searchParams`: `after`, `from`, `to`.
- `afterParam` helper: `Number.parseInt`, finite and `>= 0`, else 0. Put it in
  `src/lib/search-params.ts` beside `pageParam` (and test it), because a
  hand-typed `?after=abc` must not reach the action as `NaN`.
- `now = clock()` once, passed to section building and formatters.
- `PageHeader` overline «همهٔ نشست‌ها», title «تاریخ شنیدن», description «هر بار
  شنیدن، با زمان، مدت و نتیجه‌اش.», actions: none. No sort control (§Mission).
- A small summary line under the header: `{fa(count)} شنیدن در این صفحه` and
  the page's total listened time. Say **«در این صفحه»** because the act returns
  no total.
- The range form.
- `HistorySections`: one `Card` per day? No — one `Card` per day group is the
  existing convention for a bounded list (settings sections, history days), but
  a day can hold 40 stretches. Use **one `Card` per section**, with
  `CardHeading` as the day header (title + total), and rows inside separated by
  an inset hairline. This follows the web's `Card` rule: a list is a sequence,
  not forty floating cards.
- Each row is a `HistoryRow` (§6.2). Rows are not individually elevated.
- `Pagination` does not fit a cursor (`after` is not a page number). Add
  `CursorPagination` in `src/components/ui/pagination.tsx` (same file, same
  visual language): a «قدیمی‌تر» link carrying `after` and the current range,
  disabled/absent when `!hasMore`. The URL is the state, so Back works.
- **Pagination accumulates?** No. Each `after` renders one page of stretches,
  and the new page replaces the list. A "load more" client pattern would hold
  every page in memory and re-fetch on reload; the URL page is simpler and
  reversible. If the listener wants to go back, the browser's Back returns to
  the previous `after` URL.
- Loading: wrap the section list in `Suspense` with `<HistorySkeleton rows={8} />`
  (row-shaped skeletons; the page header and filter stay visible).
- Error: `ErrorState` with `retryHref` preserving `after` and the range.
- Empty:
  - no history at all → `EmptyState` icon `history`, title «هنوز چیزی نشنیده‌اید»,
    description «با پخش یک ترک از کتابخانه یا کاوش، تاریخچه اینجا ساخته می‌شود.»,
    action «کاوش مجموعه‌ها» → `/browse`.
  - a page past the end (`after > 0` and no rows) → «این صفحه خالی است» with
    «بازگشت به ابتدای تاریخچه» → `/history`.
  - a filtered range with no rows → «در این بازه چیزی شنیده نشده» and «پاک کردن
    بازه».
- A read failure must not blank the range form; render the error inside the
  list area.

### 6.2 `HistoryRow`

`src/components/domain/history-row.tsx` (server component mostly; the resume
control is the only client leaf).

Anatomy, following the three content tiers:

- **Label/title** (`type-label`/`type-body-strong`, `text-text`): the stretch
  title (§3.3), clipped to two lines, with the full title in `title`.
- **Meta** (`type-caption`, `text-text-tertiary`, tabular for numbers):
  time range · track count (only > 1) · collection title.
- **Detail** (`type-caption`, `text-text-tertiary`): position range (only when
  moved) · speed (only ≠ 1×) · «پرش» badge.
- **Trailing**: listened time (`type-numeric`, `textSecondary`) and the verdict
  `Badge`. The trailing block is `ms-auto`, aligned to the end edge.
- **Actions**: a resume button (§6.3) and a chevron link to the start track.
  They are siblings of the title link, never nested inside it.
- The whole row is **not** a single link: it represents several tracks, so a
  single destination would be arbitrary. The title's start-track name links to
  `/library/[id]`; the end-track name links to its own page when different.
- A stretch with `track === null` on both ends renders the fallback title and no
  links; the resume control is hidden.
- A context badge:
  - `contextType === "online"` and `parseCollectionKey(contextKey)` succeeds →
    a link to `/browse/collection/[sourceId]/[externalId]` labelled
    `contextTitle || "مجموعهٔ آنلاین"`.
  - `contextType === "playlist"` → a plain `Badge` for now (playlists are Phase
    3.3; do not link to a route that does not exist).
  - otherwise nothing.
- No per-row glass, no hover-reveal controls. The row is opaque; the resume
  control is always visible.

### 6.3 `ResumeListenButton`

`"use client"` — the only client state on the page.

Props:

```ts
{
  trackId: string | null;
  contentHash: string;
  positionSec: number;
  title: string;
  /** "continue" | "replay" — copy only, both seek to positionSec. */
  kind: "continue" | "replay";
}
```

Behavior:

1. Hidden when `trackId === null`.
2. On click, call `getTrackDetail(trackId)`.
3. If the track is missing or failed → inline Persian notice; no navigation.
4. If `isPlayableOnWeb(track)` is false (local origin) → render a disabled
   state from the start, with a caption «صدا روی گوشی است». Do not call the
   action. A disabled button that explains the fact is better than a button that
   fails after a tap.
5. If it is an online track:
   - `playerTrackFromTrack(track)`;
   - `playQueueAt([playerTrack], 0, { startPositionSec: positionSec })`;
   - no context. A history resume is one track, not a rebuilt collection run.
     Rebuilding a collection from a history row would invent a new run with a
     different `trackCount`, and the collection's current contents may differ
     from what was heard.
6. Label: «ادامه» when `kind === "continue"`, «پخش دوباره» when `replay`.
   Position is shown in the title attribute and accessible name:
   «ادامه از ۱۲:۳۴».
7. While awaiting the action, `aria-busy` and a small spinner; a second click
   does nothing.
8. A live source cannot be resumed: after `getTrackDetail`, if
   `isLiveSource(track.sourceId)`, start at 0 and label «پخش زنده». Prefer
   checking before the click if the row's track has `externalId` plus a source
   known to be live — but the action is still the authority.

`isPlayableOnWeb` lives in `src/lib/domain/track.ts`; use it, do not re-derive
"local".

### 6.4 `HistorySkeleton`

Eight row-shaped skeletons inside one `Card`, with the day header as a short
skeleton. No shimmer loop; the existing `Skeleton` uses `animate-pulse`, which
respects reduced motion through the global stylesheet. Do not add a second
animation.

### 6.5 `HistorySummary`

- Count and listened time for the loaded page only.
- Compute from the emitted stretches, not from raw sessions (a stretch sums its
  members; summing both would double-count).
- Do not say «کل» or «همه».

---

## 7. URL and navigation

```
/history
/history?after=100
/history?from=2026-09-01&to=2026-09-30
/history?from=...&to=...&after=100
```

- Every filter/order/cursor is a link or a GET form; no client router state.
- `buildHistoryHref({ after, from, to })` is a small pure helper in the page (or
  `lib/history.ts`): omit defaults, preserve the range, and drop `after` when the
  range changes.
- Back from page 2 returns to page 1 with the same range.
- The nav item stays `/history`; no nested route.

No `/history/[id]` detail route. A stretch's detail is the track page, reached
by the track links; the row already carries the facts a sheet would show.
Adding a second detail surface would mean a second place to compute the verdict.

---

## 8. Tests

### Domain (`src/lib/__tests__/history.test.ts`)

Port the mobile cases against `HistorySession` fixtures:

- `buildStretch` with members out of order still picks the correct start/end.
- `listenedSec` is the sum of `durationListenedSec`, **not** end minus start.
- `seeked` propagates from any member.
- `completed` comes from the last member, `interrupted` from any.
- `isComplete` is false when the first position is 30s, when `seeked`, and when
  the last member is not completed; true only when all four hold.
- `groupSessionsIntoStretches` groups by `stretchId` and falls back to the
  session id when absent; output is newest-first.
- `stretchResumeTarget`: completed → start track + start position; unfinished →
  end track + end position; open end → start position fallback.
- `buildHistorySections`: day key from `startOfDay`; a listen that crosses
  midnight lands on its start day; «امروز»/«دیروز»; a previous year prints the
  year; sections are descending; `listenedSec` is the sum.
- Title formatting: single track prints once; multi prints `start → end`; a
  missing track prints «ترک حذف‌شده» without a link.
- Verdict mapping never labels a `finished` stretch «کامل».

### Pagination (`src/lib/__tests__/history-page.test.ts`)

Extract the trimming algorithm into a pure function so it can be tested without
React or an act:

```ts
export function assembleHistoryPage(input: {
  batches: HistorySession[][];
  lookahead: HistorySession | null;
  after: number;
}): HistoryPage;
```

Test:

- one batch, no lookahead → all groups, `hasMore: false`;
- lookahead with a different stretch id → all groups, `hasMore: true`;
- lookahead with the same id → the last group is not emitted and `after` points
  at its first row;
- a two-batch stretch is emitted as **one** stretch with every member;
- a duplicate row across batches is deduped;
- the max-rows guard drops only the incomplete tail and leaves the rest whole;
- a page never contains a stretch whose members were not all read.

### Parsing

- `parseHistorySession` drops a row without `_id`/`startedAt`, keeps a row with
  no track, defaults a missing speed to 1, and clamps negative durations.
- `HISTORY_SESSION_GET` includes `track._id`, `track.contentHash` and
  `track.title` (a projection typo is a compile error, but the parser test is
  the safety net).
- `afterParam` returns 0 for `"abc"`, `""`, `"-4"` and `" 12 "` → 12.

### Action

Mock `callAct` and assert:

- `skip` is the cursor, `limit` is `HISTORY_BATCH_ROWS + 1`;
- `from`/`to` are forwarded as integers;
- on a failed act the failure is returned unchanged;
- two pages where the first ends mid-stretch return `after` at that stretch's
  first row, so a follow-up call re-reads it.

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run check   # final gate, includes declarations + build
```

---

## 9. Acceptance criteria

1. `/history` no longer shows `PlannedSurface`.
2. A single-track listen is one row; a five-track continuous listen is **one**
   row titled «اول → آخر» with «۵ قطعه».
3. A stretch of 120 sessions spread across two batches renders once, with the
   correct end track and a verdict derived from all 120 — not from the first 100.
4. The last row of page 1 and the first row of page 2 are never members of the
   same stretch.
5. «قدیمی‌تر» carries `after` and the active range; Back returns to the prior
   page; the range survives pagination.
6. A range selection with no rows shows the range empty state, not "no history".
7. An invalid range shows the unfiltered list and a caption, not a crash.
8. A completed listen that began at 0 shows «کامل»; one that began at 0:30
   shows «تا پایان ترک» or «قطع‌شده», never «کامل».
9. An online track's «ادامه» opens the track and starts at the stored end
   position; a local track's control is disabled with «صدا روی گوشی است».
10. A history row that belongs to an online collection links to that
    collection; a playlist row is a plain badge (no dead link).
11. No delete control exists anywhere on the page.
12. `npm run check` passes; no new `any`, no English copy, no second date
    library, no second type ramp.

---

## 10. Manual verification

When the listener asks for a dev server:

1. Seed/play enough sessions to exceed 100 rows, including one multi-track
   stretch that straddles the 100-row boundary.
2. Open `/history`; confirm that stretch is one row and its end track is the
   real last member.
3. Follow «قدیمی‌تر»; confirm no stretch appears on both pages.
4. Apply a 7-day range; confirm the cursor resets, the summary changes, and
   pagination keeps the range.
5. Press «ادامه» on an online stretch; confirm the player starts at the stored
   position and that only one session is created (the player owns it).
6. Press it on a local stretch; confirm the control is disabled and explains
   why, with no network request.
7. Resize to mobile width; confirm the row stacks without the trailing block
   overlapping the title and the arrow still reads correctly in RTL.
8. Throttle offline; confirm `ErrorState` inside the list while the header,
   filter and nav remain usable, and retry works.

---

## 11. Out of scope

- Deleting sessions or stretches. There is no act.
- Playlist runs as a separate History tab. Phase 3.5 covers runs and the
  dashboard continue card; `getMyPlaybackContexts` has its own surface.
- A per-session detail sheet. The track page is the detail.
- Sorting by oldest/longest. The act cannot sort.
- A Jalali date picker. The range uses native date inputs.
- Export/share. The mobile app exports to a share sheet; the web has no
  equivalent product decision yet.
- Any change to `mobile/`, `back/`, or the vendored declarations.
