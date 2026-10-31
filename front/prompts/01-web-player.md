# 01 — The Pejvak web player

> Task brief for an implementation agent working in `/Users/syd/work/Pejvak/front`.
>
> Read `front/AGENTS.md` and `front/docs/PLAN.md` first. This document is a
> product and implementation contract for **Phase 5 — The player**. Where this
> file and the plan disagree, the plan wins; where the plan is silent, this file
> is the decision. `mobile/` and `back/` are read-only references for this task.

## Mission

Build the browser player that makes the web console feel like Pejvak rather than
a dashboard: one persistent audio element, an honest session log, annotation
markers on the timeline, a queue, speed, a sleep timer, and browser media
controls. It must work for audio streamed from an online source, and it must
state plainly that a track whose bytes live on the listener's phone cannot be
played here.

The player is a **port of mobile semantics with a browser engine underneath**.
Do not invent new session rules, new run rules, or a second definition of
"finished". Port the pure modules from `mobile/src/lib/` and keep their comments.
The browser adds only what the phone never had: autoplay restrictions, CORS,
`MediaSession`, tab throttling, and the absence of a filesystem.

## What this task must not do

- **Do not touch `mobile/` or `back/`.** This is a `front/` task.
- **Do not add a second HTTP path.** Every backend call goes through a Server
  Action using `callAct`; never `fetch(BACKEND_URL)` from a component, never
  React Query or SWR.
- **Do not put `BACKEND_URL` or the JWT in the browser.** The token remains in
  the `httpOnly` `token` cookie.
- **Do not hand-edit `src/types/declarations/selectInp.ts`.** It is vendored and
  checked byte-for-byte by `npm run check:declarations`.
- **Do not add a second audio element.** One module-level `HTMLAudioElement` for
  the whole tab. A React ref or an element per component means two streams, two
  sessions, and a bug that only appears on a fast double click.
- **Do not track position with `setInterval`.** Drive stored position from media
  events; use `requestAnimationFrame` only for visual interpolation while the
  page is visible.
- **Do not auto-play on page load.** Browsers block it and the plan forbids it.
  The first sound is always a click.
- **Do not fabricate sessions, runs, or annotations.** A session exists only
  after audio actually started. A run exists only when a queue has a collection
  context. A local track produces no session because it cannot produce sound.
- **Do not store audio bytes, download state, or signed URLs on the server.**
  The server stores addresses and user state; the source's CDN serves the bytes.
- **Do not show a disabled play button with a tooltip for a local track.** It is
  a state to design, not an error to explain. See §15.
- **Do not add a chart, a second icon family, a second palette, or a new radius
  literal.** Use `src/components/ui/icon.tsx`, `src/styles/tokens.css`, and the
  existing `type-*` classes.
- **Do not write English UI copy.** Persian only, RTL only. Code and comments
  stay English.

---

## 1. Prerequisite: a playable address

A streamed track is not playable until its source adapter has resolved a real
`streamUrl`. `front/` does not yet have the online adapters; Phase 4.1 is the
prerequisite. Port `mobile/src/lib/online/{types,registry,naming,text,series}` and
the six adapters **with their comments and tests** before wiring this player, or
build against a clearly named `resolveStreamUrl` seam that Phase 4 implements.

The player must consume this interface and nothing more:

```ts
export type StreamResolution = {
  streamUrl: string;
  /** Measured or source-reported duration; 0 means "ask the audio element". */
  durationSec: number;
};

export async function resolveStreamUrl(input: {
  sourceId: string;
  externalId: string;
  collectionKey: string;
}): Promise<StreamResolution>;
```

Rules:

- Resolve through `getAdapter(sourceId).getTracks(collectionKey)`, then find the
  item by `externalId`. Never build a source URL by string concatenation.
- The source may sign URLs with an expiry. Treat every URL as short-lived.
- Re-resolve **once** on a playback error or `403`; if the second attempt fails,
  show a clear error with a retry button. Never retry forever.
- Internet Archive URLs are stable redirects; manahej URLs expire. The same
  player code must handle both.
- Do not persist `streamUrl` in local storage. Persist the source id, external
  id, and collection key; resolve again on the next play.
- A live source (`isLiveSource(sourceId)`) has no duration, no seek, and no
  resume. Start it at 0 every time, show "زنده", hide/disable the scrubber, and
  never set `completed` for it.
- If the source cannot be reached, the row says so; do not fall back to a URL
  copied into a fixture or a hard-coded sample.

A local track (`origin === "local"`) has **no URL** and therefore no stream
resolution. This is not a resolver failure; never call the resolver for it.

---

## 2. The shape of a playable track

The queue must not depend on a server `_id`. A streamed item may not exist on the
server yet, and requiring registration before play is exactly the kind of network
gate the product forbids. Queue entries are immutable snapshots keyed by
`contentHash`:

```ts
export type PlayerTrack = {
  contentHash: string;
  title: string;
  artist: string | null;
  albumTitle: string | null;
  artworkUrl: string | null;
  durationSec: number;       // source-reported; 0 = ask the element
  origin: "online" | "local" | string;
  sourceId: string | null;
  externalId: string | null;
  collectionKey: string | null;
  collectionTitle: string | null;
  serverId: string | null;    // known server `_id`, or null
  isLive: boolean;
};

export type PlaybackContext = {
  type: "online" | "playlist";
  /** `sourceId:externalId` for a collection, server `_id` for a playlist. */
  key: string;
  title: string;
};
```

- **Online identity is the source's own id, never the URL:**
  `contentHash = sha256("online:<sourceId>:<externalId>")`.
  Use `crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity))` in
  the browser and memoise it per `sourceId:externalId`. Do not hash the stream
  URL; it rotates.
- For a library row, `contentHash` comes from `getMyTracks` and is already the
  truth. Never recompute or normalise it.
- `context.type` is `"online"` for a streamed collection. Use `"playlist"` only
  when Phase 3.3 exists and a saved playlist is actually the queue source. Do
  not invent a `"folder"` context on the web; there is no folder feature here.
- A queue is ordered `PlayerTrack[]`; `queueIndex` points at the current item.
  Reordering or removing items must keep `queueIndex` pointing at the same
  current track, or move deliberately to the new current track.

---

## 3. One engine, owned by a module

Create `src/lib/player/engine.ts`, a client-only module. It owns exactly one
`HTMLAudioElement` and all of its event subscriptions.

### 3.1 Lifecycle

- Importing the module in a Server Component or during SSR must be safe. Do not
  call `new Audio()` at module scope. Create it lazily on the first client call
  (`ensureAudio()`), or in a `useEffect`-driven boot that calls an idempotent
  `init()`.
- The element is created once and never recreated by a React render. A
  `useEffect` cleanup must **not** destroy it.
- Set `preload = "auto"` and `crossOrigin` **only if** a feature genuinely needs
  CORS. Plain `<audio src>` playback of cross-origin media works without CORS;
  setting `crossOrigin="anonymous"` turns a working stream into a CORS failure.
  Leave it unset.
- Expose a small imperative API:
  `load(track, { streamUrl, startPositionSec })`, `play()`, `pause()`, `seek(sec)`,
  `setRate(rate)`, `setVolume(volume)`, `setMuted(bool)`, `stop()`, and a
  `subscribe(listener)` / `getSnapshot()` pair for state.
