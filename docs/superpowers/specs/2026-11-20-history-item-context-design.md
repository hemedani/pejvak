# History Item Playback Context — Design

Date: 2026-11-20
Scope: `back/` and `android/` (the native app). `mobile/` is deprecated and is not touched.

## Intent

A history entry should answer more than "what did I hear, and when". It should preserve the
conditions of the listen, so months later the listener can see whether the track was standalone or
part of a collection, how that collection was ordered, and what the audio was shaped like: ambient
sound, volume, and the bass/treble/boost curve.

The data is captured on the device at session start, stored in Room first, and synced in the same
idempotent batch as the session. It must survive reinstall and follow the listener to another device.

## Goals

- Every new playback session stores a snapshot of its playback context.
- The History UI shows that context per item (and in the markdown export).
- The backend stores the snapshot on `PlaybackSession`, returns it from
  `getMyListeningHistory`, and accepts it in `syncLocalData`.
- A pull restores the snapshot on a fresh install / second device.
- Legacy rows without the new fields behave sensibly through explicit defaults.
- No change to the Lesan relationship graph.

## Non-goals

- No new pitch-shift control. "Pitch/tone adjustments" means the existing bass/treble/boost
  enhancer curve.
- No retroactive reconstruction of old listens beyond defaults.
- No record of mid-session changes. Speed changes already split a session; volume/tone/enhancer
  changes do not, so the snapshot is taken at session start.
- No new server-side analytics or counters.
- No new tables or relations on either side.

## Constraints

- Integer seconds for durations; epoch milliseconds for timestamps. Volume and levels are whole
  percent 0–100.
- Offline-first: Room write is the source of truth; sync is background and never blocks the UI.
- Lesan: relations are defined from one side only; the reverse is auto-created and embedded.
  Add only flat `pure` fields to `PlaybackSession`; reuse its existing `track` and `user`
  relations. Do not add a relation for a playlist or collection (a run must outlive the playlist).
- Backend first, then Android.
- `typeGeneration: true` regenerates `back/declarations/`. `front/` vendors a byte-identical copy;
  the copy must be refreshed (no reformatting) or `front`'s `npm run check` fails. Android does not
  consume the generated declarations (it builds its JSON by hand), but `front` does.

## Data model

### Snapshot fields (flat, optional, on `PlaybackSession` / Room `sessions`)

| Field | Type | Meaning |
|---|---|---|
| `contextTitle` | string | The collection's title **as captured at play time**, so a rename or deletion cannot rewrite history. Falls back to the live lookup for legacy rows. |
| `collectionSort` | `"manual" \| "name" \| "createdAt" \| "duration" \| "folder" \| "smart" \| "source" \| "shuffle"` | The rule that ordered the queue. Absent/unknown when not known. |
| `collectionSortDirection` | `"asc" \| "desc"` | Direction of that ordering. |
| `collectionIndex` | number | 0-based position of this track in the queue at session start. |
| `collectionSize` | number | Queue length at session start. |
| `ambientTone` | string | Tone id from the catalogue (`room`, `rain`, `forest`, `river`, `ocean`, `wind`, `birds`) or `"none"`. |
| `ambientLevel` | number 0–100 | Ambient tone slider level. |
| `volumePercent` | number 0–100 | The app's own volume slider. |
| `enhancerEnabled` | boolean | Whether the enhancer was on. |
| `enhancerBoostDb` | number | Loudness boost, 0–12 dB. |
| `enhancerBassDb` | number | Bass shelf, −12–12 dB. |
| `enhancerTrebleDb` | number | Treble shelf, −12–12 dB. |

**Standalone vs collection is derived, not stored.** `contextType` already answers it: absent means
standalone. A stored boolean would be a second source of truth and could disagree after a legacy
import. The app exposes a derived `collectionKind` on the history item.

**Why optional:** legacy sessions and checkpoints predate these fields. `optional` leaves old
documents untouched; defaults are applied on read in one place per side. This is the same pattern
already used for `User.setting`.

The Room columns are **nullable with no SQL default**, so a legacy row stays `NULL` and can be told
apart from a new row that genuinely used no ambience or full volume. The mapper normalises `NULL`
to the defaults below; nothing is backfilled by the migration.

