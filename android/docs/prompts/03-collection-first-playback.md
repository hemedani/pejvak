# Prompt 03 — Collection-first playback

> Brief for the implementing agent. The plan (`../plans/03-collection-first-playback.md`) is the
> record and the source of truth; if the code and this brief disagree, the plan wins, and if the
> plan and the code disagree, **the code is right and the plan is a bug**. Update the plan as you
> go.

## What you are building

The Android app currently lets a listener play or resume a **single** track, which records a
standalone history item with no queue, no run, no sort and no auto-advance. This feature makes the
**collection the default playback unit**: a folder named after a lecture (or an online collection)
is auto-detected, auto-converted, and resumed as a queue; the next history item inherits the
previous item's conditions; and changes made mid-session land on the **current** history item.

Read the plan first. It contains the full design, algorithms, file map, phases and test map.

## Read before editing

1. `android/docs/plans/03-collection-first-playback.md` — the spec (read all of it).
2. `android/AGENTS.md` — sector rules, build quirks, design system, test commands.
3. Root `AGENTS.md` — domain invariants (integer seconds, contentHash, offline-first, no `any`
   analog, `mobile/` is deprecated and must not be touched).
4. `android/docs/summary.md` §2–§5 — current status, stack, build quirks.
5. The foundation already on `main`:
   - `domain/PlaybackConditions.kt` (12-field snapshot, `CollectionSort`, `SortDirection`,
     `Session.playbackConditions()`).
   - `playback/PlaybackEngine.kt` (`beginSession`, `conditionsProvider`, `openRun`, queue,
     `advanceAfterFinish`).
   - `domain/FolderPlay.kt`, `domain/MediaFolders.kt`.
   - `ui/screens/player/PlayerContent.kt` + `NowPlayingSheet.kt` (chip row, context chip).
   - `ui/screens/history/HistoryViewModel.kt` (`resumeSession`, `resumeStretch`, `resumeRun`).

## Non-negotiable product rules

1. **Semantic folder** = named after a specific lecture/episode, containing ≥2 available local
   audio tracks. Generic containers (`Downloads`, `Music`, `Podcasts`, `Audio`, `Recordings`,
   `Telegram`, `WhatsApp`, `Ringtones`, `Alarms`, `Notifications`, `دانلود`, `موسیقی`, `پادکست`,
   `صدا`, `ضبط`) never count. Storage root never counts. Missing files never count.
2. **Two tracks minimum** for a folder. One-track folders stay standalone.
3. **Online is collection-first** whenever the track carries `collectionKey`/`collectionTitle`; use
   its cached tracks. The ≥2 rule is folder-only. Never require the network to resume.
4. **No prompts.** Detection, conversion, inheritance and sorting are silent. No confirmation
   dialogs.
5. **Convert on resume.** A standalone history item whose track now lives in a semantic folder
   resumes as that folder's run starting at that track.
6. **Mid-session changes update the current item.** Volume, tone, enhancer and sort changes patch
   the active `Session` snapshot; sort also reorders the live queue. They must not apply only to
   the next session.
7. **Inheritance.** Resuming a history item applies its tone/level, volume, enhancer, speed,
   sort/direction, position and collection identity before the first new session starts, so the
   new snapshot records the inherited values.
8. **Auto-advance.** Resuming a collection item rebuilds the queue and starts at the resumed
   track, so finishing advances within the same run.
9. **Sort control** for folder and online playback only: a `GlassChip` immediately after the
   context chip, opening a `GlassSheet` with the available sorts and an Asc/Desc control. No chip
   for playlists or standalone.
10. **Standalone remains valid** when no collection can be resolved. Never invent a collection.

## Implementation shape (follow the plan's phases)

- **Phase A — pure domain:** `domain/SemanticFolders.kt`, `domain/CollectionOrder.kt`, extend
  `FolderPlayOptions`/`buildFolderPlan` with sort + direction. Tests first where practical.
- **Phase B — storage + engine:** explicit `SessionDao` update queries (audio fields vs order
  fields, bump `updated_at`, set `sync_status = 'pending'`), `PlaybackStore` methods,
  `PlaybackEngine.refreshActiveConditions()` and `setCollectionSort()`, `PlaybackService` collects
  effects changes. Do **not** use full `upsert` for a mid-session patch.
- **Phase C — one launcher:** `CollectionPlaybackLauncher` resolves online → folder → fallback and
  is used by every single-track play site (`LibraryViewModel.playTrack`,
  `TrackDetailViewModel.play`, `NotesViewModel`, `PlayerViewModel`, history). Folder/online/playlist
  detail keep explicit contexts; adapt them to the launcher signature.
- **Phase D — resume + inheritance:** rewrite `HistoryViewModel.resumeSession/resumeStretch/
  resumeRun`; recover a run's sort from its latest session (the run row does not store sort).