- The engine owns `src`, `currentTime`, `playbackRate`, `volume`, `muted`, and
  the event subscriptions. React never writes those directly except through the
  API.
- `play()` returns a promise. Catch `NotAllowedError` (autoplay blocked) and
  surface a "برای شروع، پخش را بزنید" state rather than looping. Catch
  `AbortError` caused by a newer load and ignore it.

### 3.2 Events the engine must handle

`loadedmetadata`, `durationchange`, `timeupdate`, `seeking`, `seeked`, `waiting`,
`canplay`, `playing`, `pause`, `ended`, `error`, `ratechange`, `volumechange`,
`stalled`, and `suspend` if useful.

- Position is updated from `timeupdate` (roughly 4 Hz), never from a timer.
  Internally keep a float; the store exposes floored integer seconds for display.
- `loadedmetadata` is the first moment `duration` is trustworthy. If `duration`
  is `Infinity` or non-finite, it is a live stream: set duration to `0`, hide the
  scrubber, and never write a finite duration.
- Apply an initial `startPositionSec` in `loadedmetadata` (before `playing`).
  Clamp to `[0, duration]` when duration is finite. If setting `currentTime`
  throws, retry once on `canplay`, never in a tight loop.
- Suppress seek reporting during the initial load. `seeking`/`seeked` before the
  first `playing` is a load position, not a listener scrub.
- On `ended`, do not let a second `ended` event advance twice; guard with a
  module-level `advancing` flag, exactly as mobile does.
- On `error`, read `audio.error?.code` only for diagnostics. The UI gets a
  stable player error state, not a raw browser message.

### 3.3 Waiting is its own state

Port `mobile/src/lib/playbackPhase.ts` including `WAIT_REVEAL_MS = 400`,
`WAIT_LONG_MS = 6000`, `PlaybackWait { kind: "connecting" | "buffering"; since;
stream }`, and `resolvePlaybackPhase({ status, waiting, error })`.

The browser differs from ExoPlayer: the `playing` event means audio is actually
moving, so `playing` is more trustworthy. But `play()` may still be pending, a
stream may stall after it started, and a paused element may keep buffering. So
the store still carries `waiting` separately:

- Before the first audible frame: `connecting`.
- After a session exists and playback stalls: `buffering`.
- `armWait` is called **before** `play()`; `playing`/`canplay` clears it.
- A paused player keeps buffering; do not re-arm a wait the listener dismissed.
- A wait under 400 ms draws nothing. After 6 s it gets a second sentence.
- The play button swaps its glyph for a spinner and keeps its press. Its
  accessible name becomes "توقف انتظار". The timeline sweeps an indeterminate
  band; it does not draw a playhead at 0.

Persian copy (use these, not English):

| State | Early | After 6 s |
|---|---|---|
| connecting, stream | در حال اتصال به منبع… | هنوز وصل نشده… / منبع پاسخ نداده است. می‌توانید متوقف کنید و دوباره تلاش کنید. |
| connecting, file | در حال آماده‌سازی صدا… | آماده‌سازی طول کشیده… / باز کردن این فایل بیشتر از حد معمول طول می‌کشد. |
| buffering | در حال بارگذاری… | هنوز در حال بارگذاری… / پخش تا رسیدن بخش بعدی متوقف است. |

---

## 4. Session tracking: the product

Create `src/lib/player/sessionTracking.ts` by porting
`mobile/src/lib/sessionTracking.ts`. The mobile rule is the contract:

- `SEEK_THRESHOLD_SEC = 5`, `CHECKPOINT_INTERVAL_MS = 10_000`.
- `durationListenedSec` is **wall-clock listening**, never
  `endPositionSec - startPositionSec`.
- On each progress sample: `delta = position - lastPosition`.
  - `0 < delta < 5`: add `delta`.
  - `delta > 5` or `delta < 0`: seek; add nothing.
  - `delta === 5`: neither add nor seek.
- A seek moves the position without adding.
- A checkpoint is due every 10 s of wall-clock time.
- Integer seconds at the boundary. The tracker may accumulate fractional
  seconds internally, but **every persisted value and every wire value is
  rounded to an integer**.

### 4.1 The browser extension to the delta rule

The mobile rule assumes a status callback roughly once a second. A browser tab
can be backgrounded: `timeupdate` may arrive less often, and a track that played
for 10 seconds can produce a delta of 10 with no seek. Treating that as a seek
would silently lose listening time.

Extend the pure tracker with the wall-clock gap and a seek flag, without changing
the rule for normal samples:

```ts
type ProgressSample = {
  positionSec: number;   // currentTime, may be fractional
  atMs: number;          // Date.now()
  playbackSpeed: number;
  seeked: boolean;       // a seeking/seeked event since the previous sample
};

const elapsedSec = Math.max(0, (atMs - lastAtMs) / 1000);
const plausibleMax = elapsedSec * Math.max(1, playbackSpeed) + 1.5;
const isSeek =
  seeked ||
  delta < 0 ||
  (delta > SEEK_THRESHOLD_SEC && delta > plausibleMax);
const countedSec = isSeek || delta <= 0 ? 0 : Math.min(delta, plausibleMax);
```

- A listener scrub **always** sets `seeked` from the DOM event, so the flag wins.
- A forward jump larger than could have played in the elapsed time is a seek.
- A large delta that is consistent with elapsed time × speed is playback, and is
  counted (capped at what could have played).
- A negative delta is always a seek.
- Write tests for the normal 4 Hz case, the backgrounded case, forward seek,
  backward seek, exactly 5, and a seek whose delta is small.

### 4.2 Session lifecycle

Use `crypto.randomUUID()` for `clientId` when a session starts. The session row
is append-only.

A session starts when audio becomes actually audible (`playing`, or a
`timeupdate` with advancing time), not when `load()` is called.

```ts
type LocalSessionDraft = {
  clientId: string;
  contentHash: string;
  startedAt: number;
  startPositionSec: number;
  playbackSpeed: number;
  lastPositionSec: number;
  durationListenedSec: number;
  lastCheckpointAtMs: number;
  contextPlayId: string | null;  // the run's clientId
  contextType: string | null;
  contextKey: string | null;
  stretchId: string;
  seeked: boolean;
};
```

Finalize on:

| Event | `completed` | `interrupted` | Other |
|---|---|---|---|
| track ran out (`ended`, queue has next) | `true` | `false` | hand the stretch to the next track |
| track ran out (queue empty) | `true` | `false` | close the run as completed |
| pause | `false` | `false` | end the stretch; run stays open |
| manual next / previous / queue jump | `false` | `true` | end the stretch; run stays open |
| stop / close player | `false` | `true` | close the run as interrupted |
| switching context | `false` | `true` | close the old run as interrupted |
| page closed / crash recovery | `false` | `true` | recovered at the checkpoint timestamp |

- `completed` means "the track ran out", per track. Do not set it just because
  the listener reached the end of the queue.
- `seeked` is recorded separately. A session can be `completed` and `seeked`;
  History may show it as "heard, but not straight through". Do not silently
  redefine `completed`.
