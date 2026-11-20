# History Item Playback Context — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sessions store a snapshot of the conditions they played under (standalone vs collection, ordering, ambient tone, volume, enhancer curve); the Android Room DB persists and captures it; the backend syncs/returns it.

**Architecture:** Backend adds flat optional fields to the existing `PlaybackSession` model, extends `syncLocalData` ingest, returns via `getMyListeningHistory`, and parses it on pull. Android adds a nullable migration (v1→v2) on the `sessions` table, a pure `PlaybackConditions` snapshot captured in `PlaybackEngine.beginSession` via a provider set by `PlaybackService`, and extends push/pull JSON. No new relations anywhere.

**Tech Stack:** Deno/Lesan/MongoDB (backend), Kotlin/Room/Jetpack Compose (Android). Wire field names are camelCase: `contextTitle`, `collectionSort`, `collectionSortDirection`, `collectionIndex`, `collectionSize`, `ambientTone`, `ambientLevel`, `volumePercent`, `enhancerEnabled`, `enhancerBoostDb`, `enhancerBassDb`, `enhancerTrebleDb`.

**Spec:** `docs/superpowers/specs/2026-11-20-history-item-context-design.md`

## Global Constraints

- Durations/offsets are **integers**; timestamps are epoch-milliseconds. Volume and enhancer levels are whole percent 0–100.
- No `pitch` field. "Advanced audio settings" are the existing bass/treble/boost enhancer curve.
- `Standalone` is **derived**: `contextType == null`. Do not store a duplicate flag.
- All new data lives on the session row; history reads stay a single indexed query + track join.
- Android Room DB version goes 1 → 2. Add `Migration(1, 2)` (additive, nullable columns), set `exportSchema` to version 2, and commit the generated v2 schema JSON to `android/app/schemas/com.pejvak.app.data.local.PejvakDatabase/2.json`.
- `mobile/` is deprecated and is **not** touched.

## Review Focus

Each task owns a slice with its own test; the plan is test-driven. Key failure modes to verify:

1. **Legacy rows** — a session with no new fields must still ingest/return and display via defaults; a `NULL` snapshot column and a real flat `0%`/`"none"` value are both valid and must not collapse.
2. **Mid-session settings** — changing volume/tone/enhancer must not rewrite history; the snapshot is taken at session start and not updated on pause/stop.
3. **Deleted/renamed collections** — `contextTitle` is snapshotted at play time, so a later delete/rename of the playlist/folder cannot erase the history entry's title.
4. **Resume/standing** — resuming from history writes `collectionIndex=0`, `collectionSize=1`; it must not resurrect the original collection's order.
5. **Kill recovery** — an orphan checkpoint (app killed mid-session) recovers the session with defaults; no crash, no data loss of the session itself.

---

## File Structure (new + modified)

| File | Change |
|---|---|
| `back/models/playbackSession.ts` | + 11 optional pure fields |
| `back/src/sync/syncLocalData/syncLocalData.val.ts` | + optional fields on `sessions` |
| `back/src/sync/syncLocalData/syncLocalData.fn.ts` | copy fields into inserted doc |
| `back/http/e2e.hurl` | + hurl assertions + `getMyListeningHistory` projection |
| `back/declarations/selectInp.ts` | **generated** on server start |
| `front/src/types/declarations/selectInp.ts` | **generated copy** refreshed byte-for-byte |
| `front/scripts/check-declarations.mjs` | unchanged (it already hashes `back/`) |
| `android/app/src/main/kotlin/com/pejvak/app/data/local/SessionEntities.kt` | + 11 nullable columns |
| `android/app/src/main/kotlin/com/pejvak/app/data/local/PejvakDatabase.kt` | version 1→2 |
| `android/app/src/main/kotlin/com/pejvak/app/di/AppModule.kt` | add `Migration(1, 2)` |
| `android/app/src/main/kotlin/com/pejvak/app/data/local/Mappers.kt` | map new columns (to/from domain, defaults) |
| `android/app/src/main/kotlin/com/pejvak/app/domain/PlaybackConditions.kt` | **new**: `CollectionSort`, `SortDirection`, `PlaybackConditions`, `Session.playbackConditions()`, `HistoryItem.collectionKind`, `describePlaybackConditions`, `playbackMarkdownContext`, `normalizePlaybackConditions` |
| `android/app/src/main/kotlin/com/pejvak/app/domain/Models.kt` | `Session` + 11 nullable fields |
| `android/app/src/main/kotlin/com/pejvak/app/playback/PlaybackState.kt` | `PlaybackContext` + `sort`, `direction` |
| `android/app/src/main/kotlin/com/pejvak/app/playback/PlaybackEngine.kt` | `beginSession` captures `PlaybackConditions` via provider |
| `android/app/src/main/kotlin/com/pejvak/app/playback/PlaybackService.kt` | set `engine.conditionsProvider` |
| `android/app/src/main/kotlin/com/pejvak/app/data/sync/LesanSyncTransport.kt` | push session fields; `fetchRemoteSessions` projection + parsing |
| `android/app/src/main/kotlin/com/pejvak/app/domain/Reconcile.kt` | `RemoteSession` + fields |
| `android/app/src/main/kotlin/com/pejvak/app/data/sync/SyncRepository.kt` | set snapshot fields on inserted Session |
| `android/app/src/main/kotlin/com/pejvak/app/ui/components/history/SessionDetailSheet.kt` | render Playback Context block |
| `android/app/src/main/kotlin/com/pejvak/app/domain/History.kt` | `historyMarkdown` appends context |
| `android/app/src/main/res/values/strings.xml` | new `history_fact_*` strings |
| tests | `app/src/test/kotlin/com/pejvak/app/domain/PlaybackConditionsTest.kt` (new), `data/local/MappersTest.kt`, `playback/PlaybackEngineTest.kt`, `domain/HistoryTest.kt` |
| `android/docs/plans/01-native-rewrite.md` | append progress-log entry per Android task |

