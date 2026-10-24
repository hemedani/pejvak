# Scroll Performance — Phase 0 Audit and Implementation Plan

> **Status:** Phase 0 complete (static audit). **No application code has been changed.** This document is the approval gate: implementation starts only after the decisions in §8 are answered.
>
> **Audit date:** 2026-10-24.
> **Audit environment:** macOS, Node 22.22.2, npm 10.9.7, Expo 57.0.25. **No Android SDK, `adb`, or emulator is installed on this machine** (`~/Library/Android/sdk` and `platform-tools` are absent), so no on-device numbers were produced. Every claim below is static — source code, generated types, and the Expo SDK 57 docs — and is labelled with confidence. §3 is the procedure that turns those claims into measurements.

**Goal:** remove scroll jank from every long list in Pejvak without weakening offline-first behaviour, the card/glass hierarchy, the dock contract, Persian search folding, or the android-only build.

**One-paragraph summary:** the worst offender is not the list engine but the list *shape*. Online collection detail virtualises series **blocks**, and a collection with no series is **one block containing every episode**, so a 200-episode course mounts 200 rows at once (`src/app/online/[key].tsx:186-224`, `:459-495`). The second structural issue is the dock: it is rendered *inside* its own Android `BlurTargetView` (`src/app/(tabs)/_layout.tsx:15-18` → `src/components/app-dock.tsx:172`), which violates the sibling rule documented in `BlurTarget.tsx:17-24` and can force a re-capture on every scroll frame. Third, rows are unmemoised and every parent update hands every mounted row new props and new action arrays; a download running on that screen adds an unthrottled SQLite write per native progress callback. The fixes are contained, but three of them touch layout/list structure, so they need approval before code is written.

---

## 1. Definition of done

A work package is done only when all of the following hold:

1. The named scenario (§3.2) is re-measured on the same device and build, and the budgets in §3.4 are met or the residual is documented with a follow-up.
2. `npm run lint`, `npm run typecheck`, and `npm test` pass.
3. `src/theme/__tests__/tokens.test.ts`, `src/lib/__tests__/cardLayout.test.ts`, and `src/components/ui/__tests__/dockGeometry.test.ts` pass unchanged. **A palette or geometry regression is never fixed by lowering a threshold.**
4. No new network call, query-per-row, or blocking UI work is introduced; all session/annotation writes still go to SQLite first.
5. Temporary instrumentation and `perfFlags` experiments are removed before the package is declared complete.

---

## 2. Non-negotiable constraints

These bound every fix in §6.

- **Android only.** Every `eas.json` profile and `build:*` script is `--platform android`. `borderCurve: "continuous"` is a no-op and the `expo-glass-effect` branch never runs; do not spend time on either.
- **Card vs Glass.** Content that is read is an opaque `Card`; only the dock, mini-player, sheets, modals and menus float on `GlassSurface`. Do not add glass per row.
- **The dock contract.** One panel for the now-playing row and navigation; five icon-only peers; selected = solid accent circle; **no motion on a tab switch**; `playerHeight === navHeight`; screens reserve `dockInset`.
- **Motion.** One unbounded animation only: `WavyProgress`. Every animating component asks `useMotionEnabled()`. Haptics go through `triggerHaptic`.
- **Search.** Fold Persian once per data load with `createSearchIndex` in a `useMemo` keyed on the data. Never compare raw user-visible text with `includes()`.
- **Online media.** The app stores addresses and user state, never bytes. A streamed row is not a file: call `isStreamUri` before any byte read. The artwork backfill keeps its SQL exclusion of `http(s)` locations (`LocalDBService.ts:1810-1839`).
- **Data.** Positions/durations are integer seconds; sessions are append-only; every syncable row keeps `sync_status`; all SQL is parameterised and migrations are append-only.
- **No FlashList, no new state library.** `expo-image` already supports `recyclingKey`, `cachePolicy`, and `allowDownscaling` in SDK 57; `expo-blur` already supports a shared target. Do not add a dependency to solve a problem the current stack can solve.
- **Verification.** `npm run lint`, `npm run typecheck`, `npm test`. Do not start a dev server, emulator, watcher, or build unless the human partner asks.

---

## 3. Measurement protocol

### 3.1 Builds and device

Two builds are needed, because they answer different questions:

| Build | Command (human runs it) | Used for |
|---|---|---|
| `preview` (release JS, Hermes, APK) | `npm run build:apk` | Frame timing: `gfxinfo`, Perfetto, screen recording. This is the only build whose numbers count against the budgets. |
| `development` (dev client) | `npm run build:dev` | React DevTools Profiler (commit counts, why-did-this-render), Hermes sampling profiler. Never quote its FPS as a result. |

Install with `adb install -r <apk>`. Use a **mid-range Android phone on a 60 Hz panel** (Pixel 6a / Samsung A54 class). Record: model, Android version, refresh rate, whether the panel is 120 Hz, battery saver off, not charging, brightness fixed, same Wi-Fi, and a **clean install** for the database-size scenarios. A 120 Hz device is acceptable for regression comparison but the 16.7 ms frame budget is the 60 Hz one.

### 3.2 Scenarios

Each scenario has a seed size and a fixed gesture. Record the actual row/session counts with the result — a "large" library that is actually 300 rows proves nothing about 5,000.