- A speed change splits the session: finalize the current one, change the rate,
  and if audio is still playing start a new session at the current position.
- A pause finalizes; resuming starts a new session and a new stretch.
- Save a checkpoint every 10 s while a session is active, and on
  `visibilitychange` to hidden and `pagehide`. Do not finalize on tab hide:
  audio keeps playing. On `pagehide`, the synchronous local-storage write is the
  durability guarantee.
- On load, recover an orphaned checkpoint: if its session has no ended row,
  finalize it at the checkpoint's `timestamp` with `completed: false`,
  `interrupted: true`, and queue it for sync. Then delete the checkpoint.
- `pagehide`/`pageshow` with bfcache (`event.persisted`) must not create a
  duplicate session. If the page is restored and the element still has its
  state, continue; otherwise recover once.

### 4.3 Duration

For a streamed item the source may report `0`. When `loadedmetadata` gives a
finite duration, use it for the store and for `registerTrack` at first
registration. If the source already reported a finite duration, trust the
element's measured value when it differs by more than a second; the element is
the authority for what is actually playing.

---

## 5. Stretches and runs

Port `mobile/src/lib/playbackContext.ts` and the run behavior of
`mobile/src/services/TrackPlayerService.ts`.

### 5.1 Stretch

A **stretch** groups sessions of one continuous listen. `stretchId` is a
`crypto.randomUUID()`.

- Auto-advance hands the current `stretchId` to the next session.
- Every deliberate route into a track (manual next/previous, queue jump, starting
  a new queue, resume after a pause) starts a new stretch.
- A scrub does **not** split the stretch, but it sets `seeked` on the session,
  which disqualifies "heard straight through".
- Do not infer a stretch from the previous session's `completed` flag. A queue
  that ran out would leave that flag set and the next unrelated listen would
  join a stretch it was never part of. Use an explicit handover variable,
  consumed exactly once.

### 5.2 Run

A **run** is one attempt at a collection. The local queue record is:

```ts
type LocalRun = {
  clientId: string;              // deterministic, reused on retries
  contextType: "online" | "playlist";
  contextKey: string;
  contextTitle: string;
  trackCount: number;            // captured when the run opened
  startedAt: number;
  endedAt: number | null;
  lastIndex: number;
  lastTrackId: string | null;    // contentHash, because server ids may not exist
  lastPositionSec: number;
  listenedSec: number;           // 0 until finalized
  finishedCount: number;         // 0 until finalized
  completed: boolean;
  interrupted: boolean;
  updatedAt: number;
};
```

`openRun(context, trackCount)`:

1. If this module already has the same context, reuse its run id.
2. Read persisted open runs. Find one with the same `contextType` and
   `contextKey`.
3. Close every other open run as `interrupted: true`, `endedAt: Date.now()`.
4. If a matching run exists, reuse it and its original `trackCount`. The
   denominator is the collection's size when the attempt began, not its size
   now.
5. Otherwise create a run with `trackCount = queue.length` and `startedAt =
   Date.now()`.

The invariant: **at most one run is open.**

Starting a queue **without** a context (`context === null`) closes the open run
as interrupted and clears the context. Starting a track from a history entry or
a one-off row is a bare queue, not a collection run.

`touchRun` writes `lastIndex`, `lastTrackId`, and `lastPositionSec` on every
track change and every checkpoint. It must not dirty a sync flag: an unfinished
run is not sent.

`finalizeRun(run, { completed, interrupted })` writes once, guarded by
`endedAt === null`, and derives its figures from its own sessions:

- `listenedSec = SUM(session.durationListenedSec)` for sessions whose
  `contextPlayId` is this run.
- `finishedCount = COUNT(DISTINCT trackId)` where `session.completed` is true.
  Replaying one track three times is not three finished lectures.
- `lastPositionSec` is the current position at close.

A run stays open across pauses and across an app/tab close. Only the queue
running out, stopping, or moving to another context closes it.

### 5.3 Run's Persian labels

Do not copy the English strings from mobile. The web is Persian-only.

- Context type: `آنلاین` / `پلی‌لیست`.
- Position: `۴ از ۱۲`; hide it when the queue has 0 or 1 item.
- Outcome: `تمام شد` for a completed run, `متوقف در ۹ از ۲۴` for a partial run,
  `همهٔ قطعه‌ها شنیده شد` when every track was heard but the queue did not end
  normally.
- Resume a run: a completed run restarts at 0; an incomplete run resumes at its
  `lastPositionSec`.

---

## 6. Queue behavior

`src/lib/player/queue.ts` owns the queue and its index. It is pure except for
the store write.

- `playQueueAt(tracks, index, { startPositionSec?, context? })` replaces the
  queue, sets the index, opens/closes the run, and loads the selected track.
- `next()`:
  - If a next item exists, finalize the current session as interrupted, signal a
    skip, advance, and load the next item.
  - If at the end, restart the current track at 0 (mobile behavior). Do not wrap
    the queue.
- `previous()`: if a previous item exists, go to it; at the head, restart the
  current track at 0.
- `enqueue(tracks)`: append without changing the current item. With an empty
  queue, the first appended item becomes index 0 and is not auto-played.
- `jumpTo(index)`: same queue, same context; finalize the current session as
  interrupted and load the requested item. A jump is a new session, not a new
  run.
- `removeAt(index)`:
  - Removing an item before the current index decrements the index.
  - Removing the current item is allowed; move to the next item if one exists,
    otherwise the previous, otherwise stop. Finalize the current session as
    interrupted first.
  - Removing an item after the current index leaves the index alone.
  - Never leave `queueIndex` pointing out of bounds.
- `move(from, to)`: reorder without changing what is playing. If the current
  item moved, update `queueIndex` so it still points at it. `trackCount` on an
  open run does not change.
- A queue load triggered by a context opens/re-enters a run. A queue load
  without one closes the open run.
- Resolve each track's stream URL immediately before loading it, not when the
  queue is created. A queue can sit in memory for an hour; its URLs may expire.
- If a queued item has `origin === "local"`, it is not playable on the web. If
  it is selected, show the local state; do not create a session. Still allow
  `next`/`previous` to move past it.

Queue persistence is not required. The durable requirements are the session,
annotation, run, and track-registration queues, plus the checkpoint. A reload
shows an empty player (or a recovered interrupted session in History), never a
fake "still playing".

---

## 7. Durable local state and sync

There is no SQLite in the browser. Use a small, versioned, synchronous
`localStorage` store for the write-ahead queue. The records are small; the
synchronous write is the point on `pagehide`.

Create `src/lib/player/storage.ts` with keys under `pejvak.player.v1.`:

| Key | Contents |
|---|---|
| `tracks` | pending `registerTrack` records, keyed by `contentHash` |
| `sessions` | finalized, unsynced session rows |
| `annotations` | pending creates/updates/tombstones, keyed by `clientId` |
| `runs` | ended, unsynced run rows |
| `openRun` | the currently open run, if any |
| `checkpoint` | the active session's checkpoint, if any |
| `registered` | content hashes the server has acknowledged |

Rules:

- Parse defensively. A corrupt entry is dropped and logged only in development;
  it must never stop the player from starting.