---

## Backend Tasks

### Task 1: `PlaybackSession` snapshot fields + ingest + hurl test (backend first)

**Files:** `back/models/playbackSession.ts`, `back/src/sync/syncLocalData/syncLocalData.val.ts`, `back/src/sync/syncLocalData/syncLocalData.fn.ts`, `back/http/e2e.hurl`.

**Interfaces:**
- Adds to `session_pure`: `contextTitle`, `collectionSort`, `collectionSortDirection`, `collectionIndex`, `collectionSize`, `ambientTone`, `ambientLevel`, `volumePercent`, `enhancerEnabled`, `enhancerBoostDb`, `enhancerBassDb`, `enhancerTrebleDb` — all `optional(...)`, with `enhancerBoostDb/BassDb/TrebleDb` as `optional(number())`, levels as `optional(number())`, booleans as `optional(boolean())`, strings as `optional(string())`.

**Steps:**
- [ ] **Step 1:** Edit `session_pure` to add the 11 fields.
- [ ] **Step 2:** Edit `syncLocalData.val.ts` sessions object to accept the fields.
- [ ] **Step 3:** Edit `syncLocalData.fn.ts` session `insertOne` doc to copy them.
- [ ] **Step 4:** Extend the e2e: in the first `syncLocalData` `set.sessions[0]`, add `contextTitle: "Test Book"`, `collectionSort: "manual"`, `collectionSortDirection: "asc"`, `collectionIndex: 2`, `collectionSize: 5`, `ambientTone: "forest"`, `ambientLevel: 30`, `volumePercent: 70`, `enhancerEnabled: true`, `enhancerBoostDb: 3, enhancerBassDb: 2, enhancerTrebleDb: 1`. Add `collectionSort`, `collectionIndex`, `volumePercent`, `ambientTone`, `enhancerEnabled`, `contextTitle` to the `getMyListeningHistory` `get` projection and assert those values via `jsonpath`.
- [ ] **Step 5 (run):** Start the backend (`cd back && deno task start`) and run the listener e2e: `deno task test`. **Expected:** green, including the new assertions.
- [ ] **Step 6 (commit):**
```
git add back/models/playbackSession.ts back/src/sync/syncLocalData/syncLocalData.val.ts back/src/sync/syncLocalData/syncLocalData.fn.ts back/http/e2e.hurl
git commit -m ":sparkles: back: Add playback-context snapshot fields to sessions"
```

### Task 2: Regenerate declarations + refresh the front vendored copy

**Files:** `back/declarations/selectInp.ts`, `front/src/types/declarations/selectInp.ts`.

