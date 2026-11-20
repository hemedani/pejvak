# Plan 03 — Collection-first playback

> **Status:** proposed · not started · depends on Plan 01's history-item-context work
> (the 12-field `Session` snapshot, `PlaybackContext` sort/direction, Room v2 and sync).
>
> **This is a living record.** Tick each box as it lands and append one entry to the
> [Progress log](#progress-log) after every small task. A future agent must be able to read the
> last log entry and know exactly where things stand. Where this plan and the code disagree,
> **the code is right and this file is a bug.**
>
> **Sector:** `android/` only. No backend change, no schema migration, no edits under `mobile/`.

---

## 1. Goal

Make the **collection the default playback unit**, and make a standalone track the exception.

Today a listener can tap one track in a folder, or resume one row from history, and the app
records a standalone session: no queue, no run, no sort, no auto-advance. That splits one
lecture into unrelated history rows and loses the conditions it was heard under. This plan fixes
that.

**Outcome:** every deliberate play of a local track or an online track resolves to a collection
first. A collection is detected automatically, converted automatically, resumed automatically,
and its conditions are inherited by the next item. Mid-session changes land on the **current**
history item. The player offers a clear sort control for folder and online runs.

## 2. Product rules (owner-confirmed)

These are requirements, not suggestions. Encode them in tests.

1. **A semantic folder is a collection.** A folder named after a specific lecture/episode and
   containing that content's audio is a collection.
2. **Generic containers are not collections.** Folders such as `Downloads`, `Music`, `Podcasts`,
   `Audio`, `Recordings`, `Telegram`, `WhatsApp`, `Ringtones`, `Alarms`, `Notifications` (and
   their common Persian equivalents — `دانلود`, `موسیقی`, `پادکست`, `صدا`, `ضبط`) hold stray files.
   Tracks directly in them stay standalone.
3. **Two audio tracks minimum.** A folder with one playable audio track is not a collection.
   Missing files do not count.
4. **No questions, no dialogs.** Detection, conversion and inheritance happen silently. There is
   no "Is this a collection?" prompt and no "Convert this session?" confirmation.
5. **Convert on resume.** Resuming a standalone history row whose track now sits in a semantic
   folder converts it to a folder collection starting at that track.
6. **Online is collection-first too.** A track carrying `collectionKey`/`collectionTitle` plays
   inside that online collection when its cached tracks are available. The collection key is
   authoritative even when only one track is cached.
7. **Mid-session changes update the current item.** Volume, ambient tone, enhancer and sort
   changes must patch the **active** `Session` snapshot (and the live queue for sort). They must
   never apply only to the next session.
8. **Inheritance.** Resuming a history item seeds the next item with everything the old item
   recorded: tone + level, volume, enhancer settings, playback speed, collection sort/direction,
   position and collection identity.
9. **Auto-advance inside a run.** Resuming any collection item rebuilds the collection queue and
   starts at that track, so finishing it advances to the next track of the same run.
10. **A sort control exists where it matters.** Folder and online playback show a clear,
    well-placed sort control in the player. Standalone/playlist playback does not.

## 3. What already exists (do not rebuild)

| Piece | Where | State |
|---|---|---|
| 12-field per-session snapshot (`contextTitle`, `collectionSort`, `collectionSortDirection`, `collectionIndex`, `collectionSize`, `ambientTone`, `ambientLevel`, `volumePercent`, `enhancer*`) | `domain/Models.kt`, `domain/PlaybackConditions.kt`, `data/local/SessionEntities.kt` | ✅ |
| Capture at `beginSession`, engine owns collection facts, provider overlays audio facts | `playback/PlaybackEngine.kt` | ✅ |
| `PlaybackContext(type, key, title, sort, direction)` in both domain and playback | `domain/PlaybackContext.kt`, `playback/PlaybackState.kt` | ✅ |
| Run reuse (`openRun` matches type + key), queue, auto-advance on finish | `playback/PlaybackEngine.kt` | ✅ |
| Folder plan (`Resume`/`Restart`/`Unfinished`/`Shuffle`), natural folder order | `domain/FolderPlay.kt`, `domain/MediaFolders.kt` | ✅ |
| Online collection key (`sourceId:externalId`), cached materialised tracks | `domain/OnlineModels.kt`, `data/repository/OnlineCatalogService.kt` | ✅ |
| Player context chip + chips row + `GlassChip` | `ui/screens/player/PlayerContent.kt`, `ui/components/GlassChip.kt` | ✅ |
| History detail context card | `ui/components/history/SessionDetailSheet.kt` | ✅ |

## 4. Gap analysis

| # | Gap | Current code |
|---|---|---|
| G1 | No semantic-folder classifier | none |
| G2 | Playing one library track ignores its folder | `LibraryViewModel.playTrack` passes `context = null`, `queue = visible list` |
| G3 | Playing one track from Track detail / Notes is always standalone | `TrackDetailViewModel.play`, `NotesViewModel` |
| G4 | History resume keeps the old context string but supplies no queue | `HistoryViewModel.resumeSession/resumeStretch/resumeRun` |
| G5 | Standalone resume never converts | same |
| G6 | No inheritance of tone/volume/enhancer/speed/sort | resume only passes the position |
| G7 | Mid-session effects changes do not touch the active session | `AudioEffectsController` writes prefs; engine never refreshes the row |
| G8 | No sort engine beyond folder-natural/shuffle | `buildFolderPlan` |
| G9 | No sort UI in the player | `PlayerChipRow` has no sort chip |
| G10 | `resumeRun` has no sort (the run row does not store it) | must read the run's latest session |
| G11 | Set of play entry points is duplicated and inconsistent | 9 `engine.loadAndPlay` call sites |

## 5. Design

### 5.1 Semantic folder classifier (pure domain)

New `domain/SemanticFolders.kt`:

```kotlin
data class CollectionFolder(val key: String, val name: String, val tracks: List<Track>)

/** Generic container names, normalized: lowercase, trimmed, collapsed whitespace. */
val GENERIC_FOLDER_NAMES: Set<String>

fun isGenericFolderName(name: String?): Boolean
fun isSemanticFolder(folderKey: String?, folderName: String?, playable: List<Track>): Boolean
fun resolveFolderCollection(track: Track, folderTracks: List<Track>): CollectionFolder?
```

Rules:
- `folderKey == null` or `""` (storage root / `Internal storage`) → not a collection.
- `playable` = tracks in the folder with `availability != Missing` and `origin == Local`.
- `playable.size >= 2` required.
- `isGenericFolderName(folderName ?: folderNameFromKey(folderKey))` → not a collection.
- Normalisation must handle case, surrounding whitespace, duplicated spaces, and a trailing slash
  in the key. Persian names are compared as-is after normalisation.
- A folder **inside** a generic folder still counts. Only the folder's own last segment is
  classified (`Download/Lecture 05` is semantic; `Download` is not).

### 5.2 Collection ordering (pure domain)

New `domain/CollectionOrder.kt`:

```kotlin
fun collectionSortOptions(type: ContextType): List<CollectionSort>
fun orderCollectionTracks(
    tracks: List<Track>,
    sort: CollectionSort,
    direction: SortDirection,
    random: () -> Double = { Math.random() },
): List<Track>
```

- Folder options: `Folder` (natural file order), `Name`, `Duration`, `Shuffle`.
- Online options: `Source` (source order), `Name`, `Duration`, `Shuffle`.
- `Asc`/`Desc` reverse the ordered result. `Shuffle` ignores direction.
- Deterministic tie-breakers: `title` then `id`, so ordering never flickers.
- `Folder` delegates to `orderByFolder`; `Source` keeps the incoming source order.
- `Name` compares with `naturalCompare` (so `Episode 2` < `Episode 10`).
- `Duration` compares `durationSec`.
- `Shuffle` uses the existing seeded `shuffleTracks`.

Extend `FolderPlayOptions` with `sort: CollectionSort = CollectionSort.Folder` and
`direction: SortDirection = SortDirection.Asc`, and make `buildFolderPlan` order with
`orderCollectionTracks` **before** applying the mode:
- `Folder`/`Name`/`Duration` keep their order, `Desc` reverses it.
- `Shuffle` is the existing random plan.
- `Resume` picks the first unfinished track in the chosen order; `Restart` starts at 0;
  `Unfinished` filters to unfinished.
- Keep excluding missing tracks and keep `missingCount`.

### 5.3 Resolution and launch (one shared entry point)

New `data/repository/CollectionPlaybackLauncher.kt` (or `playback/`; keep it injectable and
Android-light):

```kotlin
class CollectionPlaybackLauncher @Inject constructor(
    private val engine: PlaybackEngine,
    private val effects: AudioEffectsController,
    private val library: LibraryRepository,
    private val catalog: OnlineCatalogService,
) {
    suspend fun playResolved(
        track: Track,
        positionSec: Int = 0,
        inherit: PlaybackConditions? = null,
        fallbackQueue: List<String>? = null,
        fallbackIndex: Int = 0,
    )
    suspend fun playFolder(
        folderKey: String, folderName: String,
        mode: FolderPlayMode, sort: CollectionSort, direction: SortDirection,
        startTrackId: String? = null, startPositionSec: Int = 0,
    )
    suspend fun playOnline(
        collectionKey: String, title: String,
        startTrackId: String? = null, startPositionSec: Int = 0,
        sort: CollectionSort = CollectionSort.Source, direction: SortDirection = SortDirection.Asc,
    )
}
```

`playResolved` algorithm:
1. If `inherit != null`, apply it first (see §5.5).
2. `Online` + `track.collectionKey != null`: load cached tracks via
   `catalog.tracksForCollection(key)`; if non-empty → `PlaybackContext(Online, key, title, sort,
   direction)`, queue `orderCollectionTracks(cached, sort, direction)`, index of `track.id`
   (fallback 0). Else fall through.
3. `Local` + `folderKey != null`: `library.tracksInFolder(folderKey)`; if
   `resolveFolderCollection` returns non-null → `PlaybackContext(Folder, key, name, sort,
   direction)`, queue ordered, index of `track.id`.
4. Otherwise use the caller's `fallbackQueue`/`fallbackIndex` and the caller's context (or null)
   — the existing standalone behaviour.
5. `engine.loadAndPlay(track, positionSec, context, queue, index)`.

Every current play site routes through this launcher (see §6). Folder detail, online detail,
playlist detail and smart playlist keep supplying their explicit context/queue; only their
ordering/sort wiring changes.

### 5.4 Auto-conversion on resume

`HistoryViewModel` resolves the item from the local DB, then calls the launcher:

- **Session resume:** start with `session` snapshot as `inherit`. Resolve the track. If the
  session had `Folder` context and the folder is still semantic, rebuild the folder queue and
  start at the session track/position. If the session was standalone but the track now sits in a
  semantic folder, convert to `Folder`. If it was `Online` and cached tracks exist, rebuild the
  online queue. Otherwise remain standalone (single-track queue, context null) — this is the only
  case where the old context/facts are not reproducible.
- **Stretch resume:** use the resumed entry's session for inheritance and the same resolution.
- **Run resume:** load the run's latest session (`contextPlayId == run.id`) to recover
  sort/direction and audio facts, then resolve like a session resume. If no session is found,
  default the sort from the context type (`Folder` / `Source`) and keep the run title.

The old `resumeSession` using `item.session.contextType` and no queue is removed.

### 5.5 Inheritance

Add a small pure helper and a launcher step:

```kotlin
fun PlaybackConditions.forInheritance(): PlaybackConditions // normalized
```

Before the first `loadAndPlay`:
1. `effects.setTone(conditions.ambientTone)` (skip `"none"` / level 0 semantics — use
   `capturedAmbientTone`).
2. `effects.setToneLevel(conditions.ambientLevel)`.
3. `effects.setVolume(conditions.volumePercent)`.
4. `effects.setEnhancer(enabled, boost, bass, treble)`.
5. `engine.setVolume(conditions.volumePercent)`.
6. `engine.setSpeed(session.playbackSpeed)` (from the resumed session; keep the current speed when
   no session speed is known).

**Decision D5:** inheritance is applied to the real effects controller, so the new session's
snapshot tells the truth about what was heard. Because that controller persists device prefs,
resuming an old item also restores those settings as the current device state. Rejected
alternative: a transient override that leaves prefs untouched — it would make the snapshot claim
audio conditions that are not actually applied, or require threading a second conditions channel
through `beginSession`. Revisit only if the owner objects.

### 5.6 Mid-session condition updates

Storage:
- Add `SessionDao.updateConditions(...)` with an explicit `@Query` that sets the audio fields +
  `updated_at` + `sync_status = 'pending'` for one id. Do **not** call the full `upsert`, which
  would clobber finalization columns.
- Add `PlaybackStore.updateSessionConditions(id, conditions, at)` and implement it in
  `RoomPlaybackStore`.
- Add `SessionDao.updateCollectionOrder(...)` (sort, direction, index, size, `updated_at`,
  `sync_status`) or one combined query. Keep the two concerns separate so audio changes do not
  rewrite order fields.

Engine:
- `suspend fun refreshActiveConditions()`: if `active == null` return. Build the snapshot exactly
  like `beginSession` (run facts + provider overlay), compare with the last written snapshot, and
  write only on change. `PlaybackService` collects `effects.state` (distinct) and calls this; the
  `setVolume`/tone/enhancer setters are already routed through `AudioEffectsController`.
- `suspend fun setCollectionSort(sort: CollectionSort, direction: SortDirection)`: if there is no
  active run, just update the state's context (if any) and return. Otherwise:
  1. Remember the current track id.
  2. Rebuild the queue from the current queue's tracks using `orderCollectionTracks` (look each id
     up via `store.getTrack`; drop ids that no longer resolve).
  3. Keep the same track playing; recompute `queueIndex` by id.
  4. Copy `state.context` with the new sort/direction.
  5. Update the active run's in-memory context (title/key unchanged).
  6. Patch the active session's `collection_sort`, `collection_sort_direction`,
     `collection_index`, `collection_size`.
  7. Do not call `command.loadAndPlay`, do not finalize the session, do not touch the position.
