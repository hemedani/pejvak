# AGENTS.md — Pejvak Android (`android/`)

Native **Kotlin + Jetpack Compose** rewrite of the Pejvak audio player, Android only. No Flutter, no
React Native, no WebView UI. This sector replaces `mobile/` (Expo/RN), which stays in the repo
untouched until the owner retires it. Read the root [`../AGENTS.md`](../AGENTS.md) first — it is
authoritative for product invariants and the Lesan contract. This file wins for native-sector detail.

**Precedence:** code > plan > this AGENTS.md > docs. Where a doc and the code disagree, the code is
right and the doc is a bug.

## Build & run

```sh
./gradlew assembleDebug        # APK at app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug         # install on the connected device (owner tests frequently)
./gradlew test                 # JVM unit tests
```

- JDK: `/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` (set `JAVA_HOME` if default java is 1.8).
- SDK: `~/Library/Android/sdk` (via `local.properties`, gitignored). Installed manually via the
  `redirector.gvt1.com` CDN (platforms android-36 & android-37.0, build-tools 36.0.0, platform-tools)
  because `dl.google.com` is blocked. `android.builder.sdkDownload=false` fails fast on a missing
  component. A hand-added platform needs a `package.xml` or AGP/sdkmanager won't see it.
- **Repositories** (`settings.gradle.kts`): `mavenCentral()` **first**, then the Aliyun google mirror,
  then `google()`. The mirror returns HTTP 502 (not 404) for artifacts it lacks, which aborts
  fall-through — so it must sit after mavenCentral. Do not reorder or add the Aliyun `public`/
  `gradle-plugin` mirrors (they 502). Gradle 9.6.0 wrapper is pre-seeded (downloads crawl here).

## Package layout (`com.pejvak.app`)

```
app/src/main/kotlin/com/pejvak/app/
├── PejvakApp.kt            # @HiltAndroidApp
├── MainActivity.kt         # single activity, Compose entry, edge-to-edge
├── core/                   # result types, time, dispatchers, haptics, search folding
├── data/
│   ├── local/              # Room: PejvakDatabase, 12 entities, DAOs, migrations — source of truth
│   ├── remote/             # LesanClient (Ktor) + online source adapters (one per provider)
│   ├── repository/         # single-owner repositories; screens never touch DB/network directly
│   └── sync/               # SyncEngine + WorkManager SyncWorker (pending→syncing→synced|failed)
├── domain/                 # plain Kotlin models + pure logic — NO Android imports
├── playback/               # Media3 PlaybackService (MediaSessionService), queue/run/stretch,
│                           #   checkpointing, effects (enhancer + ambient tone)
├── di/                     # Hilt modules
└── ui/
    ├── theme/              # tokens, light/dark ColorScheme, glass, typography — ALL colors here
    ├── navigation/         # PejvakNavHost, routes, global sheet host
    ├── components/         # glass surfaces, rows, fields, dock, mini-player, motion, icons
    └── screens/            # one package per screen
```

## Product rules (full list in root AGENTS.md + the plan §6)

- **Offline-first:** write Room first; sync is background, batched (≤50), idempotent on `clientId`,
  never blocks or errors the UI.
- **Session tracking:** pure state machine in `domain/` (no Android imports), driven by real player
  events — never `Timer`/polling. Checkpoint every 10 s; recover orphans on launch as `interrupted`.
  Sessions append-only after finalize. **Integer seconds** for durations, epoch millis for timestamps.
- **contentHash is identity** (SHA-256 first 1 MB + size; online = sha256("online:source:external")).
- **durationListenedSec = wall-clock** via the delta rule `0 < delta < 5`.
- **Auth wire:** JWT in `token` header (no Bearer); `{success, body}` envelope authoritative.
- **Device-only prefs never sync** (volume/enhancer/tone); shared settings = languageCode/defaultSpeed/
  historySort, LWW.

## UI rules (see DESING.md for the full spec)

- **Glassmorphism** per `DESING.md` (from `ignoreAssets/sample.jpg`). All colors in `ui/theme/`; no
  color literals outside it. Light + dark from day one; theme mode is a setting.
- **English LTR UI** (owner decision). Persian is **content**: `UserText` per-text RTL + bundled
  Vazirmatn; search folding in `core/`. No hardcoded direction; use start/end.
- Every user-facing string in `res/values/strings.xml`. One icon family behind a semantic `Icon`.
- The contrast contract is a test, not a formality — never weaken a threshold to make a palette pass.
- Isolate the 1 Hz position tick to leaf composables; honor reduced motion.

## Design system — the water language

The app has one visual metaphor: **fish, sea, waves**. Anything that moves, drags, or reads a value
draws the same sine, so the product feels like one body of water instead of a pile of unrelated
animations. Two rules keep it that way:

1. **One home for the curve.** `ui/components/Wave.kt` owns every primitive. Nothing else may
   re-derive a sine, and no screen may invent its own wavelength.
2. **Absolute wavelength.** Never tie a frequency to the width of the filled part of a bar — that is
   what made the first seconds a tight scribble and the last stretch a straight line.