| ID | Screen | Gesture | Seed |
|---|---|---|---|
| S1 | Library → Tracks | Focus, wait for first paint, then 20 s of up/down flings | Medium: ~1,000 tracks, ~1,000 sessions |
| S2 | Library → Folders | Same | ~200 folders |
| S3 | Library → Recent | Same | ~150 recent sessions |
| S4 | Discover → Continue | Same | ~20 in-progress collections |
| S5 | Discover → Favorites | Same | ~40 saved collections |
| S6 | Discover → Browse | Same | 46 languages (static) |
| S7 | Online source listing | Open, wait, 20 s flings | A real source with ≥40 collections |
| S8 | Online collection detail | Open, wait, 20 s flings, **then repeat with a download running** | One real collection with ≥150 episodes; one multi-series collection; one with ~40 episodes as control |
| S9 | History → Sessions | Same | ~10,000 sessions (or the real maximum) |
| S10 | History → Collections | Same | ~500 runs |
| S11 | Folder / playlist detail | Same | ~100 tracks |

Secondary (record once, do not gate the plan on them): Track detail, Smart rule, Missing files, Stats, Settings, Now Playing sheet, Queue sheet, Add-to-playlist sheet.

### 3.3 Commands

Frame timing (the primary metric):

```bash
adb shell dumpsys gfxinfo com.pejvak.app reset
# perform the scenario's 20 s scroll
adb shell dumpsys gfxinfo com.pejvak.app
```

Capture: `Total frames rendered`, `Janky frames`, `50th/90th/95th/99th percentile`, `Number Missed Vsync`, `Slow UI thread`, `Slow bitmap uploads`, `Slow issue draw commands`, `GPU`. Repeat three times and take the median; the first run after launch is discarded.

Frame-by-frame CSV:

```bash
adb shell dumpsys gfxinfo com.pejvak.app framestats
```

Trace (for the slow frames, not for averages):

```bash
adb shell perfetto -o /data/misc/perfetto-traces/pejvak-scroll -t 20s \
  sched freq idle am wm gfx view binder_driver hal dalvik input res memory
adb pull /data/misc/perfetto-traces/pejvak-scroll .
# open the trace in ui.perfetto.dev and look for Choreographer#doFrame,
# DrawFrame, RenderThread, and BlurView / RenderEffect slices
```

Screen recording for the visual check (blank cells, image flashes, dock seams):

```bash
adb shell screenrecord --time-limit 20 /sdcard/pejvak-s1.mp4
adb pull /sdcard/pejvak-s1.mp4 .
```

Memory (leak check after five scroll cycles):

```bash
adb shell dumpsys meminfo com.pejvak.app
```

Re-render counts: React DevTools Profiler on the `development` build, with "Record why each component rendered" enabled. Count commits for `MediaCard`, `OnlineTrackRow`, `StretchCard`, `CollectionCard`, and `PaletteTile` during a scroll that does not change data. Target: **0 re-renders of already-mounted rows**.

### 3.4 Budgets

| Metric | Budget | Why |
|---|---|---|
| UI FPS during the scenario | ≥ 58 on 60 Hz | A dropped frame in a fling is visible |
| Janky frames | < 3% | `gfxinfo`'s own count |
| 95th percentile frame | ≤ 16.7 ms | The frame budget |
| 99th percentile frame | ≤ 33 ms | No repeated two-frame stalls |
| Frozen frames > 700 ms | 0 | `gfxinfo` "frozen frames" |
| JS long task during scroll | none > 50 ms | A long task is a guaranteed hitch |
| Mounted rows re-rendered by scrolling | 0 | Virtualisation only mounts; it does not re-render |
| Player 1 Hz tick | ≤ 2 components | Currently the dock row |
| Download progress | ≤ 4 updates/s, only the affected row(s) | §2 of the mobile AGENTS rules and the existing `PROGRESS_THROTTLE_MS = 250` |
| PSS growth after 5 scroll cycles | < 20 MB, non-monotonic | Catches image/listener leaks |

**Do not lower a budget to make a result pass.** If a budget is impossible on the chosen device, record the device and the residual, and raise it explicitly for approval.

### 3.5 Results table (to fill before and after)

| Scenario | Build | Device | Frames | Jank % | p95 (ms) | p99 (ms) | Frozen | JS long tasks | Rows re-rendered | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | baseline | | | | | | | | | |
| S2 | baseline | | | | | | | | | |
| S3 | baseline | | | | | | | | | |
| S4 | baseline | | | | | | | | | |
| S5 | baseline | | | | | | | | | |
| S6 | baseline | | | | | | | | | |
| S7 | baseline | | | | | | | | | |
| S8 | baseline | | | | | | | | | |
| S8 + download | baseline | | | | | | | | | |
| S9 | baseline | | | | | | | | | |
| S10 | baseline | | | | | | | | | |
| S11 | baseline | | | | | | | | | |

Repeat the same table after each work package. A package that does not move its scenario is reverted rather than kept.

---

## 4. Static audit

### 4.1 What was inspected

Config (`package.json`, `app.json`, `eas.json`, `tsconfig.json`, `eslint.config.js`), every tab/detail screen that scrolls, every list/row component, the hooks that feed them, the online catalog/download services, and the SQLite queries and indexes behind them. The unit tests that pin layout and theme were read, not changed.

### 4.2 Findings, ranked

Confidence is about the **code fact**; impact is the part that needs the experiments in §5.

#### F1 — Online collection detail mounts every episode (P0, highest confidence)

- `src/app/online/[key].tsx:186-224` builds `blocks`; when `sections` is null, **one block holds every track** (`:188-198`).
- The outer `FlatList` renders blocks (`:459-495`); the rows inside are a plain `.map` (`:482-491`).
- `src/components/ui/row/list-group.tsx:25-42` clones every child on every render.
- **Effect:** a 200-episode collection mounts 200 `OnlineTrackRow`s, 200 `PaletteTile` images, 200 pressables, and one `Card`. Nothing is recycled. This is the screen the listener named as worst.
- **Confidence:** certain. **Impact:** expected to be the largest single win on S8. **Experiment:** E7.