- `beginSession` already records `collectionIndex`/`collectionSize` from the live queue. After a
  sort change, the **next** session uses the new order; the current one is patched.

Debounce: `refreshActiveConditions` is called on every effects emission. Compare the normalized
snapshot with the last one written for the active session id and skip identical writes. Slider
drags must not produce a DB write per pixel.

### 5.7 Player sort control

- `PlayerViewModel` gains:
  - `val sortOptions: StateFlow<List<CollectionSort>>` derived from `engine.state.context?.type`.
  - `fun setCollectionSort(sort: CollectionSort, direction: SortDirection)`.
  - `fun cycleCollectionSort()` (optional convenience: next option, keep direction).
- `PlayerContent` gains `onOpenSort: () -> Unit` and renders one extra `GlassChip` in the existing
  `PlayerChipRow` **immediately after the context chip**, only when
  `context.type == Folder || context.type == Online` and `state.queue.size > 1`.
  - Label: native name (`Folder`, `Source`, `Name`, `Duration`, `Shuffle`) + direction arrow
    (`↑`/`↓`; none for shuffle). Icon: `"sort"`.
- `NowPlayingSheet` passes the callback and hosts a `GlassSheet` with:
  - the available sorts as selectable rows,
  - an Asc/Desc segmented control (hidden for shuffle),
  - selecting applies immediately and closes the sheet (or keeps it open; pick one and be
    consistent).