### Defaults (applied on read, never written by migration)

| Situation | Value |
|---|---|
| No `contextType` | standalone |
| No `contextTitle` | resolve live from the playlist/folder name, then the track title |
| Unknown `collectionSort` | `unknown` — UI omits the ordering line |
| `collectionIndex` / `collectionSize` | `0` / `0` |
| `ambientTone` | `"none"` |
| `ambientLevel` | `0` |
| `volumePercent` | `100` (matches the app's "absent volume is full scale") |
| `enhancerEnabled` | `false` |
| `enhancerBoostDb` / `enhancerBassDb` / `enhancerTrebleDb` | `0.0` |

These defaults are the "older items" behaviour the owner asked for: an old listen reads as a
standalone item, no ambience, full volume, flat enhancer. The UI never invents a non-zero value.

### Stretch vs session

A history entry is a **stretch** — several sessions heard continuously — while the snapshot is per
session. To keep the existing behaviour and avoid inventing a merge:

- The stretch row and the markdown line use the **start item's** snapshot, matching today's row
  (`entry.start.contextTitle`).
- The detail sheet shows the snapshot of the session it opens (today the stretch's end item), so a
  volume or tone change between tracks is visible when that session is opened rather than flattened.
- If the start item is legacy, the stretch line shows the documented defaults and the detail shows
  defaults per track.

### Sort criteria mapping (current call sites)

| Player | `collectionSort` | Direction |
|---|---|---|
| Playlist detail / playlist summary | `manual` | `asc` |
| Folder detail / folder summary (Resume, Restart, Unfinished) | `folder` | `asc` |
| Folder shuffle mode | `shuffle` | `asc` |
| Smart playlist | `smart` | `asc` |
| Online collection | `source` | `asc` |
| Library queue / history resume / track detail | `unknown` | `asc` |

The enum also carries `name`, `createdAt`, and `duration` for library views that sort by them; a
future sort simply passes the matching value.

### Library queues and resumes (owner decision)

A library multi-track queue is played with `context = null`, and resuming from history loads a
one-track queue while keeping the old `contextType`. Confirmed rule:

- **Standalone** means `contextType == null`. A library queue therefore stays standalone; it has no
  collection title or ordering, and the UI shows no position for it.
- `collectionIndex`/`collectionSize` are recorded only when `contextType != null`. A resume that
  loads a one-track queue records `0 / 1`, not the original collection position.
- This keeps "standalone vs collection" identical to the data model and avoids inventing a run for
  library playback. If library queues are later given collection identity, only the capture and UI
  change; the wire fields stay the same.

## Backend

### Model — `back/models/playbackSession.ts`

Add the fields above to `session_pure` as `optional(...)`. No relation changes. `createUpdateAt`
stays. The existing unique sparse `clientId` index is unchanged.

### Ingest — `src/sync/syncLocalData/`

- Validator (`syncLocalData.val.ts`): add the fields to the `sessions` object as
  `optional(...)`, with `collectionIndex`/`collectionSize`/levels as `number()`, booleans as
  `boolean()`, strings as `string()`.
- Implementation (`syncLocalData.fn.ts`): copy them into the inserted `doc`, exactly like the
  existing session fields. No new relation wiring; the `track`/`user` relations stay as they are.

### Read — `src/sessions/getMyListeningHistory/`

`selectStruct("playbackSession", 2)` already projects pure fields, so the new fields are readable
with no act change. Verify with an hurl assertion.

### Pull — Android transport

`LesanSyncTransport.fetchRemoteSessions` adds the fields to its `get` projection and parses them
into `RemoteSession`.

### Declarations

Run the server once to regenerate `back/declarations/`. Refresh
`front/src/types/declarations/selectInp.ts` byte-for-byte and run `front`'s declaration check.
`mobile/` is deprecated and is not refreshed.

## Android

### Room

- `SessionEntity` gains the columns. DB version 1 → 2.
- Add an additive `Migration(1, 2)` with `ALTER TABLE sessions ADD COLUMN ...` **nullable and with
  no default**; register it in `AppModule.provideDatabase`. No destructive fallback. Defaults are
  applied by the mapper, never written by SQL.
- `exportSchema = true` — commit the generated v2 schema.
- `Mappers.kt` maps the new columns both ways.

### Domain

- `Session` gains the snapshot fields, defaulted to the values in the table above.
- Add `CollectionSort` and `SortDirection` enums, and a pure `PlaybackConditions` data class with
  `normalizePlaybackConditions(...)` so every default lives in one testable place.
- `HistoryItem` gains a derived `collectionKind` (`Standalone` / `Collection`) from `contextType`.

### Capture

- `PlaybackEngine.beginSession` takes a `PlaybackConditions` snapshot. The engine stays pure: it
  receives plain data, not Android audio objects.
- Add `var conditionsProvider: (() -> PlaybackConditions)? = null` to the engine, set by
  `PlaybackService`, which combines:
  - `AudioEffectsRepository.state` for volume, tone id, tone level, enhancer curve;
  - the active run's `PlaybackContext` for sort criteria/direction;
  - `PlayerState.queueIndex` and `queue.size` for index/size.
- Extend the playback `PlaybackContext` with `sort: CollectionSort = Unknown` and
  `direction: SortDirection = Asc`. Call sites set it using the mapping table.
- On kill recovery, the checkpoint does not carry the snapshot; the recovered session gets the
  documented defaults. This is intentional and matches "older items".

### Sync

- `LesanSyncTransport.syncLocalData` adds the fields to the session JSON.
- `SyncRepository` pull inserts them into the local `Session`.
- `RemoteSession` in `domain/Reconcile.kt` gains the fields; `reconcileSessions` is otherwise
  unchanged (append-only, deduped by `clientId`).

### UI

- `SessionDetailSheet` gains a "Playback context" block: collection title + kind + ordering +
  position (e.g. "3 of 12, manual order"), ambience (tone label + level), volume, speed, and the
  enhancer curve when active.
- History rows may show a compact secondary line (ambience/volume) only when recorded; the detail
  sheet always shows the full block, using defaults for legacy rows.
- Markdown export (`historyMarkdown`) appends the same context.
- Every string goes in `res/values/strings.xml`; use existing theme tokens, no color literals.

## Performance

The snapshot lives on the session row, so history reads stay a single indexed query and a track
join — no extra tables, no per-item lookups into settings or effects. The existing stretch keyset
query and indexes are unchanged.

## Tests

- Backend: hurl assertion that a synced session with the new fields is returned by
  `getMyListeningHistory`; a legacy session without them still reads (defaults on the client).
- Android pure: `normalizePlaybackConditions` defaults; `Session` mapping round-trip;
  `PlaybackEngine` with a fake store records the provider's snapshot at `beginSession`; history
  grouping still keys correctly.
- Android build: `./gradlew assembleDebug` and `./gradlew testDebugUnitTest`.
- `deno check mod.ts`, `deno lint`, `deno fmt --check`.

## Rollout order

1. Backend model, validator, ingest, hurl test.
2. Regenerate declarations; refresh `front` copy; verify.
3. Room migration + entity + mapper + domain defaults.
4. Engine provider + service wiring + context sort at call sites.
5. Transport push + pull.
6. UI + markdown.
7. Tests, build, plan update.

## Calls I made (owner can override)

- "Sort order and criteria" = the queue's ordering rule + direction, plus the track's index and the
  queue size. It is not the playlist's own item order value.
- Snapshot at session start, not updated mid-session.
- Ambient tone stored as its catalogue id; `"none"` when off.
- Standalone is derived from `contextType`, not stored.
- Legacy/unknown ordering is hidden rather than shown as "manual".
- Collection title is snapshotted on the session so renames/deletes and cross-device pulls keep
  history truthful; live lookup is only a legacy fallback.
- A stretch's row and markdown use the start session's snapshot; the detail lists each track's own.
- Room columns are nullable; the mapper applies defaults, so a legacy row can be told apart from a
  genuinely flat new one.
- Library queues stay standalone (confirmed).