#### F2 — The dock is inside its own Android blur target (P0, structural)

- `src/app/(tabs)/_layout.tsx:15-18` wraps `<AppTabs />` in `GlassBlurTarget`.
- `src/components/app-tabs.tsx:23-24` renders `AppDock` as the tab bar, so the dock is *inside* that target.
- `src/components/app-dock.tsx:172` renders a `GlassSurface`; `src/components/ui/glass/GlassSurface.tsx:118-124` gives its `BlurView` the nearest target ref — the outer one.
- `src/components/ui/glass/BlurTarget.tsx:17-24` states the rule: **panels have to be siblings rather than descendants**, because a panel nested inside the target blurs its own siblings.
- `src/components/motion/Screen.tsx:47-55` creates a second target per screen, but the list is rendered as a *sibling* of that target, so the dock cannot use it and the list is not in it.
- **Effect:** on Android, `dimezisBlurViewSdk31Plus` captures a view that contains the scrolling scene **and the blur view itself**. Every scroll frame can force a re-capture, and the dock may sample its own pixels. This would make *every* tab scroll slower, which matches "all lists". The visual result is currently acceptable, which is why it has survived.
- **Confidence:** the rule violation is certain; the frame cost needs E1. **Impact:** potentially the second-largest, and it is cross-cutting. **Experiment:** E1; then WP1.

#### F3 — Rows are unmemoised and receive new props on every parent render (P0)

- No `React.memo` on `MediaCard` (`media-card.tsx`), `OnlineTrackRow`, `CollectionCard`, `StretchCard`, `ContextPlayCard`, or `ListRow`.
- Library's `renderItem` is inline (`index.tsx:801-828`), and `trackActions(track)` builds a fresh array and fresh closures for every row on every render (`:706-719`). `trackRows` itself is a new array whenever the query, view, or `tracks` changes (`:249-271`).
- `media-card.tsx:129` subscribes every card to `useWindowDimensions`; `:131` recomputes the palette; `:142-148` recomputes the width. `row-shell.tsx:88` reads the theme, `:94` reads `Dimensions`, and `:104-116` re-plans the action layout on every render.
- **Effect:** any parent state change — a keystroke, a view switch, a backfill result, an annotation count — re-renders every mounted row. Even a scroll that mounts a new row causes the existing rows to re-render if the data array was replaced.
- **Confidence:** certain. **Impact:** amplified by F1 (200 rows) and F4 (downloads). **Experiment:** E8 after the memo change; re-render counts via DevTools.

#### F4 — Download progress is written to SQLite on every native callback (P0/P1)

- `src/services/DownloadService.ts:54-55` throttles the *emit* to 250 ms, but `:716-723` calls `updateDownloadJobProgress` and then `emitProgress()` on **every** native progress callback. The DB write is not throttled; only the notification is.
- `src/hooks/use-online-collection.ts:231-247` subscribes and runs `readLiveFor` (two queries, `:177-183`) on every emit, then replaces the live state. `:308-321` returns a new `jobsByTrack` object every time.
- `src/app/online/[key].tsx:481-491` passes `job={jobsByTrack[id]}` to every row, so every row gets a new object identity.
- `:438`, `:539`, `:616`, `:657`, `:661` force an emit at file boundaries, bypassing the 250 ms gate.
- **Effect:** during a download, the JS thread does a DB write per progress callback and every mounted row re-renders; on F1's 200 rows this is severe. The 4 Hz UI budget can also be exceeded because the DB write path is not gated.
- **Confidence:** certain code; measured via E4. **Impact:** S8 with a download running.

#### F5 — Library focus does a burst of work on the scroll path (P1)

- `index.tsx:282-290`: after `runArtworkBackfill(8)` finds anything, `setTracks(await getAllTracks())` and `refreshFolders()`.
- `use-artwork-backfill.ts:39-60` → `ArtworkService.backfillArtwork` (`ArtworkService.ts:178-186`) → `inspectAudioFile(..., includeArtwork: true)` (`:97`); `AudioInspectionService.ts:66-71` reads a bounded window via `readAsStringAsync` and base64-decodes it, per file.
- `index.tsx:209-220` folds the entire search index in a `useMemo` keyed on `tracks`; replacing the array re-folds every searchable field.
- `index.tsx:292-309` also calls `getAllTracks`, `getAnnotationCounts`, `refreshFolders`, `refreshMissing`, `refreshRecent`; and `use-recent-plays.ts:35-43` calls `getSessionsForHistory(150)`, `getFolderSummaries()`, `PlaylistService.list()`, and **another** `getAllTracks()`. `use-folders.ts:23-39` and `index.tsx` both call `getFolderSummaries`.
- **Effect:** on focus, two full track reads, two folder-summary reads, eight file inspections, and a full search re-fold can land while the listener is already scrolling. The `setTracks` replacement also re-renders all rows (F3).
- **Confidence:** certain code; whether it crosses a frame needs a trace. **Impact:** S1/S2/S3 first scroll. **Experiment:** E6.

#### F6 — History loads 200 stretches and renders day blocks eagerly (P1)