- Do not store stream URLs, the JWT, or anything user-specific outside the
  local queue. This is one listener's browser.
- Every write is local-first. UI updates immediately from memory; the server
  hears about it later.
- Deduplicate by `clientId`/`contentHash`. Replacing an existing entry with the
  same key updates it; it does not append a duplicate.
- The store is the **write-ahead log**, not a mirror of server state. Once the
  server acknowledges a row, remove it.

### 7.1 Registration

`registerTrack` requires `title`, `contentHash`, `durationSec`,
`fileSizeBytes`, `isAudiobook`, and `origin` (the validator defaults several,
but send explicit values).

For a streamed item:

```ts
{
  title,
  contentHash,
  durationSec,        // measured duration when available, otherwise source value or 0
  fileSizeBytes: 0,   // unknown for a stream; the server accepts 0
  isAudiobook: false, // do not invent a flag the source did not give
  origin: "online",
  sourceId,
  externalId,
  collectionKey,
  collectionTitle,
}
```

- Register lazily: on the first play of a `contentHash`, fire-and-forget so audio
  is never blocked, and again as the first step of any sync that has a session
  or annotation for that hash.
- Registration is idempotent: the backend returns the existing row for the same
  user and hash. Treat its `_id` as the server id and add the hash to
  `registered`.
- If registration fails, keep the pending record and every dependent session or
  annotation queued. Do not drop them.
- A local track is never registered by the web player. It is a metadata row
  created on the phone.

### 7.2 `syncLocalData`

Create one Server Action, for example
`src/app/actions/player/sync-player-data.ts`, that calls
`callAct("track", "syncLocalData", { set, get })`.

The batch is built from the durable queues, in this order:

1. Register pending tracks first.
2. Send only sessions/annotations whose `contentHash` is in `registered` (or was
   just registered in this run).
3. Send ended runs in `contextPlays`.
4. Send settings only if the existing shared-settings work is already wired;
   this player does not own settings. Do not add a second settings path.

Wire values:

- All positions/durations are integers. Round at the boundary, never send
  floats.
- `contextPlayId` is the run's **clientId**, not its server `_id`. This is what
  mobile sends, and it lets a batch contain a run and its sessions before the
  run mapping exists.
- `lastTrackId` is the current track's `contentHash`, not a server id.
- `seeked` is always present, even when false.
- `deleted` is always present on annotations.
- Omit optional fields rather than sending `undefined`.
- `deviceInfo` may be `navigator.userAgent` truncated to a sane length, or
  omitted. Do not send anything identifying beyond a browser user agent.

Response handling:

- `syncedSessions`, `syncedAnnotations`, `syncedContextPlays`: counts, not ids.
  For sessions, remove the sent rows only when their tracks were registered and
  the act succeeded. When in doubt, keep them; the server is idempotent on
  `clientId`.
- `annotations[]` and `contextPlays[]` mappings `{ clientId, serverId }`: store
  the server id against the local record before removing it. This is the handle
  for later edits/deletes.
- A failed call keeps every row. Mark an in-memory failure count; do not show a
  blocking dialog.

### 7.3 The sync runner

Create `src/lib/player/sync.ts`.

- One in-flight sync at a time. Triggers that arrive during a sync set a
  "run again" flag; do not start a second overlapping batch.
- Batch size 50.
- Trigger on:
  - player boot (after checkpoint recovery),
  - every finalized session,
  - every annotation create/update/delete,
  - every finalized run,
  - `window` `online`,
  - `visibilitychange` to visible.
- Retry with bounded backoff: 5 s, 15 s, 60 s, then at most every 5 minutes.
  Also retry on the next trigger. Never unbounded synchronous retries.
- Never surface sync as a blocking UI error. A quiet "در انتظار همگام‌سازی" in
  Settings is enough; the player stays fully usable.
- A sync must be safe to call after every event; the single-flight guard and
  `clientId` make it idempotent.

---

## 8. Player state

Create `src/stores/player.ts` with Zustand (`zustand` is already a dependency).

State, at minimum:

```ts
type PlayerState = {
  status: "idle" | "loading" | "playing" | "paused" | "ended" | "error";
  waiting: PlaybackWait | null;
  error: string | null;

  current: PlayerTrack | null;
  queue: PlayerTrack[];
  queueIndex: number;
  context: PlaybackContext | null;

  positionSec: number;   // floored integer for display
  durationSec: number;   // 0 = unknown/live
  playbackSpeed: number;
  volume: number;
  muted: boolean;

  /** Where a history entry dropped the playhead, for the resume pin. */
  resumeFromSec: number | null;

  /** A skip nonce, so artwork/announcements react to a change, not a boolean. */
  skip: { direction: 1 | -1; nonce: number } | null;
};
```

- Do not store a derived `isPlaying` or `phase` separately. Use
  `resolvePlaybackPhase` and `status === "playing"` at the call site.
- Do not mirror the same data in two stores. Queue and current track live here;
  the engine owns the actual element.
- Only leaf components select `positionSec`/`durationSec`: the clocks, the
  scrubber, and the progress hairline. The artwork and control row must not
  re-render every second.
- The engine writes whole-second positions to the store at most ~4 times a
  second. The scrubber extrapolates between them with `requestAnimationFrame`
  while visible, using the same rules as
  `mobile/src/lib/progressSmoothing.ts`:
  - a normal tick never rewinds the anchor;
  - a seek, duration change, or pause/resume snaps;
  - a stale duration never overshoots.
- Port `progressSmoothing.ts` and its tests. Do not write a second
  interpolation formula in the scrubber.

---

## 9. The player bar

The bar is one surface, persistent while something is loaded.

- Render it from the shell (`src/app/(shell)/layout.tsx`), inside a client
  boundary component such as `src/components/player/player-bar.tsx`.
- It is **opaque `--surface`**, not glass. The plan says so explicitly: the bar
  is content. Glass remains for sheets, menus, and modals only.
- Fixed/sticky to the bottom of the content column, not over the sidebar. In
  RTL, `inset-inline-start` is the right edge; on desktop start after the
  248 px sidebar, on mobile start at 0. Use logical properties.
- The shell main content gets enough `padding-block-end` that the last row can
  never hide behind the bar. This is a clearance token derived from the bar
  height, not a hand-waved `pb-24` in one screen.
- The bar shows: artwork (or gradient placeholder), title, artist/collection,
  play/pause, previous/next at desktop widths, expand, and stop/close. One
  progress hairline runs along its top edge. Do not add a second progress bar.
- The title is a single line with truncation; a Persian title on a narrow bar
  must not push the controls out.
- Pressing the artwork or title opens `/player`. Pressing it must not toggle
  playback.
- The play/pause control is the one accent-filled circle in the bar. Waiting
  swaps its glyph for a spinner and keeps the press. A filled accent circle
  means "the current thing", the same rule as the mobile dock.
- Closing stops playback, finalizes the session as interrupted, closes the open
  run as interrupted, clears the queue and current track, and hides the bar.
  Closing is not the same as pausing.
- A `#sidebar-player-slot` already exists. Use it only for a queue button that
  opens the queue sheet; do not render a second now-playing surface there.
- If nothing is loaded, render nothing. No empty bar, no placeholder.

---