- All new strings in `res/values/strings.xml`. No hard-coded UI text.
- Do not add the chip for `Playlist` or standalone playback.

### 5.8 Invariants to preserve

- Integer seconds everywhere; no float positions.
- Local-first: resolution reads Room only; network is never required to resume.
- Never block the UI; resolution is on `Dispatchers.IO` where it touches the DB.
- A missing resumed track must not crash: fall back to the first available track in the
  collection, else standalone at position 0.
- `openRun` must reuse the open run for the same `(type, key)`; do not create duplicate runs.
- Standalone remains a first-class outcome when no collection can be resolved.
- Sync contract unchanged: patched sessions are `pending` and travel on the next batch.
- No new `CollectionSort` values and no schema change. If a new field is ever needed, it is a
  Room migration and a backend contract change — out of scope.

## 6. Phases and tasks

Legend: `[ ]` not started · `[x]` done. A phase is done only when its **Done when** line is
verified, not when boxes are ticked.

### Phase A — pure domain

- [x] A1. Add `domain/SemanticFolders.kt` (normalisation, generic set, `isSemanticFolder`,
      `resolveFolderCollection`).
- [x] A2. Add `domain/CollectionOrder.kt` (`collectionSortOptions`, `orderCollectionTracks`).
- [x] A3. Extend `FolderPlayOptions` + `buildFolderPlan` with sort/direction; keep all existing
      mode behaviour and missing-file handling.