- `src/hooks/use-history.ts:17-37` reads `getSessionsForHistory(200)` once; there is no `onEndReached`.
- `history.tsx:173-213` is a `FlatList` over **day groups**; the rows inside each day are `.map`ped (`:186-210`), and `ListGroup` clones them (`list-group.tsx:25-42`).
- `LocalDBService.ts:412-446` groups by `stretch_id`, orders by `MAX(started_at)`, then joins every member row. The index is `idx_sessions_stretch(stretch_id, started_at)` (`src/lib/db/migrations.ts:303`).
- **Effect:** 200 stretches (and all their member rows) are transferred and grouped on every focus. A heavy listening day mounts all its rows at once. The query may also build a temp B-tree for the group/order.
- **Confidence:** certain for the rendering shape; query cost needs `EXPLAIN QUERY PLAN` + timing. **Impact:** S9/S10. **Experiment:** E7 (history variant).

#### F7 — Artwork tiles do not use the recycling/decoding controls that exist (P1)

- `src/components/motion/PaletteTile.tsx:61-68` renders `<Image source={{ uri }} transition={140} />` with no `recyclingKey`, `cachePolicy`, or `allowDownscaling`.
- Every list row has one.
- **Effect:** a recycled row can briefly show the previous item's bitmap; the 140 ms fade replays on every mount; full-resolution posters are decoded for a 56 pt tile.
- **Confidence:** high — the props are present in the SDK 57 types and docs. **Impact:** S1, S7, S8. **Experiment:** E3.

#### F8 — Every row is wrapped in `Reveal` (P1)

- `src/components/motion/Reveal.tsx:69-86` always returns an `Animated.View` and always calls `useMotionEnabled()`. Past `limit`, `entering` is `undefined` but the wrapper and subscription remain.
- Library (`index.tsx:806-809`), Discover (`discover.tsx:181`, `:202`), and the collection screen (`online/[key].tsx:460`) all wrap rows.
- **Effect:** one extra view and one store subscription per row, for an animation that by design does not run past the first screenful.
- **Confidence:** certain; cost is modest but free to remove. **Experiment:** E2.

#### F9 — Per-row dimension reads and layout planning (P1, falls out of F3)

- `media-card.tsx:129` uses `useWindowDimensions` per card; `row-shell.tsx:94` uses `Dimensions.get` per row; `:104-116` re-plans on every render.
- `MediaCard` already accepts `cardWidth` (`media-card.tsx:105-106`, `:142-148`), and `RowShell` accepts it (`row-shell.tsx:63`), but the list screens do not pass it.
- **Effect:** each row subscribes to dimension changes and recomputes a layout that is constant for the list.
- **Confidence:** certain. **Impact:** small after memoisation, but part of the same fix.

#### F10 — `WavyProgress` rebuilds a path string every frame while playing (P1)

- `src/components/player/WavyProgress.tsx:95-98` runs a frame callback that advances the phase while playing; `:133-149` rebuilds the SVG `d` string on the UI thread every frame.
- The dock's bar is mounted whenever something is playing (`MiniPlayerRow.tsx:193-204`), so this runs on **every tab screen** while scrolling.
- **Effect:** continuous UI-thread allocation and SVG work during a scroll. It does not re-render React (by design), but it competes with the frame.
- **Confidence:** high; impact via E5. **Impact:** all screens while playing.

#### F11 — One Reanimated shared value per pressable (P2)

- `ElasticPressable.tsx:59-64` allocates a shared value and an animated style per pressable; each row has a card body plus action buttons.
- **Effect:** hundreds of shared values and animated styles; mount/unmount churn during a fast fling.
- **Confidence:** certain; **do not change before measuring**, because the press spring is a deliberate product choice. **Experiment:** E9.

#### F12 — Virtualisation is left on defaults everywhere (P2)

- No `initialNumToRender`, `maxToRenderPerBatch`, `updateCellsBatchingPeriod`, `windowSize`, `removeClippedSubviews`, or `getItemLayout` anywhere except `QueueSheet.tsx:226`.
- **Effect:** conservative defaults can leave blanks during fast flings and do more work than the screen needs.
- **Confidence:** certain. **Impact:** S1, S8, S9. **Experiment:** after memo/virtualisation, tune and compare.

#### F13 — Opening a collection writes tracks one awaited row at a time (P2)

- `src/services/OnlineCatalogService.ts:204-247` loops over the remote tracks and `await`s `upsertOnlineTrack` for each, then re-reads them.
- **Effect:** a 200-track collection performs 200 awaited DB writes on the JS thread. Because `readRemote` runs after the local read paints, these writes can land exactly when the listener starts scrolling.
- **Confidence:** certain. **Impact:** S8 first scroll. **Experiment:** trace S8 opening.

#### F14 — Per-folder / per-track correlated subqueries (P2)

- `LocalDBService.ts:1478-1558`: two grouped folder queries, each with correlated subqueries for play counts and artwork.
- `LocalDBService.ts:2089-2120`: two correlated subqueries per collection track.
- **Effect:** cost grows with folder count / episode count on every Library focus and collection open.
- **Confidence:** certain; whether it is over 16 ms needs `EXPLAIN QUERY PLAN` + timing. **Impact:** S1/S2/S8.

#### F15 — History group/order may use a temp B-tree (P2)

- `LocalDBService.ts:412-429` groups all non-deleted sessions by `stretch_id`, orders by `MAX(started_at)`, limits, then joins.
- The existing index (`migrations.ts:303`) is `(stretch_id, started_at)`; the `deleted_at` predicate is a separate index (`:138`).
- **Effect:** on 10k sessions the group/order can exceed a frame. Do not add an index or a table until the plan is captured.
- **Confidence:** medium. **Impact:** S9.