## 10. The full player (`/player`)

Replace the `PlannedSurface` in `src/app/(shell)/player/page.tsx`.

The route is a server page that renders a client `<PlayerScreen />`. Optional
query parameters:

- `trackId`: a server `_id` for a track that already exists; fetch its detail
  through a Server Action, resolve its stream URL, and load it as a
  single-item queue only if nothing is currently loaded.
- `positionSec`: an explicit resume position from a history entry. It wins over
  the normal resume position.
- If both are absent and the store is empty, show a real empty state:
  «چیزی در حال پخش نیست» with links to «کتابخانه» and «کاوش». Do not render a
  blank page and do not autoplay.

Layout, top to bottom, on a desktop-centered column (max ~760 px) and a
comfortable mobile stack:

1. **Header**: back/close (or a chevron that collapses to the bar), the context
   chip, and the queue/sleep actions.
2. **Hero artwork**: square, `--radius-xl` or the card radius, `object-fit:
   cover`; if absent, a deterministic gradient/tile derived from `contentHash`,
   never a broken image icon.
3. **Identity**: overline (`آنلاین` + `۴ از ۱۲`, or `کتاب صوتی`), title
   (`type-title`, 2 lines max), artist/narrator (`type-caption`,
   `text-secondary`), and a link back to the collection when a context exists.
4. **Timeline**: current time, scrubber with markers, remaining time. Use
   Persian digits and `formatClockFa`. Tabular numerals.
5. **Status line**: the one line for waits/errors, with `aria-live="polite"`.
   It occupies the same slot whether it is waiting or failed.
6. **Transport**: previous, rewind 30, play/pause (the only filled control),
   forward 30, next. 48 px touch targets; the play control is visually larger.
7. **Secondary controls**: speed, sleep timer, queue, note, volume/mute.
8. **Notes**: the selected note's actions or the composer, then the note list
   for this track.
9. **Shortcuts hint** at the bottom, small and unobtrusive.

The player must remain usable while a sheet is open. Do not unmount the audio
element when navigating between `/player` and the rest of the shell. The bar and
the route share the same store and engine.

### 10.1 Speed

- Supported rates: `0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3`.
- Display with `formatSpeed` (`۱٫۵×`).
- The control opens a compact menu or popover; a nine-option segmented control
  is too heavy for this row.
- Choosing a rate splits the session exactly as §4.2 describes.
- Do not write the rate to the listener's shared settings; this is session
  state. The initial rate is `1` unless the existing `getMe` result already
  carries `setting.defaultSpeed`.

### 10.2 Sleep timer

Port `mobile/src/lib/sleepTimer.ts`.

- Presets: 5, 15, 30, 45, 60 minutes, plus a custom 1–180 field.
- Picking a preset starts it immediately; the custom field needs "شروع".
- Show the remaining time with `formatRemaining`, in Persian digits.
- On expiry: **pause**, not stop. The bar and track stay; the session finalizes
  as a normal pause. Cancel the timer after firing.
- The timer is ephemeral per page, like mobile. Persisting it across a reload is
  not required, and would be surprising. Use a deadline, not a decrementing
  counter. A throttled background tab must not extend it: check the deadline on
  each `timeupdate`, `visibilitychange`, and a coarse timer.
- The timer lives in the player screen (or a small client component it owns),
  not in the Zustand store. It is UI state, not playback state.

### 10.3 Jump to time

- A timecode field accepting digits (Persian or ASCII). Use
  `digitsToSeconds` and `clampSeconds` from `src/lib/time.ts`.
- Label it with the current position, e.g. «زمان».
- Go seeks, marks the session `seeked`, closes the dialog, and restores focus.
- A malformed value is treated as 0, never `NaN`.
- The field clamps while typing and again on submit. A typed value can never
  seek past the duration.

### 10.4 Queue sheet

- Opens from the full player and from the sidebar queue button.
- Shows the queue in order: index, title, duration, current highlight, and a
  "now playing" marker.
- Jump to an item; reorder; remove. Reorder must be keyboard accessible: native
  drag is optional, buttons or a menu with «بالا»/«پایین» are required. Do not
  add a drag-and-drop dependency for this.
- Removing the current item follows §6.
- If a row's metadata is missing, say «این قطعه دیگر در کتابخانه نیست» and do not
  fake a title.
- The sheet is a Radix Dialog or a sheet built on it: `dir="rtl"`, portal,
  focus trap, Escape to close, restore focus to the trigger.
- It is glass because it floats. It is **not** a new content card.

---

## 11. The scrubber

The timeline is the most important control after play.

- It carries one marker per annotation, positioned by
  `markerOffsetRatio(positionSec, durationSec)`.
- Markers use the six-colour palette from `mobile/src/lib/annotations.ts`:
  `#208AEF`, `#E5484D`, `#30A46C`, `#F5A623`, `#8E4EC6`, `#12A594`. New notes
  pick `ANNOTATION_COLORS[annotationCount % 6]`, with a deterministic fallback.
- A marker is a real button with an accessible name containing its time and
  note text. Clicking it seeks and shows the note; clicking it must not also
  fire a scrub on the underlying track.
- Markers are positioned with logical `inset-inline-start` percentages, so the
  bar starts at the right in RTL. The progress fill follows the same direction.
- Use Radix Slider (`@radix-ui/react-slider` is installed) or an equally
  accessible custom control. Pass `dir="rtl"`. The keyboard must work:
  arrows ±5 s, Shift+arrows ±30 s, Home/End, PageUp/PageDown ±60 s.
- `aria-valuetext` is a Persian clock, not a raw number.
- Dragging follows the pointer 1:1; no spring under the finger. Show a time
  bubble with the target position. Commit one seek on release (not fifty).
- Optimistically move the playhead to the release position; the store catches
  up.
- While waiting, do not draw a playhead at 0. Draw an indeterminate sweep and
  hide the thumb until the position is known. Respect
  `prefers-reduced-motion`: use a static waiting line instead of a loop.
- A history-resume pin is neutral and distinct from annotation colours. It is
  not a marker and is not clickable.
- For a live stream, replace the scrubber with a «زنده» label and a disabled
  timeline. Do not draw markers at 0; live items have no durable positions.
- Do not use the timeline to store progress. It renders the store and calls
  `seek`.

---

## 12. Annotations

The player is where notes are made. The full annotation index is a separate
screen; this section is the player's composer and marker list.

### 12.1 Reading

- The player's notes for a track come from `getTrackDetail`'s embedded
  `annotations` relation (sorted by `positionSec`, bounded at 1000), fetched by a
  Server Action. Do not call `getMyAnnotations`; it has no `trackId` filter.
- If the track is not registered yet, there is no `_id` to ask for. Show the
  empty state; once registration succeeds, fetch notes for the returned id.
- Merge pending local notes by `clientId`. A local note has a temp id and
  `syncStatus`, but the UI treats it as a note immediately.
- Do not sort again. The relation is already in marker order. If local notes
  are inserted, merge them into that order by `positionSec`; ties keep creation
  order.

### 12.2 Creating

- Capture `positionSec = Math.round(currentPosition)` at the moment the composer
  opens. It does not follow playback while the listener types.