- [x] A4. Add `PlaybackConditions.forInheritance()` / normalization helper if needed.
- [x] A5. Tests:
      `SemanticFoldersTest`, `CollectionOrderTest`, extend `FolderPlayTest`,
      `PlaybackConditionsTest`.

**Done when:** the new pure tests pass and no existing domain test regresses.

### Phase B — storage + engine

- [x] B1. `SessionDao`: `updateConditions`, `updateCollectionOrder` (explicit `@Query`, bump
      `updated_at`, set `sync_status = 'pending'`).
- [x] B2. `PlaybackStore` + `RoomPlaybackStore`: implement both.
- [x] B3. `PlaybackEngine.refreshActiveConditions()` with last-written comparison.
- [x] B4. `PlaybackEngine.setCollectionSort()` (reorder, keep current track, patch session, no
      reload). Use a shared pure queue-reorder helper so it is unit-testable.
- [x] B5. `PlaybackService`: collect `effects.state` (distinct) while a session is active and call
      `refreshActiveConditions()`; keep the existing provider behaviour for new sessions.
- [x] B6. Tests in `PlaybackEngineTest`:
      sort reorders the queue and keeps the same track playing; the active session row is patched
      and stays pending; `refreshActiveConditions` patches only the active session; the next
      session uses the new values; identical snapshots produce no extra write.