| Primitive | Use |
| --- | --- |
| `WAVE_WAVELENGTH_DP = 64f` | the app's crest-to-crest span |
| `waveOffsetAt(x, amplitude, wavelength, phase, variation)` | the *single* evaluation of the curve |
| `wavePath(from, to, cy, amplitude, wavelength, phase, taper, variation, taperEnd)` | the stroke itself |
| `ramp(distance, edge)` | smoothstep taper so a stroke never starts with a vertical jump |
| `rememberWavePhase(periodMillis = 3_800)` | the drift; always called, never conditionally |
| `drawWaveWake(...)` (internal) | the three-strand ripple behind a playhead |

**Anything that sits *on* the wave** — a playhead, a slider thumb — must ask `waveOffsetAt` for the
same number the path was built from. Re-deriving it from a separate animation is how the dot ends up
floating off the line.

**Controls.** `WaveSlider` is the only slider in the app; Material's `Slider` and `RadioButton` are
gone. `WaveProgressBar` is the read-only sibling (dotted unfilled range, solid crest, head dot) and
is what a progress value looks like outside the player. `LevelSliderRow` / `GainSliderRow` are the
standard wrappers — reach for those before composing a slider inline.

**Sorting a collection.** The folder and online collection screens own their order: changing the sort
chip reorders the visible list immediately, from the same plan the queue uses (`orderCollectionRows`)
— never a second sort pass, or a shuffle could show one order and play another. The player's chip sorts
the live run; the collection screen's chip sorts the list and the next run. Playlist screens have no
sort control (they are `Manual`/`Smart` by construction).

**Sheets.** `GlassSheet(onDismiss, modifier, title, subtitle, icon, content)` is the only bottom
sheet. A titled sheet *must* pass `icon`: the header is an accent icon bubble, the headline, an
optional subtitle, then a hairline wave rule. Do not mount a raw `ModalBottomSheet`.

**Trailing icon groups.** Wrap adjacent action bubbles in `ActionCluster` so two icons can never butt
together — the missing margins in round 4 were all this one mistake.