**Steps:**
- [ ] **Step 1:** Ensure MongoDB is up (e.g., `docker compose -f docker-compose.dev.yml up -d`).
- [ ] **Step 2:** Start the backend so it regenerates declarations (`cd back && deno task start`; stop after it prints "Listening"). The file `back/declarations/selectInp.ts` will now include the new session fields.
- [ ] **Step 3:** Copy byte-for-byte: `cp back/declarations/selectInp.ts front/src/types/declarations/selectInp.ts`.
- [ ] **Step 4 (run/verify):** In `front/`, run `npm run check:declarations`. **Expected:** exit 0 (no drift). Also run `npm run typecheck` to confirm the new fields don't break consumers.
- [ ] **Step 5 (commit):**
```
git add front/src/types/declarations/selectInp.ts
git commit -m ":hammer: front: Vendor refreshed Lesan declarations"
```

### Task 3: Android Room v2 migration + entity + mapper + pure defaults

**Files:** `SessionEntities.kt`, `PejvakDatabase.kt`, `AppModule.kt`, `Mappers.kt`, **new** `domain/PlaybackConditions.kt`, `Models.kt`.

**Interfaces:**
- `Session` + nullable fields: `contextTitle: String?`, `collectionSort: CollectionSort?`, `collectionSortDirection: SortDirection?`, `collectionIndex: Int?`, `collectionSize: Int?`, `ambientTone: String?`, `ambientLevel: Int?`, `volumePercent: Int?`, `enhancerEnabled: Boolean?`, `enhancerBoostDb: Double?`, `enhancerBassDb: Double?`, `enhancerTrebleDb: Double?`.
- `enum class CollectionSort(wire)`: `Unknown`, `Manual`, `Name`, `CreatedAt`, `Duration`, `Folder`, `Smart`, `Source`, `Shuffle`.
- `enum class SortDirection(wire)`: `Asc`, `Desc`.
- `PlaybackConditions` data class with the **normalized** defaults (documents in the spec): `contextTitle: String?`, `collectionSort: CollectionSort = Unknown`, `collectionSortDirection = Asc`, `collectionIndex = 0`, `collectionSize = 0`, `ambientTone = "none"`, `ambientLevel = 0`, `volumePercent = 100`, `enhancerEnabled = false`, `enhancerBoostDb/BassDb/TrebleDb = 0.0`.
- `Session.playbackConditions(): PlaybackConditions` — reads the nullable fields, defaultsing them.
- `HistoryItem.collectionKind()`: `Standalone` when `session.contextType == null`, else `Collection`.
- `describePlaybackConditions(conditions)`: build display strings (e.g. `"Manual, 3 of 5"`, `"Forest, level 30"`, `"Volume 70%"`, `"Enhancer +3 dB"`), omitting unknown pieces.
- `playbackMarkdownContext(conditions)`: a compact markdown fragment appended by `historyMarkdown`.
- `normalizePlaybackConditions(...)`: central defaulting used by mapper + tests.

**Steps (TDD):**
- [ ] **Step 1 (test):** Add `app/src/test/kotlin/com/pejvak/app/domain/PlaybackConditionsTest.kt`:
  - `session.playbackConditions()` on a bare session returns the documented defaults (`volumePercent == 100`, `ambientTone == "none"`, `enhancerEnabled == false`, `collectionSort == Unknown`).
  - A session with fields set returns them preserved; `volumePercent`/`ambientLevel`/index/size are passed through.
  - `HistoryItem.collectionKind()` returns `Standalone` when `contextType == null`, `Collection` otherwise.