**Done when:** engine tests pass and `assembleDebug` compiles the DAO changes.

### Phase C — one launcher, all play sites

- [x] C1. Add `CollectionPlaybackLauncher` (§5.3). Inject it where needed.
- [x] C2. `LibraryViewModel.playTrack` → launcher `playResolved` (folder/online first).
      Keep the visible-list fallback for true standalone tracks.
- [x] C3. `LibraryViewModel.playFolder` → launcher `playFolder`, passing the selected sort +
      direction (default `Folder`/`Asc`).
- [x] C4. `FolderDetailViewModel` → add sort/direction to `FolderDetailUiState` + a selector if the
      screen already has a mode selector; pass them to `playFolder` and to `PlaybackContext`.
- [x] C5. `OnlineCollectionViewModel.play` → `loadCollection` ordering through
      `orderCollectionTracks` (`Source` default), context carries sort/direction.
- [x] C6. `TrackDetailViewModel.play`, `NotesViewModel` play-at-note, and
      `PlayerViewModel` single-track play → launcher `playResolved`.
- [x] C7. Playlist / smart-playlist sites keep their explicit queue/context; only adapt to the
      launcher signature (no behaviour change).
- [x] C8. Tests for resolution: generic folder → standalone; 1 track → standalone; ≥2 → folder
      queue; online collectionKey with cached tracks → online queue; missing resumed track →
      fallback.

**Done when:** every `engine.loadAndPlay` call in a ViewModel goes through the launcher (or is an
explicit folder/online/playlist path), and the resolution tests pass.

### Phase D — resume + inheritance

- [x] D1. `HistoryViewModel.resumeSession`: build `inherit` from `session.playbackConditions()`,
      resolve through the launcher, remove the old context-only path.
- [x] D2. `resumeStretch`: same using the resumed entry's session.
- [x] D3. `resumeRun`: recover sort/direction from the run's latest session; resolve through the
      launcher; keep the run title/key.
- [x] D4. Add the run→latest-session lookup (`ContextPlayRepository` or `LibraryRepository`) and
      test it.
- [x] D5. Verify inheritance applies speed + volume + tone + enhancer before the first
      `loadAndPlay`, so the new `Session` row records the inherited values.
- [x] D6. Tests: standalone→folder conversion; folder→folder resume with queue; online→online;
      legacy null sort defaults; inheritance values appear on the new session.

**Done when:** resuming each of the three history shapes starts a collection run where possible,
auto-advance works, and the new session's snapshot equals the inherited values.

### Phase E — player sort UI