#### F16 — The dock row re-renders once per second (P2, within budget)

- `DockPlayer.tsx:57` subscribes to `positionSec`; `TrackPlayerService.ts:104` creates the player with `updateInterval: 1000`; `:431-434` patches the store each tick.
- **Effect:** the dock row and `MiniPlayerRow` re-render 1×/s while playing. That is within the "≤2 rows" budget, but it happens during scroll and rebuilds the `WavyProgress` element each time.
- **Confidence:** certain. **Impact:** small; fixed as part of WP8 by isolating the clock text.

#### F17 — `ListGroup` clones every child on every render (P2)

- `list-group.tsx:25-42` uses `Children.toArray` + `cloneElement` to inject `position`.
- **Effect:** a 200-row group clones 200 elements per render, and memoised children still receive a new `position` prop each time.
- **Confidence:** certain. **Impact:** F1 and F6.

#### F18 — Discover Browse is a `ScrollView` over 46 rows (P3)

- `discover.tsx:287-316` renders a `ScrollView` + `ListGroup` of 46 languages.
- **Effect:** bounded by the catalogue, so it is unlikely to be the reported jank, but it is one of the few non-virtualised long-ish lists. Measure S6; change only if it fails.
- **Confidence:** certain shape; impact low.

#### F19 — Other detail screens are `ScrollView` + `.map` (P3)

- Folder (`folder/[key].tsx:145`), playlist (`playlist/[id].tsx`), smart rule (`smart/[rule].tsx:94`), track detail (`track/[id].tsx:152`), missing (`missing.tsx:54`), stats (`stats.tsx:112`), and language sources (`online/language/[code].tsx:74`).
- These are bounded by their content. Measure S11 and the secondary scenarios; do not convert them to `FlatList` without a failing measurement.

#### F20 — `useTheme()` per row / per text (P3, not a scroll fix)

- `useTheme` (`hooks/use-theme.ts:29-31`) subscribes to the settings store per component; `ThemedText` calls it per text node; `RowShell`, `Card`, `StatusLine`, `RowActionMenu`, and each row call it too.
- **Effect:** hundreds of Zustand subscriptions at mount. It changes only when the appearance preference changes, so it is a mount cost, not a per-frame cost.
- **Confidence:** certain; **do not churn this** unless a profile shows the subscriptions during scroll. Memoisation (WP3) removes most of it.

### 4.3 Already correct — do not regress

- Search is folded once per data load, not per keystroke (`index.tsx:209-220`; `lib/search.ts:296`).
- Stream rows are excluded from the artwork backfill in SQL (`LocalDBService.ts:1810-1839`), and `isStreamUri` is the one stream test (`lib/audioLocation.ts`).
- Collection/source hooks are keyed by the collection/source (`use-online-collection.ts:304`, `use-online-catalog.ts:182-185`), not guarded by a ref.
- The download queue is rows, sequential, and resumable (`DownloadService.ts`), not an in-memory array.
- `Screen` puts its panels as siblings of its target (`Screen.tsx:47-55`); only the dock violates the rule.
- `QueueSheet` is the one list that uses `getItemLayout` (`QueueSheet.tsx:226`).
- Every tab list uses `dockInset` (`index.tsx:885`, `history.tsx:288`, `discover.tsx:348`).
- `WavyProgress` is the only unbounded animation, as the motion plan requires.
- No `onScroll` → `setState` exists anywhere.
- No screen queries the database per row.

---

## 5. Experiments (bisect before fixing)

A dev-only `src/lib/perfFlags.ts` (WP0) will expose the switches below. Flags are read from `EXPO_PUBLIC_PERF_*` at build time and are inert unless `__DEV__`; they must never affect a production build.

| ID | Flag | Isolates | Expected if positive |
|---|---|---|---|
| E1 | `dockBlur=off` (render the dock `flat`) | F2 | S1–S8 improve on every tab, most on long lists |
| E2 | `reveal=off` (skip entrance wrappers) | F8 | Small but broad improvement in mount cost |
| E3 | `artwork=off` (gradient tiles only) | F7 | S1/S7/S8 improve; image flashes disappear |
| E4 | `downloadLive=off` (unsubscribe from progress) | F4 | S8 with a download becomes as fast as S8 without |
| E5 | `wavyPhase=off` (freeze the wave) | F10 | Improvement on all tab screens *while playing* |
| E6 | `backfill=off` (skip the Library pass) | F5 | S1/S2/S3 first scroll improves |
| E7 | `listMode=legacy|virtual` (render rows as list cells) | F1/F6 | S8/S9 improve; row mount count drops |
| E8 | `rowMemo=on` (after WP3) | F3/F17 | Mounted rows stop re-rendering on unrelated changes |
| E9 | `pressScale=off` (static press) | F11 | Only if rows are still slow after E1–E8 |

Procedure: baseline → all flags off → all flags on (one build) → one flag at a time. **If "all flags on" still janks, the cost is native (blur, GPU, image decode) or list-engine-level and the JS fixes are not the answer.** Record the delta for each flag in §3.5.

---

## 6. Work packages

Ordered. The first three are structural; do them before micro-tuning so the measurements are not measuring the wrong thing.

### WP0 — Diagnostic harness (S)

- Add `src/lib/perfFlags.ts` (env-driven, `__DEV__`-gated) and the smallest possible overlay (optional) to switch flags without a code edit.
- Add a `docs/perf/` note? No — keep the procedure in this file. Do not add a hidden route unless a seed harness is approved (A9).
- **Acceptance:** flags compile, are inert in release, `lint`/`typecheck`/`test` pass. No production import of the overlay.