- [ ] **Step 2 (run):** `./gradlew testDebugUnitTest --tests com.pejvak.app.domain.PlaybackConditionsTest`. **Expected:** FAIL (functions don't exist yet).
- [ ] **Step 3 (mapper test + impl):** Add the 11 columns to `SessionEntity` and `Session`, add `app/src/test/kotlin/com/pejvak/app/data/local/MappersTest.kt` cases (`Session.toEntity().toDomain()` round-trip preserves new fields; `toEntity()` writes null for nulls; defaults applied by `playbackConditions()` not the entity).
- [ ] **Step 4 (run):** confirm new mapper tests **FAIL**.
- [ ] **Step 5 (migrate + entity + impl):** In `SessionEntities.kt` add columns (nullable, e.g. `context_title TEXT`, `collection_sort TEXT`, `collection_sort_direction TEXT`, `collection_index INTEGER`, `collection_size INTEGER`, `ambient_tone TEXT`, `ambient_level INTEGER`, `volume_percent INTEGER`, `enhancer_enabled INTEGER`, `enhancer_boost_db REAL`, `enhancer_bass_db REAL`, `enhancer_treble_db REAL`); add these to the `sessions` @Entity. In `Mappers.kt`, map each way with `playbackConditions()` normalization. Set `PejvakDatabase.version = 2`.
- [ ] **Step 6 (commit):** Run `./gradlew assembleDebug` to generate `android/app/schemas/com.pejvak.app.data.local.PejvakDatabase/2.json`; then:
```
git add android/app/src/main/kotlin/com/pejvak/app/data/local/SessionEntities.kt android/app/src/main/kotlin/com/pejvak/app/data/local/PejvakDatabase.kt android/app/src/main/kotlin/com/pejvak/app/data/local/Mappers.kt android/app/src/main/kotlin/com/pejvak/app/domain/Models.kt android/app/src/main/kotlin/com/pejvak/app/domain/PlaybackConditions.kt android/app/src/main/kotlin/com/pejvak/app/di/AppModule.kt android/app/schemas/com.pejvak.app.data.local.PejvakDatabase/2.json
git commit -m ":sparkles: android: Add playback-context snapshot to session history"
```
  Then: `git add android/app/src/test/kotlin/com/pejvak/app/domain/PlaybackConditionsTest.kt android/app/src/test/kotlin/com/pejvak/app/data/local/MappersTest.kt` and a follow-up commit:
```
git commit -m ":white_check_mark: android: Tests for playback-context snapshot"
```

### Task 4: Android capture — engine provider, service wiring, call-site sort values

**Files:** `PlaybackState.kt`, `PlaybackEngine.kt`, `PlaybackService.kt`, `domain/PlaybackConditions.kt`, `ui/screens/playlist/PlaylistDetailViewModel.kt`, `ui/screens/folder/FolderDetailViewModel.kt`, `ui/screens/smart/SmartPlaylistViewModel.kt`, `ui/screens/online/OnlineCollectionViewModel.kt`, `ui/screens/library/LibraryViewModel.kt`, `data/repository/PlaylistRepository.kt`, `domain/Reconcile.kt` (sessions pull mapping, later).

**Interfaces:**
- `PlaybackContext` (playback) + `sort: CollectionSort = Unknown`, `direction: SortDirection = Asc`.
- `PlaybackEngine` + `var conditionsProvider: (() -> PlaybackConditions)? = null`.
- In `beginSession`, compute `PlaybackConditions`:
```
val run = activeRun
val conditions = conditionsProvider?.invoke()
  ?: PlaybackConditions(
      contextTitle = run?.context?.title,
      collectionSort = run?.context?.sort,
      collectionSortDirection = run?.context?.direction,
      collectionIndex = _state.value.queueIndex,
      collectionSize = _state.value.queue.size,
    )
```
  then `store.insertSession(session.copy(contextTitle = conditions.contextTitle, collectionSort = conditions.collectionSort, collectionSortDirection = conditions.collectionSortDirection, collectionIndex = conditions.collectionIndex, collectionSize = conditions.collectionSize, ambientTone = conditions.ambientTone, ambientLevel = conditions.ambientLevel, volumePercent = conditions.volumePercent, enhancerEnabled = conditions.enhancerEnabled, enhancerBoostDb = conditions.enhancerBoostDb, enhancerBassDb = conditions.enhancerBassDb, enhancerTrebleDb = conditions.enhancerTrebleDb))`.
- `PlaybackService.onCreate`: set `engine.conditionsProvider = { PlaybackConditions(ambientTone = effects.state.value.toneId, ambientLevel = effects.state.value.toneLevel, volumePercent = effects.state.value.volume, enhancerEnabled = effects.state.value.enhancer.enabled, enhancerBoostDb = effects.state.value.enhancer.boostDb, enhancerBassDb = effects.state.value.enhancer.bassDb, enhancerTrebleDb = effects.state.value.enhancer.trebleDb) }`.
- Call sites pass `sort`:
  - `PlaylistDetailViewModel.play`: `PlaybackContext(ContextType.Playlist, playlist.id, playlist.title, CollectionSort.Manual)`.
  - `PlaylistRepository.contextFor` (domain) returns `PlaybackContext(Playlist, ...)` — the playback copy. Map sort in `LibraryViewModel.playPlaylist` where it builds `com.pejvak.app.playback.PlaybackContext(it.type, it.key, it.title)` → add `it.sort` if domain PlaybackContext carries it. Update domain `PlaybackContext` too with `sort`/`direction` (defaults).
  - `FolderDetailViewModel.play`: `PlaybackContext(ContextType.Folder, folderKey, name, CollectionSort.Folder, SortDirection.Asc)` — but if `mode == Shuffle`, use `CollectionSort.Shuffle`.
  - `SmartPlaylistViewModel.play`: `PlaybackContext(ContextType.Playlist, "smart:...", title, CollectionSort.Smart)`.
  - `OnlineCollectionViewModel.play`: `PlaybackContext(ContextType.Online, key, title, CollectionSort.Source)`.
  - `LibraryViewModel.playTrack` (standalone) and `playFolder`/`playPlaylist` — set `CollectionSort` as above; `LibraryViewModel.playTrack` with a queue stays standalone (context null) — accept `context` param already present (defaults null).
  - `HistoryViewModel.resumeSession` etc.: pass `CollectionSort.Unknown` (or omit — already default).

**Steps (TDD):**
- [ ] **Step 1 (test):** Add to `PlaybackEngineTest` a new test `sessionCapturesPlaybackConditions`:
  - Setup: `engine.conditionsProvider = { PlaybackConditions(ambientTone = "forest", ambientLevel = 35, volumePercent = 70, enhancerEnabled = true, enhancerBoostDb = 3.0, enhancerBassDb = 2.0, enhancerTrebleDb = 1.0) }`.
  - `store.tracks["t1"] = track("t1")`.
  - `engine.loadAndPlay(t1, 0, queue = listOf("t1", "t2"), index = 0)` where `t2` is also added to store.
  - `engine.onPlayerProgress(0, 600, true, false, 1000)`.
  - Assert `store.sessions.values.first().playbackConditions().ambientTone == "forest"`, `.ambientLevel == 35`, `.volumePercent == 70`, `.enhancerEnabled == true`, `.enhancerBoostDb == 3.0`, `.enhancerBassDb == 2.0`, `.enhancerTrebleDb == 1.0`.
  - [ ] **Step 2 (run):** FAIL (no such API/fields).
  - [ ] **Step 3 (impl):** Apply domain + engine + service + call-site changes above.
  - [ ] **Step 4 (run):** `./gradlew testDebugUnitTest --tests com.pejvak.app.playback.PlaybackEngineTest`. **Expected:** PASS.
  - [ ] **Step 5 (commit):**
```
git add android/app/src/main/kotlin/com/pejvak/app/playback/ android/app/src/main/kotlin/com/pejvak/app/domain/ android/app/src/main/kotlin/com/pejvak/app/ui/screens/ android/app/src/main/kotlin/com/pejvak/app/data/repository/ android/app/src/test/kotlin/com/pejvak/app/playback/PlaybackEngineTest.kt
git commit -m ":sparkles: android: Capture playback context on session start"
```
  Append progress-log entry to `android/docs/plans/01-native-rewrite.md`.

### Task 5: Android sync — push/pull of snapshot

**Files:** `LesanSyncTransport.kt`, `domain/Reconcile.kt`, `SyncRepository.kt`.

**Interfaces:**
- `RemoteSession` + `contextTitle: String?`, `collectionSort: CollectionSort?`, `collectionSortDirection: SortDirection?`, `collectionIndex: Int?`, `collectionSize: Int?`, `ambientTone: String?`, `ambientLevel: Int?`, `volumePercent: Int?`, `enhancerEnabled: Boolean?`, `enhancerBoostDb: Double?`, `enhancerBassDb: Double?`, `enhancerTrebleDb: Double?`.
- `syncLocalData` session JSON: add the 11 keys (omit when null, or send `null`; omitting is cleaner — Lesan `optional`).
- `fetchRemoteSessions`: add the 11 keys to `get` projection and parse into `RemoteSession`.
- `SyncRepository` session insert: set the fields from `item` onto the new `Session`.
- `reconcileSessions` unchanged (still by clientId).

**Steps:**
- [ ] **Step 1 (impl):** Add transport push JSON keys; `get` projection in `fetchRemoteSessions`; parse with safe accessors (reuse pattern from `fetchRemoteTracks`).
- [ ] **Step 2 (impl):** `RemoteSession` fields + `SyncRepository` insert mapping.
- [ ] **Step 3 (run):** `./gradlew testDebugUnitTest` (existing sync tests must stay green). **Expected:** PASS.
- [ ] **Step 4 (commit):**
```
git add android/app/src/main/kotlin/com/pejvak/app/data/sync/ android/app/src/main/kotlin/com/pejvak/app/domain/Reconcile.kt
git commit -m ":sparkles: android: Sync playback-context snapshot with sessions"
```

### Task 6: Android UI — history detail + markdown

**Files:** `SessionDetailSheet.kt`, `History.kt` (markdown), `res/values/strings.xml`.

**Steps:**
- [ ] **Step 1 (impl):** In `SessionDetailSheet`, after the existing facts, render a Playback-Context card using `val cond = session.playbackConditions()` and strings:
  - `history_fact_collection_kind` ("Collection" / "Standalone") — always.
  - `history_fact_collection_title` — when `session.contextTitle != null` or non-standalone.
  - `history_fact_order` — when `cond.collectionSort != CollectionSort.Unknown`: format `"collectionSort.label · direction · \"index of size\""` via `describePlaybackConditions`.
  - `history_fact_ambience` — when `cond.ambientTone != "none" || cond.ambientLevel > 0`.
  - `history_fact_volume` — always.
  - `history_fact_enhancer` — when `cond.enhancerEnabled` (or non-zero gains): boost/bass/treble.
  Use `Fact(...)` helper; keep all strings in `strings.xml`.
- [ ] **Step 2 (impl):** `historyMarkdown`: append `cond` context as an extra bullet, e.g. `— Collection · manual · 3 of 5 · forest · 30%`.
- [ ] **Step 3 (test):** Add `HistoryTest` cases for `describePlaybackConditions` + `playbackMarkdownContext` + `historyMarkdown` containing the context line.
- [ ] **Step 4 (run):** `./gradlew testDebugUnitTest`.
- [ ] **Step 5 (commit):**
```
git add android/app/src/main/kotlin/com/pejvak/app/ui/components/history/SessionDetailSheet.kt android/app/src/main/kotlin/com/pejvak/app/domain/History.kt android/app/src/main/res/values/strings.xml android/app/src/test/kotlin/com/pejvak/app/domain/HistoryTest.kt
git commit -m ":art: android: Show playback context in history"
```

---

## Android Verification

- `./gradlew assembleDebug` — build, wire up the new entity, migration, and UI.
- `./gradlew testDebugUnitTest` — all unit tests.
- Emulator: offline restore on a fresh reinstall shows collection/ambience/volume/enhancer on the history detail; rename a playlist; re-open the sheet.

---

## Review Focus Implementation Detail

| Risk | Where it's tested |
|---|---|
| Legacy rows show defaults, no crash | `PlaybackConditionsTest` + backend e2e legacy assertions |
| Mid-session settings don't rewrite history | `PlaybackEngineTest` snapshot is written at insert only |
| Deleted/renamed collections don't lose title | `contextTitle` captured at `beginSession`; asserted in `PlaybackEngineTest` |
| Resume records `0 of 1`, not the old position | `HistoryViewModel` passes `Unknown` sort + queue `index=0`; assert via `collectionIndex == 0` in tests |
| Kill recovery gives defaults | `PlaybackConditions()` default is `PlaybackConditions()`; `recoverOrphanedSessions` builds without provider — no crash path |

---

## Final Commit

- [ ] Commit the plan and design doc:
```
git add docs/superpowers/plans/2026-11-20-history-item-context.md docs/superpowers/specs/2026-11-20-history-item-context-design.md android/docs/plans/01-native-rewrite.md
git commit -m ":memo: docs: Add history-item playback context spec & plan"
```

---

## Self-Check (by the implementing worker, not me)

1. **Spec coverage:** Every line in the spec is in some task. (Wire fields on both sides; capture at start; standalone derivation; defaults; stretch-vs-session; no relations; sync/pull/push; UI + markdown; tests; ordering criteria; build/test; plan update.)
2. **Step scan:** Every step is one action with one checkable result. No "implement everything".
3. **Type consistency:** `Session.playbackConditions()` returns `PlaybackConditions`; `PlaybackContext.sort/direction` use the same `CollectionSort`/`SortDirection` from `domain/PlaybackConditions.kt`; `RemoteSession` uses the same types.
4. **TDD:** Each backend act has a hurl step; each Android piece has a `testDebugUnitTest` case.

**Execution recommendation:** **Subagent-driven** — many tasks are interdependent on each other's interfaces, and two failing UI pieces is worse than one failing hurl run. Use `superpowers:subagent-driven-development`.