- [x] E1. `PlayerViewModel`: `sortOptions`, `setCollectionSort`, optional `cycleCollectionSort`.
- [x] E2. `PlayerContent`: sort chip after the context chip (Folder/Online, queue > 1); visual
      weight per `DESING.md`; 44 dp target; haptic via `GlassChip`.
- [x] E3. `NowPlayingSheet`: sort sheet with options + direction control; wire callbacks.
- [x] E4. Strings in `strings.xml`; add a format test for the chip label (arrow logic).
- [x] E5. Emulator check: dark + light, playing + paused, Folder and Online, Persian title,
      320 dp, motion on/off.

**Done when:** changing the sort from the player reorders the live queue, keeps the current track
playing, updates the current history row, and the next session records the new order.

### Phase F — verification and record

- [x] F1. `./gradlew testDebugUnitTest` green.
- [x] F2. `./gradlew assembleDebug` green.
- [ ] F3. Manual pass on emulator (partially done: online collection, auto-advance, live sort verified; local folder fixtures absent on the test device): library single-track → folder run + auto-advance; generic
      Downloads stays standalone; single-track folder stays standalone; resume standalone history
      → converts; resume inherits tone/volume/enhancer/speed/sort; online track → online run;
      sort change mid-play patches the current item; kill/relaunch keeps the run recoverable.
- [x] F4. Update `android/docs/summary.md` status row and append the progress log.

**Done when:** F1–F3 are verified with output, and the plan is updated.

### Phase G — realtime list reorder (owner follow-up)

- [x] G1. Pure `orderCollectionRows(items, orderedIds, id)` + test: rows follow the plan/queue order,
      excluded rows (missing, finished in Unfinished mode) stay at the end.
- [x] G2. `FolderDetailViewModel`: every sort/mode change rebuilds the plan once and reorders `rows`
      from it; `play` hands that same plan to `playFolder`, so a shuffle cannot diverge from the list.
- [x] G3. `OnlineCollectionViewModel`: sort/direction in state, `setSort`, ordering applied on load and
      reload; chip + `CollectionSortSheet` on the collection screen; `playOnline` accepts the visible
      order (`orderedTracks`) so shuffle matches the rows.
- [x] G4. `testDebugUnitTest` + `assembleDebug` green; online chip verified on the emulator
      (Source ↑ → Name ↓ reorders the visible sections). Folder rows blocked: this install has no
      imported folders.

**Done when:** tapping a sort option reorders the visible list at once, and the row order matches the
queue for the same tap.

## 7. Test map

| Test | Covers |
|---|---|
| `SemanticFoldersTest` | generic names (en + fa), root, trailing slash, case/space, 1 vs 2 tracks, missing excluded, nested inside generic |
| `CollectionOrderTest` | Folder/Name/Duration/Source/Shuffle, Asc/Desc, natural numbers, stable ties, seeded shuffle |
| `FolderPlayTest` (extend) | sort + direction in Resume/Restart/Unfinished/Shuffle, missing excluded, start index |
| `PlaybackConditionsTest` (extend) | inheritance normalization, mid-session patch values, legacy defaults |
| `PlaybackEngineTest` (extend) | `setCollectionSort`, `refreshActiveConditions`, next-session capture, no reload, run reuse |
| `HistoryTest` / new resume test | standalone→folder, sort recovery from the run's latest session |
| `PlayerFormatTest` (extend) | sort chip label + arrow |
| `MappersTest` (extend) | updated condition columns round-trip |

## 8. Verification commands

