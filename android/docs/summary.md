# Pejvak Android — Summary

> **Sector:** `android/` · **App:** FlowCast (temporary name), `applicationId com.flowcast.app`, code package `com.pejvak.app`
> **Read this first** when picking up native work with any agent. Then read
> [`../AGENTS.md`](../AGENTS.md) (rules), [`plans/01-native-rewrite.md`](plans/01-native-rewrite.md)
> (what to do next + full feature inventory), [`prompts/01-native-rewrite.md`](prompts/01-native-rewrite.md)
> (why), and [`../DESING.md`](../DESING.md) (the look).
>
> **Plan discipline:** the plan is a living record. **Update it after every small task** — tick the
> box, append a progress-log entry.

---

## 1. What this app is

An **Android-only, native Kotlin + Jetpack Compose** rewrite of Pejvak — an offline-first audio player
for audiobooks, long-form content, and music. Its differentiators are an **exhaustive, queryable
playback history** (every session/stretch/run recorded) and **timestamped annotations** that sync
across devices, plus online streaming/downloading from free sources.

It replaces the React Native app in `mobile/` (which stays untouched until retired). The rewrite exists
because RN native modules became a source of crashes, sluggishness, and a large APK. The **backend does
not change** — the native app speaks the same Lesan wire protocol to the same acts.

Development is **incremental, step-by-step**, with frequent device testing. Feature parity is the
contract: every feature of `mobile/` is catalogued with an ID in the plan §3 and delivered phase by
phase.

## 2. Current status (Phases 0–14 complete → release/owner device pass)

**App renamed FlowCast** (`applicationId com.flowcast.app`, code package still `com.pejvak.app`) so it
installs **alongside** the RN app (`com.pejvak.app`). Skeleton + design system + data layer + playback
engine + local library pipeline + auth & sync + player UI + annotations, verified: `./gradlew assembleDebug` → BUILD SUCCESSFUL;
`testDebugUnitTest` → 404/404 pass, zero failures. 12-table Room schema verified column-for-column
against RN. Debug APK at `app/build/outputs/apk/debug/app-debug.apk` (~91 MB); the R8 release APK is **14 MB**
(`app/build/outputs/apk/release/app-release-unsigned.apk`). No device attached — background/lock-screen playback, live-backend login, a
second-install pull, scan/import and visual checks are the owner's.