### WP1 — Hoist the dock out of the blur target (M)

**Decision needed: A1.**

- `src/app/(tabs)/_layout.tsx`: keep `<GlassBlurTarget background={<AppTabs />} />` but render the dock as a **sibling** of the target, not inside it. `AppTabs` renders `<Tabs tabBar={() => null}>` so no dock is inside the target.
- `src/components/app-dock.tsx`: accept `{ activeName, onSelect, insets }` instead of `BottomTabBarProps`; derive the active tab from the pathname (`usePathname` / `useSegments`) and navigate with `router.navigate(tabPath)`. `AppDock` currently emits `tabPress` (`app-dock.tsx:152-165`), but **no screen listens to it** (verified), so dropping the emit is safe. If that changes later, reinstate it through a listener registered in the layout.
- Alternative if the hoist proves unstable on device: keep the dock inside but render it `flat` (no blur) and record the visual regression. Do **not** keep a self-capturing target.
- **Acceptance:** dock geometry unchanged; tab switching works; `dockGeometry.test.ts` passes; E1 shows the same improvement as the real fix; screen-recorded flick has no seams.

### WP2 — Virtualise collection rows (L)

**Decision needed: A2.**

- `src/app/online/[key].tsx`: replace block-level items with row-level items. Precompute a flat row array of `{ track, ordinal, position, sectionKey, sectionTitle, isFirstOfSection, isLastOfSection }`; render series headers as section-header rows (`SectionList`) or as items with `getItemType`-style branching.
- Introduce a `ListSection` / `ListSurface` helper that draws the group's card chrome **across cells**: the first row carries the top corners and border, the last the bottom corners, the middle rows a shared fill and an inset divider. This is the standard way to keep "one card" while virtualising; it must be visually indistinguishable from `ListGroup` on a short series.
- Keep `ListGroup` for static, bounded screens. Do not replace it globally.
- `ListGroup`'s clone pass (F17) is removed for the virtualised path by passing `position` explicitly.
- **Acceptance:** S8 mounts ≤ ~20 rows for a 150-episode collection; no visual seam on a 5-episode series (screenshot comparison); `gfxinfo` and DevTools mount counts recorded; no nested `VirtualizedList` warning.

### WP3 — Stabilise row identity (M)

- `React.memo` the row archetypes: `MediaCard`, `OnlineTrackRow`, `CollectionCard`, `StretchCard`, `ContextPlayCard`, `ListRow`.
- Add a memoised `TrackRow`/`FolderRow`/`RecentRow` wrapper in the Library so `trackActions(track)` is built once per item (`useMemo`), not once per render per row.
- Pass `cardWidth` once from the screen (`useWindowDimensions` at the screen level) into `MediaCard` / `RowShell`; remove the per-row dimension read from the hot path.
- `OnlineTrackRow` needs a custom comparator: `job` is rebuilt every poll (F4), so compare `job?.state`, `job?.bytesWritten`, `job?.totalBytes` rather than object identity. Same for `hit.ranges` where it is an array.
- Keep the action arrays referentially stable: the screen builds them with `useCallback`/`useMemo`, and the row does not clone them.
- **Acceptance:** DevTools shows 0 re-renders of mounted rows during a scroll and on an unrelated parent update; all existing tests pass; no stale menu/action after a track or collection mutation (exercise rename/delete/download).

### WP4 — Download progress path (M)

**Decision needed: A4.**

- `DownloadService.ts:716-723`: keep the last write per job and write at most every **500 ms** or when the percentage changes by ≥ 1 point, plus always on state changes (`running`/`done`/`failed`/`cancelled`). Keep the notification throttle at 250 ms; do not raise the UI update rate.
- `emitProgress(true)` only on **state transitions**, not every file boundary (`:438`, `:539`, `:616`, `:657`, `:661`). A file boundary is a state transition; a byte callback is not.
- `use-online-collection.ts`: coalesce `readLiveFor` calls (a trailing timeout of one frame/250 ms is enough) and reuse unchanged job objects so `jobsByTrack` does not hand every row a new object. A pure `mergeJobs(previous, next)` helper is testable.
- **Acceptance:** ≤ 4 DB writes/s and ≤ 4 UI updates/s during a download; only the active row re-renders; S8 + download meets the FPS budget; a cancelled/retried/failed file still shows the correct state immediately.

### WP5 — Library focus path (M)

**Decision needed: A5.**

- Defer `backfillCovers` until after interactions (`InteractionManager.runAfterInteractions` plus a short delay), and skip it while a scroll is in flight. Keep the bounded, self-stamping pass.
- Have `backfillArtwork` return the changed rows (or a map of `trackId -> artworkUrl`) so the screen merges them into `tracks` instead of replacing the array with a fresh `getAllTracks()`. `setTracks` should only be called when something actually changed, so the search index (`index.tsx:209-220`) is not re-folded for nothing.
- De-duplicate the focus reads: pass the screen's `tracks` and `folders` into `buildRecentPlays` (or add one combined read) instead of `useRecentPlays` re-reading both (`use-recent-plays.ts:35-43`).
- Keep `refreshMissing` and annotation counts off the first-paint critical path; run them after the list has painted.
- **Acceptance:** Library first scroll within budget; no JS long task on focus; search still finds everything; covers still backfill across visits.

### WP6 — History pagination and grouping (M)

**Decision needed: A3.**