```bash
export JAVA_HOME=/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd android
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

No `deno`, no backend suite, no `front` — this plan does not change the wire contract.

## 9. Risks and edge cases

| Risk | Mitigation |
|---|---|
| Reordering the queue mid-play loses the current track | Reorder by track id, recompute the index by id, never reload |
| Effect-slider writes flood Room | `refreshActiveConditions` compares with the last written snapshot and skips no-ops |
| Resuming an old item overwrites current device prefs | Accepted by D5; document in the log; revisit only if the owner objects |
| Legacy rows have null sort | Default to `Folder` for folder contexts, `Source` for online, `Unknown` only for standalone |
| Online cached tracks empty (offline, never opened) | Fall back to standalone; do not hit the network on resume |
| Generic folder with many tracks is misclassified | Explicit normalized blocklist + tests; only the folder's own last segment is checked |
| Folder keys contain spaces / non-ASCII | Keep using the existing encoded route handling; do not regress `Uri.encode` |
| A missing resumed track | Fall back to the first available collection track, else standalone at 0 |
| Duplicate runs | `openRun` already matches type + key; do not bypass it |
| Sort chip shows for playlists | Gate on `Folder`/`Online` only |
| `mobile/` or `back/` drift | Do not touch either; this is an `android/` feature |

## 10. Decisions

| ID | Decision | Rationale | Status |
|---|---|---|---|
| C1 | Collection-first resolution lives in one `CollectionPlaybackLauncher`, not in each ViewModel | 11 play sites already diverge; one resolver keeps behaviour consistent | proposed |
| C2 | Semantic detection = non-generic last path segment + ≥2 available local tracks | Matches the owner's "named lecture / generic Downloads" rule and is testable | proposed |
| C3 | Folder/online sort is a first-class `CollectionSort` + `SortDirection` on the live context and the session snapshot | Reuses Plan 01's 12-field contract; no schema change | proposed |
| C4 | Mid-session audio changes patch the active `Session` row; sort changes also reorder the live queue | Owner: "MUST update the current history item (not the next)" | proposed |
| C5 | Inheritance is applied to the real effects controller (and therefore persists device prefs) | The snapshot must describe what was actually heard; simplest truthful path | proposed |
| C6 | Folder options `Folder/Name/Duration/Shuffle`; online options `Source/Name/Duration/Shuffle` | Small, meaningful set; every option maps to an existing enum value | proposed |
| C7 | The sort control is a chip next to the context chip, opening a `GlassSheet` | Reuses the player's existing chip/sheet language; no new chrome | proposed |
| C8 | No backend change, no Room migration | All fields already exist and sync | proposed |
| C9 | Online is collection-first whenever `collectionKey` is present; the ≥2 rule is folder-only | An online collection is explicit metadata, not a disk heuristic | proposed |

## 11. Out of scope

- Backend acts, sync wire format, history quota.
- Room schema changes or migrations.
- `mobile/` (React Native) and `front/` (Next.js).
- AI features.
- Playlist sort controls (playlists already carry `Manual`/`Smart`).
- Changing the `History` screen's visual layout beyond reflecting the patched facts.

## 12. Progress log

| Date | Task | What changed | Decisions / notes |
|---|---|---|---|
| 2026-11-20 | G1–G4 | Collection screens reorder live: shared `orderCollectionRows`, folder rows rebuilt from the same plan handed to the launcher, online sort state + chip/sheet, `playOnline(orderedTracks)` | Owner follow-up: sort used to only change the queue; the list now follows the same order, including shuffle. Emulator: online Art of War Source ↑ → Name ↓ reordered the sections at once |
| 2026-11-20 | C1–C8 | `CollectionPlaybackLauncher` + pure `resolvePlaybackCollection`; all library/track/notes/player/folder/online sites routed; folder-detail sort selector; resolution tests | Playlist sites keep their explicit context; launcher never bypasses `openRun` |
| 2026-11-20 | D1–D6 | History session/stretch/run resume through the launcher with `playbackConditions()` inherited; run sort recovered from its latest session; `ResumeSeedTest` | Inheritance applies to real effects before the first load, so the new row is truthful |
| 2026-11-20 | E1–E5 | Sort chip after the context chip + shared `CollectionSortSheet`; label/arrow test; emulator verified online (Source/Name, Asc/Desc reorder keeps track and position) | Local-folder visual pass blocked: emulator has no imported folders |
| 2026-11-20 | F1–F2, F4 | `testDebugUnitTest` green, `assembleDebug` green, summary + this log updated | F3 remains partial until a device with a real folder is used |
| 2026-11-20 | B1–B6 | SessionDao narrow UPDATEs, store methods, engine reorder + live patch, service debounced collector, engine tests | Patches only the playing row, never a full upsert |
| 2026-11-20 | A1–A5 | Semantic folder classifier, collection ordering, folder plan sort/direction, inheritance normaliser + tests | Pure domain only; shared order helper keeps plan and queue consistent |