- **Phase E — player sort UI:** `PlayerViewModel.setCollectionSort`, chip + sheet + strings.
- **Phase F — verification + record.**

Aim for one small, atomic change per commit-sized step. Keep pure logic out of ViewModels so it is
JVM-testable.

## Files you will most likely touch

```
android/app/src/main/kotlin/com/pejvak/app/
  domain/SemanticFolders.kt                     (new)
  domain/CollectionOrder.kt                     (new)
  domain/FolderPlay.kt                          (extend options/plan)
  domain/PlaybackConditions.kt                  (inheritance helper, if needed)
  data/local/SessionDao.kt                      (update queries)
  data/repository/RoomPlaybackStore.kt          (store methods)
  data/repository/CollectionPlaybackLauncher.kt (new)
  data/repository/ContextPlayRepository.kt      (run → latest session)  [or LibraryRepository]
  playback/PlaybackStore.kt                     (interface)
  playback/PlaybackEngine.kt                    (refresh + setCollectionSort)
  playback/PlaybackService.kt                   (effects collector)
  ui/screens/library/LibraryViewModel.kt
  ui/screens/folder/FolderDetailViewModel.kt
  ui/screens/discover/OnlineCollectionViewModel.kt
  ui/screens/track/TrackDetailViewModel.kt
  ui/screens/notes/NotesViewModel.kt
  ui/screens/history/HistoryViewModel.kt
  ui/screens/player/PlayerViewModel.kt
  ui/screens/player/PlayerContent.kt
  ui/screens/player/NowPlayingSheet.kt
  res/values/strings.xml
android/app/src/test/kotlin/com/pejvak/app/
  domain/SemanticFoldersTest.kt                 (new)
  domain/CollectionOrderTest.kt                 (new)
  domain/FolderPlayTest.kt                      (extend)
  domain/PlaybackConditionsTest.kt              (extend)
  playback/PlaybackEngineTest.kt                (extend)
  ui/screens/player/PlayerFormatTest.kt         (extend)  [if present]
```

## Engineering constraints

- Kotlin + Compose only; no new dependency unless the plan says so.
- Keep the engine free of Android/Media3 imports. It talks to `PlaybackStore` and `PlayerCommand`.
- Integer seconds for every position/duration. No float positions.
- Local-first: resolution reads Room/`OnlineCatalogService` caches; never block on the network.
- Do not change `back/`, `front/`, `mobile/`, the sync wire format, or the Room schema. No
  migration is needed; the 12 snapshot fields already exist.
- Never bypass `openRun`; it reuses an open run for the same `(type, key)`.
- Preserve existing `FolderPlayMode` behaviour (`Resume`, `Restart`, `Unfinished`, `Shuffle`) and
  the missing-file exclusion.
- Preserve the encoded folder-key route handling (`Uri.encode`, spaces, non-ASCII).
- All UI strings in `strings.xml`; no hard-coded copy. Follow `DESING.md` tokens, 44 dp targets,
  one icon family, `GlassSheet` as the only sheet.

## Verification (must run and report output)

```bash
export JAVA_HOME=/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd android
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

Then a manual emulator pass:

- Library single track inside a semantic folder → folder run, context chip, auto-advance.
- `Downloads` / `Music` track → standalone (no chip-driven collection).
- Single-track folder → standalone.
- Resume a standalone history row from a semantic folder → converts to folder run.
- Resume a history row → inherits tone/level, volume, enhancer, speed, sort, position.
- Online track with `collectionKey` → online run from cached tracks.
- Change sort mid-play → live queue reorders, the **current** track keeps playing, the current
  history row reflects the new sort, the next session records it.
- Change volume/tone/enhancer mid-play → the current history row reflects it.
- Kill/relaunch → the open run is recoverable.
- Dark + light, playing + paused, Persian title, 320 dp, motion on/off.

Report the exact command output (pass counts, BUILD SUCCESSFUL). Do not claim success without it.

## Definition of done

- The plan's Phase boxes are ticked and the progress log has one entry per task.
- `testDebugUnitTest` green; `assembleDebug` green.
- Every single-track play site resolves through the launcher; no `engine.loadAndPlay(track, …)`
  remains without a collection decision.
- Mid-session audio + sort changes patch the active session; the next session inherits/records
  correctly.
- The player sort chip works for Folder and Online, and is absent for Playlist/standalone.
- `android/docs/summary.md` status row updated.
- No files outside `android/` changed. `git status` shows only intended files.

## Do not

- Do not run `git reset`.
- Do not commit unless explicitly asked.
- Do not edit `mobile/`, `back/`, `front/`, or generated declarations.
- Do not add a schema migration or a backend field.
- Do not add confirmation dialogs, new sort enums, or a second HTTP/DB layer.