- Fields: text (required, trimmed), tags, colour. A note with text is a note; an
  empty note is a marker and is allowed by the model, but the mobile composer
  requires text. Keep that behaviour: disable save until trimmed text is
  non-empty, and say why if asked.
- Save to the durable queue immediately, then update the UI. Do not wait for the
  server.
- Payload:
  `{ clientId: uuid, contentHash, positionSec, text, tags, color, updatedAt:
  Date.now(), deleted: false }`.
- Ensure the track is registered before the sync runner sends the note. If the
  note is created before registration, register first; the note waits.
- On success, replace the temp id with the returned server id. Keep `clientId`;
  it is the retry key.

### 12.3 Editing and deleting

- Editing an existing server note: update locally first, then call
  `updateAnnotation` with `_id`, `text`, `tags`, `color`, `updatedAt`. If the
  call fails, keep the queued update; `syncLocalData` accepts updates by
  `clientId` with a newer `updatedAt`.
- Editing a not-yet-synced note: update the queued create in place; do not send
  a second create.
- Deleting a synced note: tombstone locally, then call `deleteAnnotation` by
  `_id`. If offline or the call fails, keep a tombstone with `deleted: true` and
  the same `clientId` for `syncLocalData`.
- Deleting an unsynced note: remove the queued create and do not send a
  tombstone that has nothing to delete. (A tombstone is harmless, but the local
  record has no server counterpart.)
- Last-write-wins on `updatedAt`. Use `Date.now()`. If the server returns a note
  with a newer `updatedAt`, adopt it; if the local edit is newer, keep the local
  version and let the sync resolve it.
- After deleting the selected note, clear the selection and close its editor.
- Confirm deletion with a dialog that names what disappears:
  «حذف یادداشت؟» / «این یادداشت حذف و همگام‌سازی می‌شود.» Buttons: «انصراف» and
  «حذف» (danger). Never make delete the default focus.

### 12.4 The composer

- A floating sheet/card, glass, with a visible label such as
  «یادداشت در ۱۲:۳۴».