- `use-history`: page size ~50 stretches, `loadMore`, `onEndReached` with a threshold; keep the existing `limit` semantics (stretches, not rows).
- Add keyset pagination to `getSessionsForHistory`: `(MAX(started_at), stretch_id)` below the last page's boundary, so a new session cannot shift a page. Parameterised SQL; no string interpolation.
- Export must query the full set separately (`getSessionsForHistory` with a large/complete mode) rather than exporting only the loaded page. Verify `historyToMarkdown` still produces the same document for the same data.
- Memoise `StretchCard`/`ContextPlayCard`; pass `position` explicitly instead of relying on `ListGroup` cloneElement.
- Only if `EXPLAIN QUERY PLAN`/timing shows the group/order over budget: add an index or a denormalised `stretches` table as migration 13. Do not add it speculatively.
- **Acceptance:** S9/S10 initial paint bounded; scrolling loads more without duplicates or jumps; export unchanged; delete/refresh still removes the right rows.

### WP7 — Image and reveal costs (S)

**Decision needed: A6, A7.**

- `PaletteTile`: add `recyclingKey` (use the URI, or the content hash where the caller has it), `cachePolicy="memory-disk"`, `allowDownscaling`, and `transition={0}` for list rows (or a `dense` prop so the hero keeps its fade). Verify on device that a recycled row never shows the previous bitmap.
- `Reveal`: when `index >= limit`, return `children` directly instead of an `Animated.View`; move `useMotionEnabled` into an inner `AnimatedReveal` so the hook is not called on the non-animated path. `index` is stable per row, so the element type does not change on scroll.
- `DockPlayer`/`MiniPlayerRow`: isolate the elapsed-time text into a leaf component so the 1 Hz `positionSec` tick does not re-render the artwork and the whole control row. Keep the `WavyProgress` shared value.
- **Acceptance:** no image flash in a fast fling; fewer views per row; S1/S8 improvement; the first screenful still animates as designed.

### WP8 — Virtualisation tuning and the wave (S)

- Add a shared `listPerformance` object (`initialNumToRender: 8`, `maxToRenderPerBatch: 8`, `updateCellsBatchingPeriod: 50`, `windowSize: 7`) and apply it to the list screens. Add `removeClippedSubviews` only where the screen has no absolutely-positioned overlays that would be clipped; verify on device.
- Do not add `getItemLayout` unless a row height is provably fixed. `MediaCard` is close to fixed but the title can be one or two lines; measure before claiming it.
- `WavyProgress`: cap the phase update at ~30 Hz (accumulate dt) or otherwise reduce the per-frame path work; keep the flatten-on-pause behaviour. This is the only unbounded animation and must remain, but it must not cost a frame.
- **Acceptance:** S1/S8/S9 budgets; the wave still reads as a wave; no blank cells during a fast fling; memory stable.

### WP9 — Query shaping (M, conditional)

Only where a measurement shows the query is over budget.

- `getFolderSummaries`: replace the correlated subqueries with pre-aggregated CTEs/joins if `EXPLAIN`/timing says so.
- `getCollectionTrackProgress`: aggregate `sessions` by `track_id` once, then join.
- `getSessionsForHistory`: capture `EXPLAIN QUERY PLAN`; index or keyset only if needed.
- `OnlineCatalogService.syncCollectionTracks`: add a batched `upsertOnlineTracks` (one transaction, chunks of ~100) so opening a collection does not do 200 awaited writes.
- **Acceptance:** query p95 ≤ 16 ms on the large seed; identical rows; no migration unless approved (A10).

### WP10 — Re-measure, clean up, document (S)

- Re-run S1–S11 on the same build/device; fill §3.5; remove flags/instrumentation; run lint/typecheck/test.
- Update `mobile/AGENTS.md` only if a new invariant is established (e.g. "the dock is a sibling of the blur target"; "download progress writes are coalesced"; "virtualised sections share a surface across cells").

**Total:** roughly 5–7 focused days for WP1–WP7, plus measurement time. WP9 is conditional.

---

## 7. Test plan

Pure logic gets unit tests; UI gets measurements.

| Area | Test |
|---|---|
| Download coalescing | `mergeJobs` reuses unchanged rows; a byte tick below 1% does not write; a state change always writes |
| History paging | keyset boundary returns no duplicate/missing stretch; page size counts stretches, not rows; export query returns the full set |
| List surface | `position` computation for first/middle/last/only; a one-row section is `only` |
| Reveal | non-animated path renders children directly (no wrapper) once `index >= limit` |
| Row memo comparators | a new job object with identical numbers does not re-render; a changed byte count does |
| Existing contracts | `tokens.test.ts`, `cardLayout.test.ts`, `dockGeometry.test.ts`, `iconCatalog.test.ts` pass unchanged |
| Existing suites | history, online collection, download, sync, player |

Commands: `npm run lint`, `npm run typecheck`, `npm test`. If a new dev route is added, regenerate `.expo/types/router.d.ts` by starting the dev server once and killing it (`npx expo start --offline`), otherwise `tsc` cannot see the route.

Manual device checks: S1–S11, plus a download running during S8, a paused/playing dock during S1, and a delete/retry during a download.

---

## 8. Approval needed

Answer these before implementation. Recommended answers are first.