**Tabs inside a screen.** The dock's tabs are routes; a screen's own tabs (the Library's Tracks /
Folders / Playlists / Recent chips) are not — they are **pages of a `HorizontalPager`**, and the
pager is the only accepted answer. A pager tracks the finger, so half a swipe shows both neighbours
and the transition is continuous; a hand-rolled drag cannot, and every attempt so far read as a jump.
The chips are a `LazyRow` beside the pager, not part of it: they read `pagerState.currentPage`
(not the view-model's value, so the highlight crosses over *with* the content mid-drag), they
`animateScrollToPage` on tap, and a `LaunchedEffect(currentPage)` calls
`chipState.animateScrollToItem(currentPage - 1)` so the selected chip is carried into view — on
Playlists or Recent it otherwise sits off-screen. The pager is bounded, so it does not and must not
reach the dock: the header and chips are pinned outside it, and `Modifier.weight(1f)` on the pager
keeps only the page content scrolling.

**Motion.** Page changes use `pageEnter` / `pageExit` / `pagePopEnter` / `pagePopExit` (incoming rises,
outgoing sinks, mirrored on pop) plus exactly one `WaveSweep` per route change. Tabs switch through
`navigateTab` (saveState / restoreState / launchSingleTop) so the dock and the swipe gesture cannot
drift apart. Everything is gated on `useMotionEnabled()`: with motion off, amplitudes animate to zero
and `WaveSweep` composes nothing at all.

**Colour and alpha.** `glassFill` is a ~6 % white — `copy(alpha = 1f)` paints *solid white*, which is
how the player once went opaque. Always scale it: `copy(alpha = tokens.glassFill.alpha * factor)`.

**Frosting.** `LocalSheetPresence` / `SheetPresence` counts open sheets; the shell blurs its own
content and `NowPlayingSheet` frosts its own surface. `Modifier.blur` is a no-op below API 31, so a
surface that relies on it also needs its alpha fallback.

## Diagnostics

Crashes are captured, not guessed at. `core/CrashLog` installs an
`UncaughtExceptionHandler` first thing in `PejvakApp.onCreate`, writes
`files/crashes/last-crash.txt` (time, version, device, thread, exception, stack) and keeps five
dated copies; the previous handler still runs, so the platform's own reporting is unchanged.
Settings → Diagnostics shares the newest file through a `FileProvider` scoped to that folder —
the only files the app ever hands to another app. Never add a second reporter, and never log to
`files/` from anywhere else.

A Lazy list's `key` must be unique **by construction**. `context_plays` keeps one row per play, so
anything keyed by a context (Continue cards, history collections) needs a dedupe like
`domain/resumableRuns()` first — a repeated key is an `IllegalArgumentException`, not a cosmetic
duplicate, and it closes the app.

## Gesture rules (learned the hard way — do not re-litigate)

- **Pointer events are delivered deepest node first, and a scroll container consumes them.** A
  `verticalScroll` or `LazyColumn` eats *every* vertical drag, so a parent's
  `detectVerticalDragGestures` / manual `awaitPointerEvent` loop never fires (`change.isConsumed` is
  already true on the first move). For a "pull down to dismiss" gesture, use
  `NestedScrollConnection.onPostScroll` (leftover while `scroll.value <= 0`) and put
  `.nestedScroll(connection)` **before** `.verticalScroll(state)` in the modifier chain — the
  connection has to be outside the scroller.
- **A pull ends three ways, and all three must land somewhere.** A slow lift produces no velocity, so
  no fling is dispatched and `onPreFling` never fires; a fling keeps reporting leftover deltas after
  the finger is gone. Take the release from the pointer stream (`PointerEventPass.Initial`, never
  consuming) **and** `onPreFling`/`onPostFling`, and accept `onPostScroll` leftover only for
  `NestedScrollSource.UserInput`. Missing any of these is what leaves a sheet stranded half way.
- **Two `pointerInput` modifiers on one node:** only the inner one receives events. Use one handler
  that resolves the axis itself (see `Scrubber`).
- **`Animatable.animateTo` cannot run inside `awaitEachGesture`** (restricted suspension). Launch it
  in a `rememberCoroutineScope` and let the gesture function return.
- **`detectHorizontalDragGestures` consumes the event that crosses the slop.** If the handler may
  decline the gesture (no sibling view left in that direction), measure the slop yourself and
  consume only after deciding. A helper that consumes first kills the parent's chance to act on the
  same drag. This is the reason a hand-rolled tab swipe kept beating the scroll containers; a
  `HorizontalPager` has the same discipline built in and declines at its ends by construction.
- **The dock is the only way between screens.** Swiping never changes route: there is no tab swipe
  on the NavHost, so a drag that runs out of pages inside a screen simply stops there instead of
  jumping to the next screen (round 8: swiping right on the Library's last page used to land on
  History). A screen's own tabs are a bounded `HorizontalPager`; if a new screen needs its own
  tabs, give it one too rather than reaching for a gesture at the NavHost level.

## Roles

The work has three roles. They are not interchangeable — most wasted effort comes from one of them
doing another's job.

**Owner (product).** States problems in prose, from the running app: what looks wrong, what feels
off, what is missing. Owns taste and priorities; accepts or rejects a result by looking at it. Does
not read code, does not specify implementation, and is never asked to choose between internals.
A round of issues arrives as a numbered list; the answer to it is a build they can tap, not an
explanation.

**Agent (implementer).** Owns everything between "here is the problem" and "here is a build". Reads
the code before changing it, picks the approach, keeps the design system intact, updates the plan as
each small task lands, and verifies on the emulator in both themes before reporting. Reports what
changed in the owner's terms (what they will now see), and states plainly what is *not* done.
Never invents a feature ID, never silently drops one, never weakens a test to make a palette pass.

**Reviewer (verifier).** Checks the result against the owner's words, not against the agent's
summary: does the described thing happen on screen, in light *and* dark, with motion on *and* off,
offline, and after a retry? Confirms `assembleDebug` and `testDebugUnitTest` pass. Trust but verify —
an agent's summary describes intent, so look at the diff and the screenshot.

**Hand-off contract.** The owner's list is the spec; the plan (`docs/plans/01-native-rewrite.md`) is
the record; the code is the truth. When the three disagree, fix the two that are wrong.

## Version pins (verified stable on this machine, from Hawraa)

AGP 9.5.1 · Gradle 9.6.0 · Kotlin 2.4.21 (built-in) · KSP 2.3.13 · Hilt 2.60.1 · Compose BOM
2026.09.00 · Room 2.8.5 · Media3 1.11.1 · WorkManager 2.12.0 · Navigation 2.10.2 · Lifecycle 2.11.0 ·
Activity 1.13.0 · DataStore 1.3.0 · Ktor 3.6.1 · kotlinx-serialization 1.13.0 · coroutines 1.11.0 ·
Coil 3 (latest stable) · Haze 2.1.0 (`haze` + `haze-blur`, shell frost only). Bump only with a stated reason; check AGP compatibility first.

## Documentation & plan discipline

Sector docs live in `docs/`: `summary.md` (orientation), `plans/01-native-rewrite.md` (roadmap **and**
progress record, with the full feature inventory), `prompts/01-native-rewrite.md` (the original brief).
Read `docs/summary.md` first when picking up work.

**⚠️ Update the plan after EVERY small task** — tick the box, append a progress-log entry. Not at the
end of a phase or session. **Feature parity is the contract:** every feature ID in the plan §3 must end
up implemented or explicitly retired with a reason. Nothing is silently dropped.

## Done criteria

A change is done when `./gradlew assembleDebug` passes, unit tests for touched pure logic pass, and
(for UI) it has been looked at in both themes. Do not claim a feature complete until its offline,
retry, and recovery states have been exercised. Never commit unless explicitly asked (Conventional
Commits + Gitmoji when asked). Never use `git reset` or destructive shortcuts. Throwaway scripts live
in `ignore-scripts/`.