| Area | State |
|---|---|
| Feature inventory (~180 IDs) + 15-phase roadmap | ✅ in plan §3–4 |
| `DESING.md`, `AGENTS.md`, prompt record, this summary | ✅ done |
| Gradle skeleton + app shell (theme, canvas, glass dock, splash) | ✅ done |
| Design system + component gallery | ✅ done |
| Data layer: 12-table Room schema (1:1 RN) + DAOs + mappers | ✅ done |
| Pure domain: hash, session math, phase, palette, naming, stretch, smart playlists | ✅ done |
| Playback engine: pure PlaybackEngine + Media3 service + runs/stretches/checkpoints | ✅ done (19 tests) |
| Local library pipeline (scan/import/hash/metadata/artwork/missing) | ✅ done (Phase 4) |
| Auth + sync: Lesan client, secure token, gate/restore/logout, push/pull/reconcile, triggers, Settings slice | ✅ done (Phase 5) |
| Player UI: Now Playing overlay, scrubber/markers/wave, transport, sheets, mini-player, 1 Hz isolation | ✅ done (Phase 6) |
| Annotations & Notes: repository, composer, markers/selected note, Notes tab search/filter, Markdown export | ✅ done (Phase 7) |
| History, Discover, online sources, downloads (Phases 8–11) | ✅ done |
| Audio effects: enhancer on real session, ambient tones, device-only prefs (Phase 12) | ✅ done |
| Settings, AI catalogue, share/gallery/credits polish (Phase 13) | ✅ done |
| Hardening & release: parity audit, R8 release (14 MB), splash/predictive-back, Room smoke test (Phase 14) | ✅ done |
| Owner bug-fix round: tab order/insets, Library→Online shelf, online URL re-resolve, sync identity, crash containment | ✅ code (build green) |
| Owner UX round: mini wave, open-player-on-play, wavy online loading, stroked floating sheets, glass player, Online default tab | ✅ code (emulator verified) |
| Owner UX round 2: sheet side margins + frosted backdrop, transparent dock/mini, history rows = AI + delete (tap → detail+resume), removed stray top-right chrome | ✅ code (build green) |
| Owner bug round: folder keys with spaces (`Uri.encode`, not `URLEncoder`), player context chip opens its collection, queue/playlist key safety, scrubber wave redesign (fixed wavelength, rippled track, gradient ghost layer) | ✅ code (emulator verified, dark + light) |
| Owner round 2: scrubber resting line → real loudness strip (MediaCodec RMS, 84 buckets, dual cache), played wave → fish-wake (two flanking strands + centre, phase-offset, fading into dots and converging) | ✅ code (emulator verified, dark + light, playing + paused) |
| Owner round 3: playhead rides the wave (`waveOffsetAt` shared with `wavePath`), one `drawTrack` renderer used by both the scrubber and the dock at `MINI_SCALE` | ✅ code (emulator verified, dark + light, playing + paused) |
| Owner round 4: folder page (scrollable chips, played state per row), icon spacing via `ActionCluster`, backdrop blur behind the player's own sheets, modal headers + tone picker + session timeline redesign, `WaveSlider` everywhere, room-tone label, swipe-down to minimise, swipe between dock tabs, wave page transitions | ✅ code (emulator verified) |
| Owner round 5: `AGENTS.md` gained the design system + roles + gesture rules; every per-item AI button opens a **catalogue sheet** (hero band, four tool rows, why panel) instead of jumping to the AI tab, and a tool row opens a **description sheet** stacked on top; streams and undecodable files get a seeded sample loudness strip instead of a flat line | ✅ code (emulator verified, dark + light) |
| Owner round 6: the player's swipe-down always resolves — it snaps back up or leaves downwards, never rests half way (pointer release + `onPreFling`/`onPostFling`, and fling deltas no longer feed the pull); the Library's Tracks / Folders / Playlists / Recent views swipe left/right via `Modifier.pageSwipe`, which declines at either end so the dock's tab swipe still takes over | ✅ code (emulator verified, dark + light) |
| Plan 03 — collection-first playback: semantic-folder/online resolution through one launcher, resume/auto-conversion with condition inheritance, live sort (chip + sheet on both the player and the collection screens, reordering the visible list and the run together) patching the active session, narrow Room updates | ✅ code (emulator verified online; local folder fixtures absent) |
| Owner round 7: Discover no longer crashes on duplicate Lazy keys (`resumableRuns` keeps the newest run per collection); `core/CrashLog` writes uncaught exceptions to `files/crashes/` and Settings → Diagnostics shares the last one, so a crash on the phone no longer needs `adb` or a screenshot | ✅ code (emulator verified) |
| Owner bug round: play/pause dead after the media service self-stops (BT disconnect + background timeout) — resume now re-loads the current track when no player is bound, transport commands restart the service, and the mini-player gained a close button | ✅ code (build + 492 JVM tests green; on-device BT/kill pass is owner's) |
| Owner round 8 (plan 04, modal overhaul): every modal sheet header rebuilt on a teal glow icon bubble + stronger title; `WaveProgressBar`/`ListeningTimeline` rewoven to the volume-slider one-path+clip technique (flat tapered ends, no break at the head); history played/heard sections recoloured to `accentTeal`; the flat run bar replaced by a wave bar; ~20 new semantic icons wired into sheet rows/sections/preset+sort chips | ✅ code (assembleDebug green, zero warnings, JVM tests green; light/dark visual pass is owner's) |
| Owner round 9 (plan 04 §7): played/heard recoloured from teal to the **track's own aurora ramp** (light stop); fixed the playback card breaking on a long value (unweighted value starved the weighted label to one-letter-per-line — both columns now weighted); opening the AI sheet no longer collapses the player (it floats over), and the collection folder-name navigates but **re-expands the player on back**; cleaned 4 pre-existing Kotlin warnings | ✅ code (assembleDebug green, zero warnings, JVM tests green; on-device visual/gesture pass is owner's) |
| Owner round 10 (plan 04 §9): history SESSION card gained a **Day** row (weekday + date via new pure `formatDayOfWeek`); the cold-launch **blue screen** replaced by a branded **`SplashIntro` logomotion** (logo surfaces on a rising crest + ripple bloom + wordmark over the ambient canvas, then fades off `AuthGate`), with the system splash background switched to the canvas base for a seamless handoff | ✅ code (assembleDebug green, zero warnings, JVM tests green; on-device intro/visual pass is owner's) |
| Owner round 11 (plan 04 §10): collapsed the **two launch screens into one** — stopped holding the OS system splash (`setKeepOnScreenCondition` removed, settings load in the background under the intro) and made its icon transparent, so the branded intro is the only splash the listener perceives | ✅ code (assembleDebug green, zero warnings, JVM tests green; on-device single-splash check is owner's) |
| Owner round 12 (plan 05): **Track detail** rebuilt to surface all loaded data (the unused `SessionSummary`, fuller `AudioInfo`/tags/file) and **hide empty sections**; **History Stats** fixed (the `StatRow` label-starvation bug that wrapped "Longest session" one letter per line) and redesigned — headline + stat tiles, a proportional media-split bar, a gradient daily chart with labels, ranked leaders with artwork tiles. New shared `ui/components/DetailBlock.kt` (`DetailSection`/`DetailRow`/`StatTile`/`MetaChip`) backs both. Follow-up: `GlassChip` now shows icon + label + count together (the Local/Online sub-tabs' `folder`/`online` marks were hidden by the count-replaces-icon rule) | ✅ code (assembleDebug green, zero warnings, JVM tests green; on-device light/dark visual pass is owner's) |
| Owner round 13 (plan 06, new server + non-blocking auth): pointed `LESAN_BASE_URL` at `http://46.245.98.207:1405/lesan`; **removed the hard auth gate** — `AuthGate` now always renders the app (restore + migration run in the background, never a full-screen login). Added a **home-screen auth button** in the Library header that opens a register/login **modal** (`AuthSheet`, a `GlassSheet`) when signed out and an **account + sync sheet** (`AccountSheet`) when signed in. The critical fix for "preserve my data": the sync engine only pushes `pending`/`failed` rows, so anything already `synced` to the *old* server would never reach the new one — a **one-time endpoint re-queue** (`SyncRepository.ensureEndpointMigrated`, keyed on a stored `syncEndpoint`) flips every acknowledged row back to `pending` once so it re-pushes (safe: `syncLocalData` is idempotent on `clientId`). Pure `domain/AuthSurface.kt` predicates + `AuthSurfaceTest`; new glyphs `cloud_upload`/`cloud_done`/`person_add`. | ✅ code (assembleDebug green, zero warnings, 500 JVM tests green; on-device live login/sync/server-move + light/dark visual pass is owner's) |
| Owner device pass: notification crash logcat, offline→online, kill recovery, themes, haptics, performance | ⬜ owner |

## 3. Tech stack (pinned, verified on this machine via Hawraa)

| Piece | Version |
|---|---|
| AGP | **9.5.1** (built-in Kotlin — do NOT apply `org.jetbrains.kotlin.android`) |
| Gradle | 9.6.0 (wrapper pre-seeded) |
| Kotlin | 2.4.21 |
| KSP | 2.3.13 |
| Hilt | 2.60.1 |
| Compose BOM | 2026.09.00 |
| Room | 2.8.5 |
| Media3 | 1.11.1 |
| WorkManager | 2.12.0 |
| Navigation Compose | 2.10.2 |
| Lifecycle | 2.11.0 |
| Activity | 1.13.0 |
| DataStore | 1.3.0 |
| Ktor | 3.6.1 |
| kotlinx-serialization | 1.13.0 |
| coroutines | 1.11.0 |
| androidx.hilt | 1.4.0 |
| Coil | 3.x (artwork) |

minSdk 29 · targetSdk 36 · compileSdk 37.

## 4. Build quirks (this machine)

- `dl.google.com` blocked → repos are `mavenCentral()` → Aliyun google mirror → `google()`. **Order
  matters** (mirror 502s on missing artifacts). Never reorder or re-enable SDK auto-download.
- JDK at `/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`; set `JAVA_HOME`.
- SDK at `~/Library/Android/sdk`; platforms android-36 & android-37.0 installed manually (need
  `package.xml`). Gradle wrapper dist pre-seeded from Hawraa (downloads crawl).
- Local ports in use by other projects: 1370, 1404, 1405, 1406, 8080, 8090. Pejvak backend default: 1405.

## 5. Key decisions (full table in plan §2)

- **English LTR UI**; Persian first-class for content (UserText RTL + Vazirmatn + search folding).
- **Glassmorphism** redesign per `DESING.md` (supersedes the old opaque-card rule).
- **Media3 ExoPlayer in a `MediaSessionService`** (background audio, notification, lock-screen + BT
  buttons). The UI drives playback through the shared `PlaybackEngine` **singleton** (Hilt
  `SingletonComponent`), not a bound `MediaController`; the service owns the `ExoPlayer`, feeds the
  engine player events and executes its `PlayerCommand`s.
  **Lifecycle pitfall:** the engine + `ExoPlayerCommand` singletons outlive the service. When the
  service stops itself (e.g. Bluetooth disconnect → pause → background timeout) `command.player`
  becomes `null` while the engine still holds the track, so a bare resume was a silent no-op and the
  mini-player's play/pause looked dead. Fix: `resume()` re-loads the current track when `command.isBound`
  is false, every transport command calls `PlaybackService.start()` first, and the mini-player gained
  a close button (`engine.stop()` + `PlaybackService.stop()`).
- **Room schema mirrors the RN SQLite 1:1** (12 tables) — keeps the sync contract intact.
- **Enhancer on the player's real audioSessionId** (native advantage over RN's output-mix 0).
- **FlowCast** (`applicationId com.flowcast.app`, code package still `com.pejvak.app`) installs
  **alongside** the RN app (`com.pejvak.app`); both share the same backend/account. History is restored
  via login + sync.

## 5b. UI pitfall — the wave progress bars

`WaveProgressBar` and `ListeningTimeline` must draw **one continuous `wavePath` over the whole range
with a wide `ramp` taper at both ends**, then **`clipRect` the same path** to paint the played/heard
part — exactly like `WaveSlider`. The earlier versions built the played part as a *second* path with a
different wavelength/amplitude than the resting track; that is what made the line **break at the head**
and look worse than the volume bar (AGENTS "one home for the curve" + "absolute wavelength"). Anything
that sits on the wave (the head dot) must call `waveOffsetAt` with the same args, including the end
`ramp`, or it floats off the flattened edge. The history played/heard colour is `accentTeal` (positive
readout), not the player's white `accent`; `WaveProgressBar`'s `color` param still defaults to `accent`
so non-history callers keep their look.

### 5c. Modal pitfalls found in round 9

- **Label/value starvation in a `Row`.** A settings/fact row that gives the label
  `Modifier.weight(1f)` but leaves the value **unweighted** measures the value first at the full
  remaining width; a long value (e.g. a collection title) then starves the label to ~0 width and it
  wraps **one letter per line** over the icon. Fix: weight **both** columns (label `1f` single-line
  ellipsize, value `1.3f` right-aligned, ≤3 lines ellipsize) so neither can starve. Applies to
  `SessionDetailSheet.Fact` and `HistoryScreen.FactRow`.
- **The full player is a full-screen overlay.** Anything that must reveal another *route* (the
  context chip → collection) has to collapse it; anything that opens a *sheet* (AI catalogue, queue,
  sleep, tone…) must **not** call `onDismiss()` first — the sheet floats over the player and frosts it
  via `LocalSheetPresence`. For the route case we record `reopenPlayerBackStackId` (`NavBackStackEntry.id`
  is a **String**, not Int) and re-expand on return.
- **Zero-warning gate vs. incremental builds.** `compileDebugKotlin` only re-emits warnings for the
  files it recompiles, so a cached data-layer warning stays hidden until a wider recompile surfaces it.
  Round 9 cleaned the surfaced set (`MesbahAdapter` unnecessary `?.` on the `anchor` that the
  `?: continue` proves non-null; `OnlineCatalogService` elvis on a non-null `streamUrl`; a redundant
  `heroRect != null` in `NowPlayingSheet`). Always do a clean-ish compile before claiming "zero warnings".

### 5d. Splash / intro (rounds 10–11)

- **One perceived splash, two OS layers.** Android 12+ always paints a system splash before the app
  frame; the branded `ui/screens/splash/SplashIntro.kt` plays over `AuthGate` and then fades off it. To
  stop the system splash reading as a separate "first screen" (round 11), we **do not hold it**
  (`setKeepOnScreenCondition` removed — settings load in the background under the intro) and its icon is
  a **transparent** `@drawable/splash_transparent_icon`, so the OS phase is a sub-frame canvas handoff.
  Keep `windowSplashScreenBackground` on `@color/splash_background` (= canvas base) so that frame matches
  the intro. A momentary colour flash can still show if the in-app theme differs from the system theme
  (splash colour is a resource; intro colour follows the saved preference) — harmless.
- **`Modifier.padding` overload gotcha.** There is no `padding(top=…, horizontal=…)` overload — mixing
  them fails to compile ("None of the following candidates"). Chain `padding(top=…).padding(horizontal=…)`.
- `drawWaveWake` is `internal` in `ui/components`, but `internal` is module-wide, so the splash package
  can reuse the wave primitives without duplicating them (AGENTS "one home for the curve").

### 5e. Detail screens (round 12) — `LazyListScope` gotchas

- **`stringResource` is `@Composable` — it cannot run at the `LazyColumn { }` content scope.** Building
  row lists (`listOfNotNull(... stringResource ... )`) or chip labels directly in the `LazyListScope`
  lambda fails to compile ("Composable invocations can only happen from the context of a @Composable
  function"). Move them inside `item { }` / `DetailSection { }`, and decide section visibility with a
  **non-composable** null check (`audio.container != null || …`) at the scope level.
- **Don't smart-cast a nullable through a `Boolean` val.** `val hasAudio = info != null && (info.x …)`
  then `if (hasAudio) { item { info?.x } }` leaves the compiler warning "unnecessary safe call"
  inconsistently. Bind first: `val audio = info; if (audio != null) { … use audio.x … }`.
- The label/value starvation fix is now centralised in `DetailRow` (both columns weighted); reuse it
  instead of hand-rolling `Row { Text(weight(1f)); Text(value) }` which reintroduces the bug.

### 5f. Server move & non-blocking auth (round 13)

- **A URL swap alone silently loses data.** The sync engine reads only `sync_status IN
  ('pending','failed')`. Rows `synced` to an old server are considered done and never re-sent to a
  new one, and nothing stored identified the server. Any "move / re-point the backend" change MUST
  ship a one-time re-queue (`SyncRepository.ensureEndpointMigrated`, keyed on a stored
  `syncEndpoint`) that flips `synced`→`pending` once. It is safe because `syncLocalData` dedupes on
  `clientId` (unique sparse index): re-push to a server that has the row is a skip, to an empty one
  is the insert that preserves the data.
- **Stale token from the old server.** On the new server a saved old token makes `getMe` return
  `success=false`, which `LesanClient` classifies as `Validation` → `isAuthRejection()` is true →
  `AuthRepository.restore` clears the session. So the gate correctly falls back to "needs sign in"
  rather than trusting a dead token. Do not treat `Validation` as non-auth here.
- **Non-blocking gate:** `AuthGate` no longer branches to a full-screen `AuthScreen`; it always
  renders `PejvakNavHost`. The auth form lives in `AuthSheet` (a `GlassSheet`) and the signed-in
  surface in `AccountSheet`, both hosted as **shell siblings** so they float over the app (same
  rule as the AI sheet — do not collapse the player to open them).
- **One shared `AuthViewModel`.** `hiltViewModel()` inside a sheet would mint a *different*,
  back-stack-scoped instance, so the modal would establish a session the home button never sees.
  `AuthGate` holds the single activity-scoped VM and passes it (`shared = …`) into the sheets.

## 6. Where to look in the old app (reference for parity)

| Native concern | RN reference |
|---|---|
| Session math / checkpoints | `mobile/src/lib/sessionTracking.ts`, `TrackPlayerService.ts` |
| DB schema (12 tables) | `mobile/src/lib/db/migrations.ts`, `types.ts` |
| Sync contract | `mobile/src/services/SyncService.ts`, `lib/syncEngine.ts`, `lib/reconcile.ts` |
| Online adapters | `mobile/src/lib/online/*` |
| Effects / tones | `mobile/src/services/AudioEffectsService.ts`, `lib/ambientTones.ts`, `modules/audio-enhancer` |
| Design tokens (old) | `mobile/src/theme/tokens.ts` |
| Feature specs | `mobile/AGENTS.md` (effectively the spec), root `docs/DEEPSEEK|GROK|QWEN.md` |