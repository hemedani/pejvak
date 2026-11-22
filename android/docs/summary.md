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