- `TextArea` for text, a tag input (fold Persian before de-duplicating; use
  `lib/search.ts`'s folding rules), and the six-colour swatches.
- Actions: «انصراف» and «ذخیره» (or «ذخیرهٔ تغییرات»), with the save button
  disabled while the text is empty or a save is in flight.
- Focus the text field. In a modal, focus is trapped; Escape closes and restores
  focus. Do not lose a typed draft on Escape without confirmation if it is
  non-empty; at minimum, keep the draft in component state until the sheet is
  deliberately cancelled.
- The selected-note view shows its time, text, tags, and «ویرایش» / «حذف».
  Clicking its time seeks to it.
- Empty notes list:
  «هنوز یادداشتی نیست. با «یادداشت» همین لحظه را ثبت کنید.»

### 12.5 Colours

Use the mobile palette and names, translated only in the accessible label:
`آبی`, `قرمز`, `سبز`, `کهربایی`, `بنفش`, `فیروزه‌ای`. The colour is never the
only signal: the selected swatch also gets a ring and a check.

---

## 13. MediaSession and keyboard

### 13.1 MediaSession

`navigator.mediaSession` is the web analogue of lock-screen controls. It is not
decoration; it is what makes the player feel native.

- Set `MediaMetadata` with `title`, `artist`, `album` (collection title or
  «پژواک»), and artwork when a URL exists.
- Register handlers for `play`, `pause`, `stop`, `seekbackward`,
  `seekforward`, `seekto`, `nexttrack`, and `previoustrack`.
- `seekbackward`/`seekforward` default to 30 s; `seekto` uses
  `details.seekTime`.
- Call `setPositionState` only when duration is finite and > 0; update it on
  time updates, not every animation frame. Clear it on stop/error/live.
- Set `playbackState` to `playing`, `paused`, or `none` consistently with the
  store.
- Guard every call: `if ("mediaSession" in navigator)`. An unsupported browser
  must not crash the player.
- Do not use MediaSession to start playback without a user gesture.

### 13.2 Keyboard

Global shortcuts are active only while a track is loaded and not while focus is
in an input, textarea, select, or contenteditable element. Do not intercept keys
when a dialog is open except for the dialog's own Escape handling.

- `Space`: play/pause. `preventDefault` so the page does not scroll.
- `ArrowRight` / `ArrowLeft`: ±5 s. `Shift` makes it ±30 s. (Playback direction,
  not reading direction; this is the media-player convention.)
- `Home` / `End`: start / end (clamped; end seeks to the last second, not past
  it).
- `j` / `l`: ±10 s, optional but useful.
- `m`: mute/unmute.
- `ArrowUp` / `ArrowDown`: volume ±5%, only when the player has focus or the
  player is the active surface; do not steal page scrolling globally.
- `?` opens the shortcuts hint, optional.
- Announce shortcuts in the UI with `aria-keyshortcuts` where appropriate.

---

## 14. Error, empty, offline, and local states

These are four different things. Do not collapse them.

### 14.1 Error

- The player has a stable `error` state. The line is «پخش ممکن نشد» plus a short
  Persian reason from a known set (source unavailable, connection dropped, the
  file is gone, the browser blocked playback).
- A retry button re-resolves the URL once and reloads at the current position.
  For a local track, there is no retry; show the local state.
- Do not display a raw browser `MediaError.message` as the primary sentence.
  Keep it in a technical-details disclosure, as `ErrorState` already does.
- An error does not close the run automatically; stop does. A failed load has no
  session, so there is nothing to finalize.

### 14.2 Empty

- `/player` with nothing loaded: «چیزی در حال پخش نیست» and links to library and
  browse.
- Queue empty: «صف خالی است» with a link back to the collection.
- No notes: the sentence in §12.4.
- No search results or collection rows are Phase 3/4 concerns; do not add fake
  rows here.

### 14.3 Offline

- The player keeps playing what it already has (a stream that is already open,
  or a resolved URL). A stream that needs a new connection shows the buffering /
  error vocabulary, not a blank page.
- Sync is deferred; the queues persist. The shell's existing offline banner is
  enough; do not add a second banner inside the player.
- On `online`, retry sync. Do not auto-retry a failed stream forever.

### 14.4 Local track

`origin === "local"` means the server has metadata, history, and annotations,
but the bytes are on the listener's phone. The web cannot fetch them.

- The row has **no play affordance**. Do not render a disabled button with a
  tooltip; that implies a permission problem. State it:
  «صدای این قطعه روی دستگاه شماست و در وب پخش نمی‌شود.»
- The track page still shows stats, history, and notes.
- If such a track is in the queue, it is not playable; the queue row says so and
  the player moves past it on next/previous.
- Never call `registerTrack` or create a session for a local track from the web
  player.
- Do not suggest "download it here"; the web has no download feature. The shelf
  and the phone replace it.

### 14.5 Live stream

- No duration, no seek, no resume, no completion.
- Show «زنده» and a live indicator. The timeline is a static line, not a fake
  progress bar.
- A session is still recorded for listening time if the stream is audible; it
  is always `completed: false`, `interrupted` according to how it ended.
- Do not write a duration of `Infinity` anywhere.

---

## 15. Design constraints

These are product rules, not taste.

- **Two materials.** Opaque `--surface` for the bar and content; glass only for
  floating sheets, menus, dialogs, and the queue. The player bar is content and
  is opaque.
- **Three text tiers, in order.** Label (`text`), value (`text-secondary`,
  tabular), detail (`text-tertiary`, caption). Never invert them.
- **Tabular numerals for every clock, duration, count, and percentage.** Use
  `type-numeric` / `type-figure` or `tabular`.
- **Radius is a token.** Use `--radius-sm/md/lg/card/xl/pill`; no `20px`
  literals.
- **One icon family.** Add semantic names to `src/components/ui/icon.tsx` for
  `rewind`, `forward`, `speed`, `queue`, `sleep`, `volume`, `mute`, `expand`,
  `collapse`, `drag`, and `check`. Screens import `Icon`, never `lucide-react`.
- **RTL is structural.** `dir="rtl"` is already on `<html>`; use logical
  properties (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `inset-inline-*`).
  Never `left`/`right` for layout.
- **Persian copy only.** Use `fa()` for digits and `formatClockFa`,
  `formatSpeed`, `formatRemaining` for time. Never print `12:34` in Latin digits.
- **Motion is purposeful.** The only unbounded animation allowed in the player
  is the waiting sweep. Respect `prefers-reduced-motion` (the global CSS already
  collapses animations; do not add a JS animation that ignores it).
- **Focus is visible.** Every control has a 2 px accent focus ring and a 44 px
  touch target, even if its glyph is smaller.
- **A control never disappears.** Speed, sleep, queue, and note remain reachable
  on a narrow viewport; reflow them into a "more" menu if needed, but do not
  hide the primary action.
- **No per-row glass, no new glass surfaces.** The bar, the sheets, and the queue
  are the only floating surfaces here.
- **No fake affordances.** A control that cannot work (local play, live seek)
  is absent or shown as a state, never a button that does nothing.

---

## 16. Files to create or change

Suggested structure; keep files small and pure where possible.

```
src/lib/player/
  engine.ts                 one HTMLAudioElement, events, imperative API
  sessionTracking.ts        ported + browser extension, pure
  playbackContext.ts        ported, Persian labels
  playbackPhase.ts          ported, Persian copy
  progressSmoothing.ts      ported
  resume.ts                 ported
  sleepTimer.ts             ported
  annotations.ts            palette, marker ratio
  queue.ts                  queue and index operations
  storage.ts                localStorage write-ahead queues
  sync.ts                   single-flight sync runner
  online-hash.ts            sha256("online:<source>:<external>")
  types.ts                  PlayerTrack, LocalSessionDraft, LocalRun

src/stores/player.ts        Zustand store

src/components/player/
  player-bar.tsx
  player-screen.tsx
  transport-controls.tsx
  scrubber.tsx
  annotation-markers.tsx
  annotation-composer.tsx
  annotation-list.tsx
  queue-sheet.tsx
  sleep-timer-sheet.tsx
  jump-to-time-sheet.tsx
  playback-status-line.tsx
  speed-menu.tsx
  volume-control.tsx

src/app/actions/player/
  register-track.ts
  sync-player-data.ts
  resolve-track-for-player.ts   optional deep-link read
  get-track-notes.ts            optional, wraps getTrackDetail
  update-note.ts                optional wrapper
  delete-note.ts                optional wrapper

src/app/(shell)/player/page.tsx   replace PlannedSurface
src/app/(shell)/layout.tsx        mount the player boundary
```

Do not add a `src/lib/player/index.ts` barrel that re-exports a server action or
a module that touches `window` at import time. Keep client-only modules client
only.

### 16.1 Server actions

- Every action begins with `"use server"`, uses `callAct`, and returns
  `ActResult<T>`; it never throws for an ordinary failure.
- `register-track.ts`: validate `contentHash` non-empty, `durationSec` and
  `fileSizeBytes` non-negative integers, `origin === "online"` for this path;
  call `callAct("track", "registerTrack", { set, get: { _id: 1 } })`; return the
  `_id` or `null`.
- `sync-player-data.ts`: accept a serialisable batch, call
  `callAct("track", "syncLocalData", …)`, and request only the mappings the
  client uses:
  `syncedSessions`, `syncedAnnotations`, `syncedContextPlays`,
  `annotations { clientId, serverId }`, `contextPlays { clientId, serverId }`.
- `update-note.ts` / `delete-note.ts`: `annotation` model, validate the
  `ObjectId` before the call, return `ActResult`.
- The `get` projection is always explicit. Never `{}` and never "all fields".
- A `"use server"` module may export only async functions. Keep types and
  constants in `src/lib/player/` or `src/lib/domain/`, not in the action file.

---

## 17. Tests

Test the pure logic, not the pixels. Use Vitest, already configured.

### 17.1 Session math (highest priority)

Port the mobile suite and add the browser cases:

- normal forward delta adds exactly the delta;
- `delta === 5` adds nothing and is not a seek;
- forward seek (`delta > 5`, not plausible from elapsed time) sets `seeked`,
  adds nothing;
- backward seek sets `seeked`, adds nothing;
- a small seek with a DOM `seeked` flag is a seek even when `delta < 5`;
- backgrounded large delta consistent with elapsed time × speed is counted, not
  treated as a seek;
- checkpoint due at 10 s, not before;
- finalization rounds `durationListenedSec` and `endPositionSec` to integers;
- a speed change finalizes the old session and starts a new one at the same
  position;
- a pause finalizes with `completed: false`, `interrupted: false`;
- an `ended` finalizes with `completed: true`, `interrupted: false`;
- a stop finalizes interrupted and closes the run interrupted;
- recovering an orphaned checkpoint finalizes once and deletes the checkpoint;
- a checkpoint for a session that was already finalized does not create a
  duplicate.

### 17.2 Resume and progress

- `clampResumePosition` returns 0 at/after `duration - 5`;
- the latest ended session wins;
- an explicit history position wins over the derived resume;
- a completed run resumes at 0;
- progress smoothing never rewinds on a normal floored tick;
- it snaps on a seek, duration change, and pause/resume;
- it extrapolates at the current speed.

### 17.3 Runs and queue

- opening the same context re-enters the run and keeps the original
  `trackCount`;
- opening a different context closes every other open run as interrupted;
- starting a bare queue closes the run;
- at most one run is open;
- auto-advance hands the stretch to the next session;
- manual next starts a new stretch;
- a scrub sets `seeked` and never splits the stretch;
- `next` at the end restarts the current track, does not wrap;
- `previous` at the head restarts;
- queue reorder keeps the current index on the current track;
- removing before the current index decrements it; removing the current item
  moves deliberately;
- `finishedCount` counts distinct completed track ids, not completed sessions.

### 17.4 Persistence and sync

- a queued session survives a storage round-trip;
- the same `clientId` is reused on retry;
- a successful batch removes only acknowledged rows;
- a failed batch keeps every row;
- a track is registered before its sessions are sent;
- an annotation mapping replaces the temp id with the server id;
- a tombstone is sent as `deleted: true` and the row is removed after ack;
- a second run of the sync with the same queue sends nothing;
- an orphaned checkpoint is recovered before the first sync;
- a corrupt storage entry is ignored, not fatal.

### 17.5 Adapters and resolution

- port the adapter fixture tests from mobile;
- a resolved stream URL is re-resolved once on a simulated 403, then fails with a
  user-facing error;
- a local track never calls the resolver;
- a live source reports duration 0 and no resume;
- the online hash is stable across URL changes and differs across external ids.

### 17.6 What not to test

- Layout, colours, CSS, and Radix wrappers. Do not write a test that asserts a
  class name. The visual layer has no render-test obligation; the pure contracts
  above do.

Run:

```bash
npm run check
```

The gate includes declarations drift, `tsc`, ESLint, Vitest, and `next build`.
A player is not done because it typechecks; it is done when `npm run check` is
green and the acceptance criteria below are true against a real backend.

---

## 18. Acceptance criteria

A reviewer should be able to do all of these without reading the source first.

### Playback

- [ ] Clicking play on a playable online track starts audio from a real resolved
      URL. No autoplay occurs on page load.
- [ ] A cross-origin stream plays without a CORS error; the code does not set
      `crossOrigin` unnecessarily.
- [ ] The play button shows a spinner and "توقف انتظار" while connecting, and
      nothing is drawn for the first ~400 ms.
- [ ] Pausing ends the session; resuming starts a new one. Two pauses produce
      two sessions, not one long session with a gap.
- [ ] A speed change produces two sessions and the second starts at the current
      position with the new rate.
- [ ] A seek during playback sets `seeked` on that session and never adds the
      jump distance to `durationListenedSec`.
- [ ] A normal play/pause session's `durationListenedSec` is within a second of
      the audible time, not the position delta.
- [ ] A track that ends by itself advances to the next queue item, keeps the same
      stretch, and reports `completed: true` for the finished track.
- [ ] A manual next/previous finalizes the old session as interrupted and starts
      a new stretch.
- [ ] The end of the queue closes the run as completed and leaves the bar
      showing the last track.
- [ ] Pressing play after `ended` restarts at 0 and creates a new session; it
      does not create a zero-length session at the end.
- [ ] A live stream shows "زنده", cannot be scrubbed, and never writes a finite
      duration or a completion.

### Persistence

- [ ] Play for a few seconds, pause, wait for sync, and reload: History shows
      exactly one session with the right duration.
- [ ] Play, close the tab without pausing, reopen, and let sync run: History
      shows one interrupted session ending at the checkpoint timestamp, not a
      lost listen and not a duplicate.
- [ ] Go offline, play/pause, add a note, reload: the queued rows survive and
      sync when the connection returns.
- [ ] Re-sending the same batch does not create duplicate sessions or notes; the
      `clientId` is stable.
- [ ] A pending track is registered before its session or note is sent; the
      server never skips a row for an unknown content hash.

### Annotations

- [ ] A note created at 3:21 appears on the scrubber at that position with the
      chosen colour, and seeks there when clicked.
- [ ] The note survives a reload and is visible on the track page and in the
      player.
- [ ] Editing a note updates it in place; deleting it removes the marker and
      asks for confirmation first.
- [ ] An offline note is queued and appears in History after the connection
      returns.
- [ ] An unsynced note is not duplicated when the same create is retried.
- [ ] Empty notes list shows the instructed Persian sentence and the note
      action.

### Player bar and full player

- [ ] The bar appears only when something is loaded, never on top of content,
      and never covers the last row of a page.
- [ ] The bar is opaque; only sheets (queue, sleep, jump, note) are glass.
- [ ] The full player can be opened from the bar and closed back to it without
      interrupting audio.
- [ ] `/player` with nothing loaded is an empty state, not a blank page.
- [ ] A local track shows the "audio is on your device" state and has no play
      affordance; the track page still shows its history and notes.
- [ ] Every clock, duration, speed, and count uses Persian digits and tabular
      numerals.
- [ ] The layout is RTL with logical properties; no horizontal overflow at 360 px.
- [ ] Focus is trapped in sheets, Escape closes them, and focus returns to the
      trigger.
- [ ] Reduced-motion mode removes the sweep and any decorative motion.

### Media and keyboard

- [ ] `MediaSession` shows the title/artist/album and its play/pause/seek
      handlers work in a Chromium browser.
- [ ] Space toggles playback only when not typing; arrows seek; Shift+arrows
      seek 30 s; Home/End clamp correctly.
- [ ] A blocked autoplay shows a clear "press play" state instead of a spinner
      that never ends.

### Quality gates

- [ ] `npm run check` is green.
- [ ] No `any`, no non-null assertions where a guard is clearer, no unused
      imports, no `console.log` left behind.
- [ ] No new dependency was added for drag-and-drop, a slider, or a state
      library. The existing Radix packages and Zustand are enough.
- [ ] The only files changed outside the player are the shell mount, the player
      route, the icon vocabulary, and the new actions. No unrelated cleanup.

---

## 19. Manual verification script

Use a real backend and a real online collection (Internet Archive is the easiest
because its URLs are stable).

1. Start the backend (`cd back && deno task dev`) and the web app
   (`cd front && npm run dev`). Log in.
2. Open a collection from Browse. Confirm its first URL plays in a bare
   `<audio>` element before wiring the full player (Phase 4.5).
3. Play a track. Confirm:
   - no autoplay before the click;
   - the connecting spinner appears only if the wait exceeds 400 ms;
   - the clock advances and the scrubber follows;
   - `MediaSession` metadata appears in the browser's media controls.
4. Pause. Wait for sync. Open History and confirm exactly one session, the
   correct `durationListenedSec`, and the correct start/end positions.
5. Play again, scrub to the middle, then pause. Confirm the second session has
   `seeked: true` and the jump is not counted as listening time.
6. Change speed. Confirm two sessions, the second with the new `playbackSpeed`,
   starting at the current position.
7. Open the queue, jump, reorder, and remove an item. Confirm playback follows
   the queue and the run's `lastIndex` updates.
8. Add a note at the current position. Confirm the marker, click it, edit it,
   delete it with confirmation.
9. Play, close the tab, reopen, wait for sync. Confirm one interrupted session
   with the checkpoint timestamp.
10. Open a local track. Confirm the state copy and the absence of a play button;
    confirm no session is created.
11. Test at 360 px and desktop, in both themes, with reduced motion, and with
    keyboard only. Confirm no overflow, no focus loss, and no missing labels.

Record the results in the commit message or the phase log. Do not claim a pass
without the evidence.

---

## 20. The one-paragraph summary

One lazy, module-level `HTMLAudioElement`; a Zustand store of transport and queue
state; a pure session tracker that counts wall-clock playback and never a seek;
a write-ahead `localStorage` queue that registers a track before its first
session and syncs through `syncLocalData` with stable `clientId`s; a stretch that
survives auto-advance but not a pause or a deliberate skip; a run that opens per
collection attempt and closes exactly once; a persistent opaque player bar and a
full player with a marker-carrying RTL scrubber; notes created locally and
edited/deleted through the annotation acts with a tombstone fallback; a queue
sheet, speed, sleep timer, jump-to-time, `MediaSession`, and keyboard controls.
A local track is a state, not an error; a wait is a state, not a spinner; and a
closed tab must never lose a listen.