| # | Decision | Recommendation |
|---|---|---|
| A1 | May we move the dock out of the `GlassBlurTarget` (change the tab layout plumbing)? | **Yes.** This is the only way to satisfy the documented sibling rule without losing the dock's blur. |
| A2 | May we change the collection/history list architecture from "one card per group with all rows inside" to "rows as cells sharing a card surface"? | **Yes.** Required to virtualise a 150-episode collection. Keep the visual result identical. |
| A3 | May `History` paginate (initial ~50 stretches, infinite scroll) and export via a full query? | **Yes.** The current 200-at-once load is the source of the focus cost. |
| A4 | May download progress write to SQLite at most every 500 ms / 1% instead of on every native callback? | **Yes.** The UI still updates ≤ 4 Hz, as specified. |
| A5 | May the artwork backfill run after interactions and merge changed rows instead of re-reading everything? | **Yes.** Covers still appear; the scroll no longer pays for them. |
| A6 | May rows be memoised and may `Reveal` skip its wrapper past the first screenful? | **Yes.** This is already the intent of `limit`. |
| A7 | May list artwork use `recyclingKey` + `cachePolicy` + no transition (hero keeps its fade)? | **Yes.** The image API supports it; it removes flashes and full-resolution decodes. |
| A8 | May we add a dev-only `perfFlags` module (and optionally an FPS overlay) for the bisect? | **Yes.** Removed in WP10. |
| A9 | How should the large seed be produced: your real library, or a dev-only seed harness? | **Your real library first.** If it is under ~1,000 tracks, approve a dev seed route so the worst case is real. |
| A10 | May we add migration 13 if a query is measured over budget? | **Only if measured.** No speculative schema change. |
| A11 | May press-scale be disabled in dense lists if E9 shows it costs frames? | **Only if measured.** The press spring is a product choice. |
| A12 | Which device/build will you use for the baseline, and can you run the §3.3 commands? | Please name the model and Android version. The audit machine cannot run `adb`. |

---

## 9. Residual risks

- **Dock hoist (WP1)** touches navigation. If `router.navigate` does not reproduce the tab semantics exactly (state preservation, back behaviour), the fallback is a non-blurred dock plus a visual note; do not keep a self-capturing target.
- **Card-across-cells (WP2)** can show a hairline seam between rows on a fractional pixel density. The implementation must use the same `hairline`/`outline` tokens and be screenshot-compared on a short series.
- **Memoisation (WP3)** can hide a stale prop. Every comparator needs a test and a manual mutation check (rename, delete, download state, favourite).
- **Pagination (WP6)** changes what "export" means. Export must be fixed in the same package, not after it.
- **Coalescing (WP4)** can make a stalled download look frozen if the state transition is not forced. Always write on transition.
- **Deferred backfill (WP5)** changes *when* a cover appears. That is acceptable; a cover appearing during a scroll is not.
- **The blur target (WP1)** is the one fix whose impact may be smaller than expected if `dimezisBlurViewSdk31Plus` already caches. E1 decides; if E1 is flat, keep the structural fix for correctness and move on.

---

## Appendix A — Instrumentation sketch (not implemented)

`src/lib/perfFlags.ts`:

```ts
// Disable-flags: false in every production build, so the production
// branch is always the original behaviour. Expo inlines EXPO_PUBLIC_*.
const off = (value: string | undefined) => __DEV__ && value === "off";

export const perfFlags = {
  disableDockBlur: off(process.env.EXPO_PUBLIC_PERF_DOCK_BLUR),
  disableReveal: off(process.env.EXPO_PUBLIC_PERF_REVEAL),
  disableArtwork: off(process.env.EXPO_PUBLIC_PERF_ARTWORK),
  disableDownloadLive: off(process.env.EXPO_PUBLIC_PERF_DOWNLOAD_LIVE),
  disableWavyPhase: off(process.env.EXPO_PUBLIC_PERF_WAVY),
  disableBackfill: off(process.env.EXPO_PUBLIC_PERF_BACKFILL),
  disablePressScale: off(process.env.EXPO_PUBLIC_PERF_PRESS),
} as const;
```

Consumers read the flag at the call site (e.g. `flat={perfFlags.disableDockBlur}`), never inside a hook that would change hook order. Because every flag defaults to `false`, an accidental import in a release build changes nothing. Remove the module in WP10.

## Appendix B — Query plans to capture

Before WP9, capture and attach to the results:

```sql
EXPLAIN QUERY PLAN
SELECT s.*, t.title, cp.context_title
FROM sessions s
JOIN tracks t ON t.id = s.track_id
LEFT JOIN context_plays cp ON cp.id = s.context_play_id
WHERE s.deleted_at IS NULL
  AND s.stretch_id IN (
    SELECT stretch_id FROM sessions
    WHERE deleted_at IS NULL
    GROUP BY stretch_id
    ORDER BY MAX(started_at) DESC
    LIMIT 200
  )
ORDER BY s.started_at DESC;
```

```sql
EXPLAIN QUERY PLAN
SELECT t.folder_key, COUNT(*), SUM(...)
FROM tracks t
LEFT JOIN folders f ON f.key = t.folder_key
LEFT JOIN (SELECT DISTINCT track_id FROM sessions WHERE completed = 1 AND deleted_at IS NULL) done
  ON done.track_id = t.id
WHERE t.folder_key IS NOT NULL AND t.origin <> 'online'
GROUP BY t.folder_key;
```

```sql
EXPLAIN QUERY PLAN
SELECT t.id,
  (SELECT COUNT(*) FROM sessions s WHERE s.track_id = t.id AND s.completed = 1 AND s.deleted_at IS NULL),
  (SELECT s.end_position_sec FROM sessions s WHERE s.track_id = t.id AND s.ended_at IS NOT NULL AND s.deleted_at IS NULL ORDER BY s.started_at DESC LIMIT 1)
FROM tracks t
WHERE t.collection_key = ?;
```

---

**Stop point.** No code will be written until §8 is answered. The next action after approval is WP0 (harness) and a baseline run of S1–S11 on the chosen device.
