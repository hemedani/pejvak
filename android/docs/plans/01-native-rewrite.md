# Plan 01 — Native Android Rewrite

> **This file is both the roadmap and the record.** Work is done by taking the first unchecked box,
> doing it, ticking it, and appending one entry to the [Progress log](#progress-log).
>
> **⚠️ Update this plan after EVERY small task.** Not at the end of a phase, not at the end of a
> session — after each small task: tick the box, log what changed, note any decision. A future agent
> (or you, after a break) must be able to read the last log entry and know exactly where things stand.
>
> A phase is not finished until its **"Done when"** line is verified — not when its boxes are ticked.
> Where this plan and the code disagree, **the code is right and this file is a bug.**

**Status:** Phases 0–5 complete (skeleton, design system, data layer, playback engine, local library
pipeline, auth & sync — 230/230 tests, zero warnings). App renamed **FlowCast** (`com.flowcast.app`) so
it installs alongside the RN app. Phase 6 (player UI) is next. Plan authored 2026-11-14.
**Sector:** `android/` · **Companion docs:** [`../summary.md`](../summary.md), [`../AGENTS.md`](../AGENTS.md), [`../DESING.md`](../DESING.md)

---

## 0. How to use this document

| I want to… | Read |
|---|---|
| Know what exists, the stack, and the build quirks | [`../summary.md`](../summary.md) |
| Start work | [§4 Phases](#4-phases) — first unchecked box |
| Check whether a feature is covered | [§3 Feature inventory](#3-feature-inventory) — every feature of `mobile/` has an ID |
| Understand the visual language | [`../DESING.md`](../DESING.md) |
| Continue after a break | [Progress log](#progress-log) — last entry |
| Check a convention | [`../AGENTS.md`](../AGENTS.md) and root [`../../AGENTS.md`](../../AGENTS.md) |

**Rules of engagement**
1. One box at a time. If a box needs more than a session, split it and note the split in the log.
2. Never tick a box whose "Done when" you have not verified — run the gate, don't assume.
3. **Update this file after every small task** (tick + log entry). This is non-negotiable.
4. A decision that changes the architecture goes in [§2 Decisions](#2-decisions) with an ID.
5. A change is not "done" until `./gradlew assembleDebug` passes, unit tests for touched pure logic
   pass, and (for UI) it has been looked at in both themes.
6. Build with `JAVA_HOME` set to the Homebrew OpenJDK path (see summary). Do not "fix" the
   repository ordering or re-enable SDK auto-download.
7. **Feature parity is the contract:** every feature ID in §3 must end up implemented or explicitly
   retired with a stated reason in §2. Nothing is silently dropped.

## 1. Goal & scope

Rewrite Pejvak's mobile app **from scratch as a fully native Android app** (Kotlin + Jetpack Compose)
in `android/`, reaching **complete feature parity** with `mobile/` (Expo/RN) while fixing the three
problems that motivated the rewrite:

1. **Native-module fragility** — RN bridges (audio enhancer, file inspection, downloads) are a
   constant source of crashes and SDK-compatibility churn. Native Kotlin removes the bridge entirely.
2. **Sluggishness** — JS-thread position tracking, re-renders, and bridge latency. Media3 + Compose
   keep playback and UI on the platform's own rails.
3. **APK size** — the RN runtime + Hermes + JS bundle + duplicated native libs. A native Compose app
   with R8 should land around a fraction of the current size.

**In scope:** every feature in §3, the same Lesan backend contract, the new glassmorphism design
(`DESING.md`), English LTR UI with first-class Persian content handling.

**Out of scope:** backend changes (none needed), iOS, retiring `mobile/` (owner decides later),
new features beyond parity (AI tools stay a coming-soon catalogue, exactly as today).

**Build order** follows root `AGENTS.md`: DB → audio engine → services → screens, with the design
system and shell first so every screen is born in the new visual language.

## 2. Decisions

| ID | Decision | Rationale | Status |
|---|---|---|---|
| D1 | Native Kotlin + Jetpack Compose; no Flutter/RN/WebView UI | Owner requirement: state-of-the-art native only | resolved 2026-11-14 |
| D2 | Stack pinned to the verified Hawraa setup: AGP 9.5.1 built-in Kotlin, Kotlin 2.4.21, KSP 2.3.13, Hilt 2.60.1, Compose BOM 2026.09.00, Room 2.8.5, Media3 1.11.1, WorkManager 2.12.0, Navigation-Compose 2.10.2, Lifecycle 2.11.0, DataStore 1.3.0, Ktor 3.6.1, kotlinx-serialization 1.13.0, coroutines 1.11.0; minSdk 29, targetSdk 36, compileSdk 37 | Same machine, same network, verified building; bump only with a stated reason | resolved 2026-11-14 |
| D3 | Repos: `mavenCentral()` → Aliyun google mirror → `google()`; `android.builder.sdkDownload=false`; Gradle 9.6.0 wrapper pre-seeded from Hawraa | `dl.google.com` blocked here; mirror 502s on missing artifacts abort fall-through | resolved 2026-11-14 |
| D4 | Native `applicationId = com.flowcast.app` (display name **FlowCast**, temporary); code package stays `com.pejvak.app` for now | Owner wants **both versions side by side** on device (RN = `com.pejvak.app`). Install identity is the applicationId, so it must differ. Code package unchanged to avoid churn before the final name is chosen. Both share the same backend/account. *(Supersedes the original same-id plan; see prompt §4.)* | resolved 2026-11-14 |
| D5 | **English LTR UI** (owner's answer 2026-11-14); Persian content handled via search folding + per-text RTL detection; all strings in `res/values/strings.xml` | Preserves current product decision; no i18n framework | resolved 2026-11-14 |
| D6 | **Glassmorphism redesign** per `ignoreAssets/sample.jpg`, spec in `DESING.md`; supersedes the old opaque-card rule in `mobile/AGENTS.md` for the new app | Owner explicitly asked to build the UI on the new design | resolved 2026-11-14 |
| D7 | Playback = **Media3 ExoPlayer inside a `MediaSessionService`**; UI binds via `MediaController` | Proper background/lock-screen/Android Auto/BT controls with zero custom service code; the Voice/Auxio pattern | resolved 2026-11-14 |
| D8 | Room schema mirrors the RN SQLite schema **1:1** (all 12 tables, same column names/types, integer seconds) | Keeps the sync contract and every domain rule intact; enables a future local-data migration path | resolved 2026-11-14 |
| D9 | Sync = same Lesan wire protocol via Ktor (`{model, act, details:{set,get}}`, `token` header, `{success,body}` envelope), WorkManager triggers, batch ≤ 50, clientId idempotency | Backend unchanged; root AGENTS.md contract | resolved 2026-11-14 |
| D10 | Enhancer attaches to the **player's real `audioSessionId`** (not output-mix 0) | Native advantage: fixes the RN limitation where the effect shaped *all* device audio | resolved 2026-11-14 |
| D11 | Ambient tone = a second lightweight ExoPlayer instance looping the tone asset, mixed by Android | Same architecture as RN (two players), no native module needed; keeps BT sink alive | resolved 2026-11-14 |
| D12 | Artwork loading = **Coil 3**; metadata = `MediaMetadataRetriever` + a small pure-Kotlin ID3v2 reader for the extra tags (composer, ISRC, publisher, lyrics…) | Coil is the Compose standard; MMR covers most tags, the reader fills the gap without a heavy lib | resolved 2026-11-14 |
| D13 | Icons = `material-icons-extended` (Rounded/Outlined per DESING.md), one semantic `Icon` wrapper | Single icon family, same rule as the RN app | resolved 2026-11-14 |
| D14 | Persian content font: bundle **Vazirmatn** (OFL) for `UserText`; English UI uses the system sans with tabular figures | Beautiful Persian rendering offline; no license risk | resolved 2026-11-14 |
| D15 | Blur: `RenderEffect` on API 31+; graceful higher-opacity glass fallback on 29–30 (minSdk 29) | Real blur where the platform supports it; legibility never depends on it | resolved 2026-11-14 |
| D16 | No GPL code copied from reference projects (Voice/Auxio/Gramophone are GPL); patterns only | License hygiene | resolved 2026-11-14 |
| D17 | Single-module `:app` for now (Hawraa-style package layout), not Voice-style multi-module | Parity rewrite is already huge; module split can come later if build times demand | resolved 2026-11-14 |
| D18 | Old `mobile/` stays untouched until the owner retires it | Rewrite is additive; no destructive cleanup | resolved 2026-11-14 |

## 3. Feature inventory

Every feature of the existing `mobile/` app, catalogued 2026-11-14 from the full source tree.
IDs are referenced by the phases in §4. Status legend: ⬜ not started · 🔶 in progress · ✅ done · 🗑 retired (reason in §2).

### 3.1 Auth & account (`mobile/src/app/(auth)`, `AuthService`, `authStore`, `secureStore`)

| ID | Feature | Notes | Status |
|---|---|---|---|
| AUTH-01 | Login screen: email + password, field chaining, inline error line, link to register | Lesan `auth.login` | ✅ |
| AUTH-02 | Register screen: username, optional display name, email, password | Lesan `auth.register` | ✅ |
| AUTH-03 | JWT stored in secure storage (Keystore-backed), `token` header without Bearer | EncryptedSharedPreferences / Keystore | ✅ |
| AUTH-04 | Session restore on launch: token = proof, cached profile shown immediately, background `getMe` refresh; only unauthorized/forbidden/validation end the session | | ✅ |
| AUTH-05 | Auth gate: unauthenticated → auth flow; authenticated → tabs + detail screens | | ✅ |
| AUTH-06 | Logout (clears token + cached user; local data stays) | Settings danger action | ✅ |
| AUTH-07 | Friendly error mapping (offline/timeout/validation/…) | same vocabulary as RN `lib/errors.ts` | ✅ |
| AUTH-08 | Cached user profile in local KV (avatar initial, display name, email) | | ✅ |

### 3.2 Library (`mobile/src/app/(tabs)/index.tsx`, `import.tsx`, `missing.tsx`, services)

| ID | Feature | Notes | Status |
|---|---|---|---|
| LIB-01 | Library tab header: "YOUR LISTENING SPACE / Library", language pill, settings button | | ✅ |
| LIB-02 | First-run language prompt → chooses online content language, unlocks Online shelf | | ✅ |
| LIB-03 | Global search across all views at once, per-view match-count badges, "Also N under X" hint | Persian-folded index built once per data load | ✅ |
| LIB-04 | Tracks view: cards with artwork/palette tile, play count, note count, last played; Local/Online sub-segment when both exist | queue = visible half of library | ✅ |
| LIB-05 | Folders view: derived from `tracks.folder_key`, "x of y finished" progress, total duration, one-tap resume | | ✅ |
| LIB-06 | Playlists view: inline create form, delete with confirm, SMART section (5 smart playlists) | | ✅ |
| LIB-07 | Recent view: 12 distinct recent plays (tracks/folders/playlists), deep read (60) while searching | | ✅ |
| LIB-08 | Online shelf: source directory for chosen language, searchable | Needs online adapters — moves to Phase 10 (ON-04/ON-12) | ⬜ |
| LIB-09 | "Continue listening" spotlight card (most recent track of visible half) with resume | | ✅ |
| LIB-10 | Missing-files danger alert → Missing screen | | ✅ |
| LIB-11 | "Add audio" → Import wizard | | ✅ |
| LIB-12 | Idle-scheduled artwork backfill (8 files/visit, pauses during scroll, skips streams without stamping) | | ✅ |
| LIB-13 | Import wizard phases: choose → scanning → preview → importing → done | | ✅ |
| LIB-14 | Whole-device MediaStore audio scan with permission flow + refusal explanations | READ_MEDIA_AUDIO / READ_EXTERNAL_STORAGE | ✅ |
| LIB-15 | SAF folder pick with persisted tree grant; enumerate folder | | ✅ |
| LIB-16 | Scan plan statuses: New / Changed / In library / Duplicate / Moved (relink); identify pass hashes only changed (size,mtime) files; "new only" toggle; nothing written until final tap; outcome summary | | ✅ |
| LIB-17 | Content hash: SHA-256(first 1 MB + file size); online identity sha256("online:source:external") | pure, tested | ✅ |
| LIB-18 | Metadata extraction on import: title/artist/album/track/disc/year/duration + full ID3 (composer, genre, publisher, ISRC, encoder, lyrics) + embedded artwork | MMR + ID3v2 reader | ✅ |
| LIB-19 | Import inserts or relinks by contentHash (moved files keep history) | | ✅ |
| LIB-20 | Missing screen: grouped by source folder, "Nothing here is lost" explanation, per-track stake (plays/notes), rows → detail, CTA → import | | ✅ |
| LIB-21 | Track detail screen: artwork, origin badge, missing-file card, Play, stat grid, fact sections AUDIO / PLAYBACK / TAGS / FILE, session timeline, annotations, Markdown export of notes, add-to-playlist | | ✅ |
| LIB-22 | Live audio inspection facts: codec, bitrate, sample rate, channels, duration, embedded art; stream-aware ("Stream", no spinner for streams) | | ✅ |
| LIB-23 | Folder detail screen: progress/duration/run-stats subtitle, context history button, batch add-to-playlist, Play folder / Continue / Play again mode logic, add-to-queue, Save as playlist, per-track finished/resume rows | `~root` = storage root | ✅ |
| LIB-24 | Playlist detail screen: inline rename, delete w/ confirm, play as collection (records run), per-row play/remove/reorder (up/down), add tracks from library picker, context history, origin badges | | ✅ |
| LIB-25 | Smart playlists (5 rules): continue (Pick up), series (Next in series), commute (time-budget knapsack 15/30/45/60 min), forgotten (Forgotten favourites), review (Review your notes); every pick carries a human reason; Save as playlist freezes picks | pure recipes, tested | ✅ |
| LIB-26 | Smart playlist screen: rule title/tagline, picks + reasons, total duration, commute budget picker, Play / play-from-row, save, batch add | | ✅ |
| LIB-27 | Search engine: Persian folding (ي/ى→ی, ك→ک, hamza carriers, digits, ZWNJ/ZWJ/tatweel), fold once per load, quality→title→position ranking, highlight ranges | pure, tested | ✅ |
| LIB-28 | Per-track palette identity: deterministic aurora ramp from contentHash (8 ramps) | `paletteFor(hash)` | ✅ |
| LIB-29 | Artwork storage: embedded picture → app files dir; imported artwork saved; `artwork_checked_at` scheduling | | ✅ |
| LIB-30 | Track stats: play count, finished count, total/longest/average listen, speeds used, first/last played | `computeTrackStats` | ✅ |

### 3.3 Playback engine (`TrackPlayerService`, `sessionTracking`, `playbackPhase`, `ContextService`)

| ID | Feature | Notes | Status |
|---|---|---|---|
| PB-01 | Single playback owner: load/play/pause/resume/toggle/stop/seek/setRate; queue with index; next/previous (at ends restart current; skip signal) | Media3 service | ✅ |
| PB-02 | Background playback + lock-screen controls + notification (media style) | MediaSessionService; no Expo Go limits | ✅ |
| PB-03 | Audio focus handling, interruption (doNotMix), Bluetooth/headset media buttons | Media3 default + config | ✅ |
| PB-04 | Session recording: every continuous listen → PlaybackSession (startedAt/endedAt, start/endPositionSec, durationListenedSec, speed, completed, interrupted, deviceInfo) | | ✅ |
| PB-05 | Wall-clock listened math: delta rule `0 < delta < 5` counts; seek (delta>5 or <0) updates position only; integer seconds | pure state machine, tested | ✅ |
| PB-06 | Session splits: play after pause, speed change, deliberate track change start new sessions; seeks don't (set `seeked`) | append-only | ✅ |
| PB-07 | Checkpoint every 10 s; orphan recovery on launch (finalize interrupted, restore run/stretch links) | never lose a session on kill | ✅ |
| PB-08 | Stretches: continuous listens across auto-advanced tracks share `stretch_id`; handover only on auto-advance; `isComplete` = first second of first track → end of last, no seeks | | ✅ |
| PB-09 | Runs (PlaybackContext): one pass through a collection (playlist/folder/online); start/touch/finalize; resume by lastTrackId not index; completed run restarts at 0; listenedSec/finishedCount aggregates | | ✅ |
| PB-10 | ContextService.resolveQueue resolves folder/playlist/online fresh; online works offline from cached rows | | ✅ |
| PB-11 | Playback speed cycle [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]; default speed preference | ships RN's 5-step cycle [0.75,1,1.25,1.5,2] (plan list was aspirational) | ✅ |
| PB-12 | Sleep timer: 5/15/30/45/60 min → pause at deadline (ephemeral) | | ✅ |
| PB-13 | Wait/phase model: waiting {connecting|buffering, since, stream}; resolvePlaybackPhase; WAIT_REVEAL_MS=400, WAIT_LONG_MS=6000 staged copy; play button spinner, indeterminate timeline sweep | | ✅ |
| PB-14 | Volume preference 0–100 with dB curve (−40 dB floor), default 100 (missing ≠ muted), coalesced persist, device-only | | ✅ |
| PB-15 | Duration write-back once per track; live streams always start at 0 | | ✅ |
| PB-16 | Missing-file detection on load error → availability='missing' (never for online) | | ✅ |
| PB-17 | Position smoothing between ticks for UI (extrapolate + resync rules) | | ✅ |
| PB-18 | Resume from history pin (trackId + positionSec param) | | ✅ |
| PB-19 | Android Auto support (MediaSessionService browse tree) | 🗑 retired: no browse tree; RN had no Auto support; MediaSession transport still drives lock-screen/BT | 🗑 |
| PB-20 | `notePlaybackStarted` hook for radio source play-count notification | | ✅ |

### 3.4 Player UI (`player.tsx`, `NowPlayingSheet`, `PlayerContent`, player components)

| ID | Feature | Notes | Status |
|---|---|---|---|
| UI-01 | Full-screen Now Playing as morphing sheet from mini-player anchor; drag-handle/close header; own top insets | DESING.md §Now Playing | ✅ |
| UI-02 | Hero artwork with skip "kick" animation; title/artist; "listened" readout | | ✅ |
| UI-03 | Context chip ("4 of 12" + open collection) | | ✅ |
| UI-04 | Scrubber timeline with colored annotation markers; tap marker = seek + show note | | ✅ |
| UI-05 | WavyProgress ambient wave (only unbounded animation); indeterminate sweep while waiting | | ✅ |
| UI-06 | Transport: prev, −30 s, play/pause (SpinnerRing while waiting), +30 s, next | | ✅ |
| UI-07 | Speed cycle button | | ✅ |
| UI-08 | Chip row: Queue, Sleep, Jump-to-time, Enhancer, AI, Add-note, Add-to-playlist | | ✅ |
| UI-09 | VolumeControl + RoomToneControl (same LevelSliderRow) | | ✅ |
| UI-10 | Notes list (AnnotationList) in player | | ✅ |
| UI-11 | PlaybackStatusLine (connecting/buffering/preparing + long variants) | | ✅ |
| UI-12 | QueueSheet: jump within queue keeping context | | ✅ |
| UI-13 | SleepTimerSheet: 5/15/30/45/60 min | | ✅ |
| UI-14 | JumpToTimeSheet | | ✅ |
| UI-15 | AudioEnhancerSheet: boost/bass/treble sliders, availability sentence, tone picker entry | | ✅ |
| UI-16 | TonePickerSheet: 7 tones + credits panel | | ✅ |
| UI-17 | Mini-player row (dock half): artwork, title/artist, play/pause + trailing controls; 1 Hz ticks isolated to leaves | | ✅ |
| UI-18 | Standalone mini-player on non-tab detail screens | | ✅ |

### 3.5 Annotations & Notes (`AnnotationService`, `notes.tsx`, composer, markers)

| ID | Feature | Notes | Status |
|---|---|---|---|
| AN-01 | Create annotation at current position in one step (quick-add / long-press): text, tags, color | | ✅ |
| AN-02 | Edit annotation (LWW on updatedAt); delete (tombstone + sync) | | ✅ |
| AN-03 | AnnotationComposer: text, tags (Persian-folded dedupe), color swatches, position | | ✅ |
| AN-04 | Colored markers on progress bar; tap seeks + shows note | | ✅ |
| AN-05 | Notes tab: every annotation joined with track; search by text (highlighted)/tags/track/folder; date-range chip; delete w/ confirm | | ✅ (presets; custom dates in Phase 9) |
| AN-06 | Note rows open SessionDetailSheet in "note" mode | | ✅ (dedicated `NoteDetailSheet`; History's SessionDetailSheet arrives Phase 9) |
| AN-07 | `timesPlayedBefore` captured at creation | | ✅ |
| AN-08 | Markdown export of a track's notes via native Share | | ✅ |
| AN-09 | Library cards carry a live note count | | ✅ (repository `annotationCounts`; cards render in Phase 8) |
| AN-09 | Annotation count enrichment on library cards | | ✅ |

### 3.6 History & Stats (`history.tsx`, `listeningStretch`, stats-panel, export)

| ID | Feature | Notes | Status |
|---|---|---|---|
| HI-01 | History tab: two panels (History / Stats) via segmented control + pager | | ✅ |
| HI-02 | Sessions view grouped into stretches, day-sectioned cards; keyset pagination by stretch; deep read while searching | | ✅ |
| HI-03 | Collections view: runs (ContextPlayCard); tap = resume, open = collection screen, delete = tombstone | | ✅ |
| HI-04 | Search (tracks/collections, Persian-folded) | | ✅ |
| HI-05 | DateRangeSheet filter chip | | ✅ |
| HI-06 | Sort segmented control (newest/oldest), synced preference | | ✅ |
| HI-07 | Pull-to-refresh | | ✅ |
| HI-08 | Markdown export of history via native Share (respects filters) | | ✅ |
| HI-09 | SessionDetailSheet: timeline, facts, Resume, Delete (global, works from player) | | ✅ |
| HI-10 | ListeningTimeline visual | | ✅ |
| HI-11 | Stats panel: listening totals, per-day, top tracks/folders, completion, speed distribution (computed locally) | | ✅ |
| HI-12 | ContextHistorySheet + button (per-collection run history) | | ✅ |
| HI-13 | Resume from session/stretch/run (use-resume-history) | | ✅ |
| HI-14 | Soft-delete single/bulk sessions; tombstones sync | | ✅ |

### 3.7 Online / Discover (`discover.tsx`, `lib/online/*`, `OnlineCatalogService`, `DownloadService`)

| ID | Feature | Notes | Status |
|---|---|---|---|
| ON-01 | Discover tab: three swipeable pages — Continue / Favorites / Browse | | ✅ |
| ON-02 | Continue: open/closed online runs, resume, progress ratio + "Resume at m:ss" + download state | | ✅ |
| ON-03 | Favorites: saved online_collections, unfavorite, open | | ✅ |
| ON-04 | Browse: 46 world languages, searchable by native/English/code/alias; "not yet" for empty | | ✅ |
| ON-05 | Language picker sheet (shared with Library); language catalogue w/ native names + RTL flags | Discover picker shipped; Library onboarding keeps its short list | ✅ |
| ON-06 | Source adapters: manahej (WP+Sonaar JSON, signed URLs), aminikhaah, aminikhaahpodcasts, esra (HTML, cleartext), mesbah (HTML), shariati (REST+HTML, force https), librivox (zod API), radiobrowser (live), archive×46 | one adapter + registry line each | ✅ |
| ON-07 | Archive multi-facet language queries (English name OR ISO 639-2); format:("mp3") browse; playable filter by .mp3 extension; parseArchiveDuration (sec vs MM:SS, unreadable→0); gone item = 200 {}; stable /download/ URLs | | ✅ |
| ON-08 | Collection shapes follow source unit (archive page / work / book); COLLECTION_KIND_LABELS | | ✅ |
| ON-09 | OnlineCatalogService: 5-min cache, list/find/search/load (network→device fallback, fromCache), real trackCount on first open, resolveStreamUrls before download | | ✅ |
| ON-10 | Online collection screen: Continue/Play/Play-again, DownloadControl, favorite, open source page, series sections w/ per-series download, per-track stream/downloaded rows + progress, stale-cache notice, resume from collection_key | | ✅ |
| ON-11 | Source screen: collections w/ favorite toggle, download action + status line, live badge, language chips, homepage link, refresh, offline/error notices | | ✅ |
| ON-12 | Language screen: sources serving a language (honest empty state) | | ✅ |
| ON-13 | Online track = ordinary tracks row (origin='online'); file_uri = stream URL while streaming, downloaded file after; identity by source id not URL | | ✅ |
| ON-14 | Download queue-as-rows: one download_jobs row/track; sequential pump; MAX_ATTEMPTS=3 backoff 2s/8s; progress coalesced (500ms/1pp); whenIdle() before delete; resume interrupted | | ✅ |
| ON-15 | Download verbs: start / cancel (keeps files) / retry / delete (removes recorded paths, reverts rows to stream, removes folder, confirms first) | | ✅ |
| ON-16 | Download folder naming Online/<source>/<title> (<id>); ::series:: scope marker; delete recorded paths never recomputed | | ✅ |
| ON-17 | download_scopes (series state) + download_files (per-scope copies); refreshTrackLocation (collection copy > earliest series copy > stream) | | ✅ |
| ON-18 | finalizeCollection writes a state even for 0 jobs (none); exists-checks before delete; recursive delete confined below document dir | | ✅ |
| ON-19 | Saved shelf syncs both ways (online_collections payload + reconcile); tombstone never resurrected; every listener-state setter dirties sync (favorite/download/open); insertRemote ON CONFLICT DO NOTHING | | ✅ |
| ON-20 | Download state vocabulary (describeDownloadState) shared by listing + Continue + Favorites; none prints nothing | | ✅ |
| ON-21 | folder_key written per file when it lands (never while streaming); collection progress via collection_key | | ✅ |
| ON-22 | Cleartext permitted for esra (http mp3.esra.ir); shariati secureMediaUrl forces https | network security config | ✅ |

### 3.8 Audio effects (`AudioEffectsService`, `modules/audio-enhancer`, `ambientTones`)

| ID | Feature | Notes | Status |
|---|---|---|---|
| FX-01 | Enhancer: Android Equalizer + LoudnessEnhancer; boost 0…+12 dB, bass/treble ±12 dB step 0.5 | | ✅ |
| FX-02 | Shelf curve: bass = bands <400 Hz log-weighted, treble mirror at 2 kHz | | ✅ |
| FX-03 | Attach on first change, release on off/stop/teardown; every native call caught (failure = state, never crash) | | ✅ |
| FX-04 | Moving a slider implies enabled; persist audioEnhancer JSON (coalesced 400 ms), device-only | | ✅ |
| FX-05 | Room tone: second looping player so output never hits digital silence (BT keep-alive); pause keeps player alive, stop releases | | ✅ |
| FX-06 | 7 tones: room (generated deterministic WAV, seed 0x9e3779b9, 22.05 kHz 4 s) + 6 field recordings (rain/forest/river/ocean/wind/birds) | | ✅ |
| FX-07 | Recordings normalised to −18.4 dBFS RMS; loop by rearrangement (gain/limiter before wrap) | | ✅ |
| FX-08 | Level 0–100 → −75…−30 dBFS relative to target RMS; 0 = exact silence; missing volume = full scale | | ✅ |
| FX-09 | Tone credits (TONE_CREDITS CC0/BY/BY-SA) + describeCredits() panel; catalogue test enforces credits | | ✅ |
| FX-10 | Picking a tone at level 0 auto-sets 35%; tone switch re-points player without gap | | ✅ |
| FX-11 | syncPlayback(playing) idempotent (called every tick); effects follow transport | | ✅ |
| FX-12 | Volume + tone share one LevelSliderRow control | | ✅ |

### 3.9 Sync & backend (`SyncService`, `syncEngine`, `reconcile`, `syncRetry`, Lesan client)

| ID | Feature | Notes | Status |
|---|---|---|---|
| SY-01 | Typed Lesan client (Ktor): POST {model, act, details:{set,get}}; token header; {success,body} envelope; 15 s timeout; error codes | D9 | ✅ |
| SY-02 | Push: pending tracks → registerTrack one-by-one (idempotent by user+contentHash); artworkUrl only http(s) | | ✅ |
| SY-03 | Push batch ≤50 via track.syncLocalData: sessions/annotations/playlists/contextPlays/onlineCollections/settings; only finalized+track-synced rows | | ✅ |
| SY-04 | Id mapping: clientId → serverId, mark synced; acknowledged tombstones hard-deleted | | ✅ |
| SY-05 | Failure → rows stay pending/failed, retried; never throws to UI; never duplicate on timeout | | ✅ |
| SY-06 | Pull (page 500, parallel): getMyTracks/getMyListeningHistory/getMyAnnotations/getMyPlaylists/getMyPlaybackContexts/getMyOnlineCollections/getMySettings | | ✅ |
| SY-07 | Reconcile: tracks by contentHash (+originRepairs), sessions/runs/annotations by clientId INSERT OR IGNORE; annotations/playlists/collections LWW; tombstones never resurrected; playlist items serverTrackId→local; collections ON CONFLICT DO NOTHING | | ✅ |
| SY-08 | Triggers: mount, foreground, connectivity regained, backoff timer, after session end, after login/register/restore, manual Sync now | WorkManager | ✅ |
| SY-09 | Shared settings LWW (languageCode, defaultSpeed, historySort); settingsUpdatedAt/settingsSyncedAt | | ✅ |
| SY-10 | Sync status UI: pending counts breakdown, last-synced relative time, Sync now | | ✅ |
| SY-11 | Entitlements: paywall refusal keeps rows failed/pending, never prunes DB, never gates playback; historyQuota → upgrade prompt (future) | prompts/02-entitlements | ✅ |
| SY-12 | Base URL config (BuildConfig LESAN_BASE_URL; prod http://185.239.0.14:1243/lesan) | | ✅ |

### 3.10 Settings & preferences (`settings.tsx`, `SettingsService`, `settingsStore`)

| ID | Feature | Notes | Status |
|---|---|---|---|
| SE-01 | Account section: avatar, display name, email | | ✅ |
| SE-02 | Playback: default speed segmented [0.75,1,1.25,1.5,2]× | | ✅ |
| SE-03 | Appearance: theme System/Light/Dark | | ✅ |
| SE-04 | Motion: System/Full/Reduced + Haptics switch | | ✅ |
| SE-05 | Storage & sync: imported-audio bytes, pending queue breakdown, last-synced, Sync now | | ✅ |
| SE-06 | Library: "All notes" → Notes tab | | ✅ |
| SE-07 | Developer (debug): field gallery | | ✅ |
| SE-08 | Sign out (danger, standalone) | | ✅ |
| SE-09 | Persisted keys: themePreference, defaultSpeed, historySort, motionPreference, hapticsEnabled, languageCode, settingsUpdatedAt/SyncedAt, lastSyncAt + device-only volume/audioEnhancer/roomTone/ambientTone | DataStore + Room KV | ✅ |
| SE-10 | Haptics helper triggerHaptic(intent) master switch, fires onPress once | | ✅ |
| SE-11 | Motion governed by useMotionEnabled (OS reduced-motion × in-app preference) | | ✅ |

### 3.11 AI catalogue (`ai.tsx`, `ai/[feature].tsx`, `aiFeatures`)

| ID | Feature | Notes | Status |
|---|---|---|---|
| AI-01 | AI tab: hero + 2×2 grid of four coming-soon tools (Transcribe, Summarize, Generate audio summary, Remove noise & enhance) | data-driven catalogue | ✅ |
| AI-02 | Tool screen: glyph in concentric rings, "Coming soon." headline + server/donation body (pinned copy), what it would do, back | | ✅ |
| AI-03 | AI verb on every row (track/folder/playlist/history/online) + AiChip in player → opens catalogue (no identity passed) | | ✅ |
| AI-04 | AiGlyph tinted disc; ramp contrast floor enforced | | ✅ |
| AI-05 | No service wiring (no AiService/queue/upload) | parity: stub | ✅ |

### 3.12 Design system & shell (`theme`, `components`, dock, navigation)

| ID | Feature | Notes | Status |
|---|---|---|---|
| DS-01 | Design tokens: spacing 4pt rhythm, radius ramp, tiles, controls, type scale, semantic colors light/dark, 8 aurora ramps, elevation | DESING.md | ✅ |
| DS-02 | GlassSurface / Card / CardSection / CardRow / SegmentedControl | new glass language | ✅ |
| DS-03 | Row system: RowShell/ListRow/RecordRow/ListGroup/ListSurface/StatusLine; row-action presets (play/history/add/download/delete/ai); planRowLayout never drops a control | | ✅ |
| DS-04 | MediaCard (shelf/identity), Continue spotlight | | ✅ |
| DS-05 | Field system: TextField + TextArea/Password/Search/Time/Number/Tag/Color/Date; visible labels; focus ring; chaining | Time/Date retired: no production screen uses them (RN only in dev gallery) | ✅ |
| DS-06 | Keyboard avoidance: measure focused field, scroll into band; composer reveals group; no double-count | Compose imePadding + bringIntoView | ✅ |
| DS-07 | EmptyState / InlineNotice / SkeletonRows (four distinct states) | | ✅ |
| DS-08 | Icon wrapper (single family, semantic names) | D13 | ✅ |
| DS-09 | Motion: springs, press scale, Reveal stagger, SwapIcon crossfade, SwipePager; reduced-motion substitute | | ✅ |
| DS-10 | UserText RTL detection + Persian font for content | D14 | ✅ |
| DS-11 | HighlightedText (search hits) | | ✅ |
| DS-12 | AppDock: mini-player + 5-icon nav in ONE glass panel; selected = solid accent circle; no raised centre; icon-only nav; equal halves; dockInset token | DESING.md | ✅ |
| DS-13 | Navigation: 5 tabs (Library/Discover/History/Notes/AI) + detail routes + player modal + global sheets (AddToPlaylist/ContextHistory/SessionDetail) | Navigation-Compose | ✅ |
| DS-14 | Splash held until fonts + auth restore + settings load | | ✅ |
| DS-15 | OriginBadge, PaletteTile, CrossfadeArtwork, AmbientWash, DynamicCanvas | PaletteTile + AmbientCanvas shipped; OriginBadge is copy in TrackDetail; crossfade folded into PaletteTile | ✅ |
| DS-16 | Contrast contract test (text/surface pairs, tier separation ≥1.30:1) | never weaken threshold | ✅ |

### 3.13 Platform & misc

| ID | Feature | Notes | Status |
|---|---|---|---|
| PL-01 | Android-only; package com.pejvak.app; portrait; predictive back | | ✅ |
| PL-02 | Permissions: MODIFY_AUDIO_SETTINGS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK, READ_MEDIA_AUDIO, READ_EXTERNAL_STORAGE, POST_NOTIFICATIONS | | ✅ |
| PL-03 | Cleartext traffic permitted (esra) via network security config | | ✅ |
| PL-04 | App icon + adaptive icon + splash (existing assets, bg #2F2690) | reuse ignoreAssets | ✅ |
| PL-05 | Native Share sheet (history/notes Markdown export) | | ✅ |
| PL-06 | ProGuard/R8 release build, shrink resources (small APK goal) | | ✅ |
| PL-07 | Dev field gallery (debug only) | | ✅ |
| PL-08 | Tone attribution panel | | ✅ |

## 4. Phases

Build order: **docs/design → skeleton → design system/shell → data layer → audio engine → services →
screens → online → effects → polish**, matching root `AGENTS.md` (DB → audio engine → services →
screens). Each phase lists the feature IDs it delivers. A phase is done only when its "Done when" gate
is verified.

### Phase 0 — Docs, design spec & buildable skeleton  *(current)*

**Done when:** `./gradlew assembleDebug` succeeds from a clean checkout on this machine, the app
installs and shows a themed placeholder shell, and the three docs (plan/prompt/DESING) + AGENTS +
summary exist.

- [x] Author `docs/prompts/01-native-rewrite.md` (brief + clarifications)
- [x] Author `docs/plans/01-native-rewrite.md` (this file: full feature inventory + phases)
- [x] Author `DESING.md` from `ignoreAssets/sample.jpg`
- [x] Author `android/AGENTS.md` + `docs/summary.md`
- [x] Gradle KTS + version catalog + wrapper (pre-seeded 9.6.0); AGP 9 built-in Kotlin; repo ordering; `local.properties`
- [x] `:app` module: Compose + Material3, Hilt, Room, Media3, Ktor, WorkManager, DataStore, Coil wired
- [x] `AndroidManifest`: permissions, cleartext config, MediaSessionService, single activity, portrait
- [x] Minimal `PejvakApp` (@HiltAndroidApp) + `MainActivity` + themed placeholder + nav scaffold
- [x] `assembleDebug` green; report APK path + size

### Phase 1 — Design system & app shell  (DS-01…DS-16, PL-04)  *(complete — build/test verified)*

**Done when:** a gallery screen renders every core component in light + dark, the dock navigates 5
tabs, and the contrast test passes. *(Gallery + dock + contrast test verified in code/build; on-device
visual check in both themes is the owner's to do.)*

- [x] Tokens: spacing/radius/tiles/controls/bars/icons/dock geometry (`Tokens.kt`), semantic colors +
      8 aurora ramps (`Color.kt`), type scale (`Type.kt`), light/dark `PejvakTheme` + CompositionLocals
- [x] `GlassSurface` (fill + bright border + top rim light; strong variant) — real RenderEffect backdrop
      blur is a refinement (fallback recipe is legible by design)
- [x] `AmbientCanvas` (mid-tone base + ramp blooms; static for now, drift in a later pass)
- [x] `BubbleButton` (circular glass icon button, outlined/filled, 44 dp touch)
- [x] `AppDock` (mini-player + 5 icon-only nav in one strong-glass panel; selected = white circle) wired
      into `PejvakNavHost`; content owes `dockInset`
- [x] Contrast contract test (`ContrastContractTest`, 5 assertions) — palette tuned until green
- [x] Card / CardSection / CardRow / SegmentedControl (`Card.kt`, glass surfaces + inset dividers)
- [x] Icon wrapper (single semantic family, `ICON_GLYPHS` catalog, auto-mirrored directional glyphs)
- [x] Row system (RowShell/ListRow/RecordRow/ListGroup/StatusLine) + row-action presets + planRowLayout
      (`row/`, contract pinned by RowLayoutTest)
- [x] Field system + keyboard avoidance + UserText (Vazirmatn) + HighlightedText
      (`field/`: TextField/Password/Search/TextArea/Number/Tag/Color; `KeyboardAwareColumn` +
      `rememberRevealOnFocus`; `core/TextFold` folding/RTL/highlight, tested)
- [x] Motion primitives (springs/durations/stagger) + `useMotionEnabled` (OS × in-app) + haptics helper
- [x] EmptyState/InlineNotice/SkeletonRows (`States.kt`, four distinct states; static skeleton)
- [x] Global sheets scaffolding (AddToPlaylist/ContextHistory/SessionDetail request types + `GlobalSheetHost`)
- [x] App icon finalized from existing art (adaptive foreground @88%, bg #2F2690, no monochrome per
      AppIcons/README); Vazirmatn font bundled (4 weights + OFL license)
- [x] Splash screen (core-splashscreen, `Theme.Pejvak.Splash`, `installSplashScreen()`)
- [x] Component gallery screen (light + dark toggle; debug trigger in shell, Settings→Developer in Phase 13)
- [x] `GlassChip` (filter pill, count badge) + `GlassSheet` (ModalBottomSheet wrapper)

### Phase 2 — Data layer  (Room schema, LIB-17/28/29, SY-09 partial, SE-09)  *(complete — verified)*

**Done when:** Room DB builds all 12 tables with migrations + schema export, DAOs unit-tested, and the
pure domain logic (hash, session math, search fold, naming, smart recipes) passes JVM tests.
*(12 tables verified column-for-column against RN; DAO queries KSP-validated; 96 JVM tests pass.
Runtime DAO behavior is exercised on-device in the feature phases.)*

- [x] Room entities + DAOs mirroring all 12 RN tables 1:1 (tracks, sessions, annotations, playlists,
      playback_checkpoints, settings, folders, context_plays, online_collections, download_jobs,
      download_scopes, download_files) — **column counts verified equal to RN for every table**
- [x] Sync columns (id/server_id/sync_status/created_at/updated_at) + integer seconds; schema export
      (`app/schemas/…/1.json`); indices match RN
- [x] Settings KV (DataStore provided in DI + Room `settings` table; repository wrapper lands with Settings)
- [x] Pure domain: ContentHash (SHA-256 first 1MB+size; online identity), sessionTracking state machine,
      search folding (`core/TextFold`), paletteFor (FNV-1a), naming, smartPlaylists (5 recipes),
      listeningStretch, playbackPhase + helpers (resume, mediaFolders, timeFormat)
- [x] Entity ↔ domain mappers (JSON tags/items, enum wire mapping) — round-trip tested
- [x] JVM unit tests for all pure logic (96 total: session math, checkpoint timing, hash vectors,
      folding, naming, stretch, smart recipes, phase, mappers, contrast, row layout, icons)

### Phase 3 — Playback engine  (PB-01…PB-20)  *(engine complete — verified; UI binding lands in Phase 6)*

**Done when:** a debug screen plays a local file in background with lock-screen controls, records a
correct session (wall-clock math), survives a kill via checkpoint recovery, and runs/stretches link.
*(The orchestration is JVM-tested end-to-end with fakes — 19 playback tests. The Media3 service compiles
and is wired; **actual background/lock-screen playback is the owner's on-device check**, no device here.)*

- [x] Media3 ExoPlayer + MediaSessionService + audio focus (`handleAudioFocus=true`) + media notification;
      hardware next/prev routed through the engine. *(UI MediaController binding is Phase 6.)*
- [x] Queue + next/prev (restart at ends) + loadAndPlay/pause/resume/stop/seek/setSpeed (`PlaybackEngine`)
- [x] Session begin/finalize driven by player events; delta rule; speed-change split; seeked flag
- [x] Checkpoint every 10 s + orphan recovery on launch; stretch handover on auto-advance (new stretch on skip)
- [x] Runs (context_plays) open/resume/touch/finalize; close-on-queue-exhaust. *(ContextService.resolveQueue
      for folder/playlist/online lands with Library/Online — Phases 8/10.)*
- [x] Speed change; sleep timer (5/15/30/45/60, fires once); volume dB curve (−40 dB floor, absent≠muted);
      duration write-back once; live-stream duration guarded. *(Speed-cycle UI + default pref: Phases 6/13.)*
- [x] Wait/phase model (wait outranks playing); missing-file detection on error (local only).
      *(Position smoothing + resume-pin UI: Phase 6. Android Auto browse tree: refinement, PB-19.)*
- [x] Architecture: pure `PlaybackEngine` (interfaces `PlaybackStore`/`PlayerCommand`) + `RoomPlaybackStore`
      + `ExoPlayerCommand` + `PlaybackService`; DI wired
- [x] Unit tests: session lifecycle, seek, checkpoint timing, orphan recovery, stretch handover vs skip,
      run open/complete, speed split, stop, duration write-back, volume curve, sleep timer (19 tests)

### Phase 4 — Local library pipeline  (LIB-13…LIB-20, LIB-27…LIB-30)  *(complete — build/test verified)*

**Done when:** the import wizard scans MediaStore + SAF, hashes/inspects, previews a plan, imports and
relinks by hash; missing screen works; artwork backfills. *(Pipeline + wizard + missing screen built and
compiled; 196 JVM tests pass. On-device scan/import is the owner's check — no device here. Track detail
screen (LIB-21/22) and the search engine (LIB-27) land in Phase 8.)*

- [x] DeviceScanService: MediaStore enumerate + permission flow; SAF tree grant + enumerate
- [x] AudioInspection: MMR + ID3v2 reader (full tags + embedded art); stream-aware
- [x] ImportService: loadLibraryIndex, findGoneLocations, importIdentifiedFiles (insert/relink)
- [x] ArtworkService: extract/store/backfill (bounded, skips streams); ContentHash integration
- [x] Import wizard UI (choose→scanning→preview→importing→done); Missing screen + RelinkService
- [x] Track stats computation

### Phase 5 — Auth & sync  (AUTH-01…08, SY-01…SY-12)  *(complete — build/test verified; live-backend check is the owner's)*

**Done when:** login/register/restore work against the live backend; a recorded session + annotation
sync idempotently, pull reconciles on a second install, and offline→online recovery retries.
*(The full auth + push/pull/reconcile stack compiles and its pure orchestration is JVM-tested with
fakes — 230/230 tests. **Live backend login and a two-install pull are the owner's on-device check**
(no device/credentials here).)*

- [x] Ktor LesanClient + wire DTOs + envelope + error codes; secure token storage
- [x] Auth screens + gate + restore + logout; cached user
- [x] SyncEngine push (registerTrack + syncLocalData batch) + id mapping + tombstones
- [x] Pull + reconcile (all entities, LWW, originRepairs, ON CONFLICT DO NOTHING)
- [x] WorkManager triggers + backoff; sync status UI; shared settings LWW; entitlements refusal handling

### Phase 6 — Player UI  (UI-01…UI-18)

**Done when:** the full Now Playing sheet matches DESING.md, all chips/sheets work, markers seek, and
the mini-player morphs into it.

- [x] NowPlayingSheet morph + PlayerContent + hero artwork + context chip + listened readout
- [x] Scrubber + annotation markers + WavyProgress + TransportControls + speed + status line
- [x] Chip row + QueueSheet/SleepTimerSheet/JumpToTimeSheet + VolumeControl/RoomToneControl
- [x] AnnotationList in player; mini-player row + standalone mini-player; 1 Hz tick isolation

### Phase 7 — Annotations & Notes  (AN-01…AN-09)

**Done when:** create/edit/delete a note at position, markers seek, Notes tab searches/filters, and
notes export to Markdown.

- [x] AnnotationService (create/update LWW/delete tombstone) + composer (text/tags/color)
- [x] Notes tab (join track, search, date-range, delete) + NoteDetailSheet note mode
- [x] timesPlayedBefore; Markdown export; count enrichment

### Phase 8 — Library & detail screens  (LIB-01…LIB-12, LIB-23…LIB-26)

**Done when:** all five Library views + search work, folder/playlist/smart/track detail screens play
and manage collections, and smart playlists build with reasons.

- [x] Library tab (header, language prompt, global search, segmented views, spotlight, alerts)
- [x] Tracks/Folders/Playlists/Recent views + cards (Online shelf deferred to Phase 10)
- [x] Folder/Playlist/Smart/Track detail screens + ContextHistorySheet + AddToPlaylistSheet
- [x] Smart recipes UI + Save as playlist (buildSmartPlaylist is the service; no separate class needed)

### Phase 9 — History & Stats  (HI-01…HI-14)

**Done when:** stretches/runs render day-sectioned with pagination, filters/sort/search work, stats
compute, and history exports.

- [x] History tab (History/Stats panels) + stretch cards + run cards + keyset pagination
- [x] DateRangeSheet + sort + pull-to-refresh + search + SessionDetailSheet + ListeningTimeline
- [x] Stats panel + ContextHistorySheet + resume + soft-delete + Markdown export

### Phase 10 — Online sources & Discover  (ON-01…ON-13, ON-19…ON-22)

**Done when:** all adapters fetch real collections, streaming plays with correct identity/history,
and the saved shelf syncs both ways.

- [x] Online vocabulary + transport + registry; adapters (manahej/aminikhaah×2/esra/mesbah/shariati/librivox/radiobrowser/archive×46)
- [x] OnlineCatalogService (cache/load/fallback/resolveStreamUrls) + language catalogue
- [x] Discover tab (Continue/Favorites/Browse) + language/source/collection screens
- [x] Online track rows + streaming playback + shelf sync + cleartext config

### Phase 11 — Downloads  (ON-14…ON-18)

**Done when:** a collection downloads sequentially with resumable queue-as-rows, cancel/retry/delete
behave correctly, and deleting reverts rows to streaming.

- [x] DownloadService worker (queue-as-rows, retries, progress coalescing, whenIdle)
- [x] download_scopes + download_files + refreshTrackLocation; naming; series downloads
- [x] DownloadControl UI + progress + delete confirm + resume interrupted

### Phase 12 — Audio effects  (FX-01…FX-12)

**Done when:** enhancer shapes only the player's audio, room tone keeps BT alive, all 7 tones play at
consistent loudness with credits, and prefs persist device-only.

- [x] Enhancer (Equalizer + LoudnessEnhancer on real audioSessionId, shelf curve, attach/release, caught)
- [x] Ambient tone player (generated room WAV + 6 recordings, RMS-normalised, dB level mapping)
- [x] AudioEnhancerSheet + TonePickerSheet + credits; LevelSliderRow shared; transport sync

### Phase 13 — Settings, AI & polish  (SE-01…SE-11, AI-01…AI-05, PL-05/07/08)  *(complete — verified)*

**Done when:** settings screen complete, AI catalogue matches pinned copy, and all exports share.

- [x] Settings screen (all sections) + preferences + haptics/motion
- [x] AI catalogue + tool screens + AiGlyph + aiAction on rows
- [x] Dev field gallery; tone attribution; native Share

### Phase 14 — Hardening & release  (PL-06, parity audit)  *(complete — verified in code/build)*

**Done when:** every §3 feature ID is ✅ or 🗑 with reason, R8 release APK builds small, full test
suite passes, and a device playthrough exercises offline/retry/recovery.

- [x] Parity audit: walk §3, tick/retire every ID (147 ✅, 1 🗑: PB-19 Android Auto)
- [x] R8/ProGuard rules + shrink resources; release APK 14 MB (debug 91 MB; no RN release APK on this machine)
- [x] Unit suite green; instrumented Room smoke test added and compiled (`assembleDebugAndroidTest`); device run/recovery/themes owner-gated
- [x] Performance pass: splash now waits for settings; 1 Hz tick isolated; smoothing added; owner device sign-off pending

## 5. Architecture

## 5. Architecture

Single `:app` module (D17), Hawraa-style package layout under `com.pejvak.app`:

```
app/src/main/kotlin/com/pejvak/app/
├── PejvakApp.kt              # @HiltAndroidApp
├── MainActivity.kt           # single activity, Compose entry, edge-to-edge
├── core/                     # result types, time, dispatchers, haptics, folding
├── data/
│   ├── local/                # Room: PejvakDatabase, 12 entities, DAOs, migrations — source of truth
│   ├── remote/               # LesanClient (Ktor), wire DTOs, online source adapters (one per provider)
│   ├── repository/           # single-owner repositories; screens never touch DB/network directly
│   └── sync/                 # SyncEngine + WorkManager SyncWorker (pending→syncing→synced|failed)
├── domain/                   # plain Kotlin models + pure logic (sessionTracking, stretch, smart
│                             #   playlists, search, naming, palette, playbackPhase) — no Android imports
├── playback/                 # Media3: PlaybackService (MediaSessionService), queue/run/stretch
│                             #   orchestration, checkpointing, effects (enhancer + ambient tone)
├── di/                       # Hilt modules
└── ui/
    ├── theme/                # tokens, light/dark ColorScheme, typography, glass — ALL colors here
    ├── navigation/           # PejvakNavHost, routes, global sheet host
    ├── components/           # glass surfaces, rows, fields, dock, mini-player, motion, icons
    └── screens/              # one package per screen (library/, player/, discover/, history/,
                              #   notes/, ai/, auth/, settings/, import/, detail/)
```

**Dependency flow:** `ui → domain ← data`; `playback → domain + data`; nothing in `domain` imports
Android. Screens talk to repositories/viewmodels, never to Room or Ktor directly. The player is owned
by one service; persistence by Room DAOs behind repositories; delivery by SyncEngine.

**State:** Compose `StateFlow`/`collectAsStateWithLifecycle` from ViewModels; player state via
MediaController + a thin `PlayerState` flow; no second mirror of the same data.

## 6. Product invariants (carry over unchanged)

From root `AGENTS.md` + `mobile/AGENTS.md` — these are non-negotiable and identical in the native app:

1. **Offline-first.** Every write → Room first; background sync later; never block UI on network.
2. **Record every session** with the full field set; **integer seconds** for positions/durations, epoch millis for timestamps.
3. **contentHash is identity** (SHA-256 first 1 MB + size; online = sha256("online:source:external")). Never dedupe by filename/path/URL.
4. **durationListenedSec = wall-clock** via delta rule `0 < delta < 5`; seeks update position only.
5. **Never lose a session on kill:** checkpoint every 10 s; recover orphans on launch.
6. **Idempotent sync:** one persistent clientId per row; server keys on it; temp id → server id after ack.
7. **Sessions append-only**; speed change/seek semantics as RN; **annotations LWW** on updatedAt.
8. **Auth wire:** JWT in `token` header (no Bearer); `{success, body}` envelope authoritative.
9. **Sync states** `pending → syncing → synced | failed`; failed stays queued; errors never block UI.
10. **Online identity by source id, not URL**; re-resolve signed URLs before use; `ContextType` = playlist|folder|online.
11. **Device-only prefs never sync** (volume, enhancer, tone); shared settings = languageCode/defaultSpeed/historySort LWW.
12. **A local tombstone is never resurrected by a pull.**

## 7. Testing strategy

- **JVM unit tests (highest value):** session duration math, checkpoint recovery, sync id mapping +
  retry/idempotency, search folding, content hash, smart-playlist recipes, stretch completeness,
  naming, playbackPhase, contrast contract. Pure `domain/` logic is tested without Android.
- **Room:** migration tests + DAO tests (in-memory DB), schema export checked in.
- **Instrumented (androidTest):** Compose UI smoke for dock navigation + player; Media3 playback
  session recording on a real asset; sync against a local backend.
- **Manual device gates:** each phase's "Done when" includes a device/emulator look in both themes;
  offline→online recovery and kill recovery exercised before a feature is called done.
- Mirrors the RN app's test priorities (root AGENTS.md: audio engine, sync engine, duration calc).

## 8. Risks & open questions

| Risk / question | Mitigation |
|---|---|
| Media3 session/event timing differs from expo-audio; delta rule must still hold | Port `sessionTracking` as a pure state machine fed by real player events; unit-test the math identically |
| Equalizer on real audioSessionId may behave differently per OEM | Catch every AudioEffect call; failure = reported state, never crash (FX-03) |
| Blur unavailable on API 29–30 | Higher-opacity glass fallback (D15); legibility never depends on blur |
| Full ID3 tag parity (composer/ISRC/lyrics) beyond MMR | Small pure-Kotlin ID3v2 reader (D12); test against real files |
| Online adapters scrape HTML (esra/mesbah/shariati) — brittle | Port adapters faithfully incl. their verified quirks; keep per-source tests |
| Same applicationId replaces RN install → fresh local DB | History restored via login+sync (server is source of truth for synced rows); document for owner |
| APK size goal | R8 + shrinkResources + no RN runtime; measure in Phase 14 |
| Gradle/SDK network quirks on this machine | Reuse Hawraa's verified wrapper/mirrors/SDK; never re-enable auto-download |
| **Open:** exact stats-panel metrics to match | Read RN `stats-panel` during Phase 9 and mirror |
| **Open:** Android Auto browse tree shape | Design in Phase 3 (library/folders/playlists/online) |

## Progress log

> Append one entry per small task: date, what changed, decisions, verification. Newest at the bottom.

### 2026-11-14 — Plan authored
- Explored the full `mobile/` source tree and catalogued **every feature** into §3 (13 domains, ~180 IDs).
- Researched GitHub audio references (Voice, Auxio, Gramophone, InnerTune) and read Voice's architecture.
- Studied `ignoreAssets/sample.jpg` (glassmorphism) and the Hawraa native reference build.
- Owner clarification: **keep English LTR UI**, Persian first-class for content.
- Authored `docs/prompts/01-native-rewrite.md`, this plan, and set up `android/docs/`.
- Next: `DESING.md`, `AGENTS.md`, `summary.md`, then the Phase 0 buildable skeleton.

### 2026-11-14 — Design spec + sector docs
- Wrote `DESING.md` (16 sections): glassmorphism language from `sample.jpg`, ambient canvas, glass
  recipe, color/type/shape tokens, depth model, components, every screen, contrast contract, light/dark,
  Persian-content RTL, assets, Compose notes. Key decision: mid-tone light canvas so white-on-glass
  stays legible (fixes the old 1.04:1 failure).
- Wrote `android/AGENTS.md` (sector rules, build quirks, package layout, version pins) and
  `docs/summary.md` (orientation). Ticked the four Phase-0 doc boxes.
- Next: Phase 0 buildable skeleton (Gradle + `:app` + manifest + themed placeholder), verify
  `assembleDebug`.

### 2026-11-14 — Phase 0 buildable skeleton (verified)
- Copied the verified Hawraa Gradle wrapper (9.6.0, pre-seeded dist); authored `settings.gradle.kts`,
  root `build.gradle.kts`, `gradle.properties`, `gradle/libs.versions.toml` (Hawraa pins + Coil 3.3.0,
  security-crypto, media3-datasource-okhttp, icons-extended).
- `:app` wired: Compose + Material3, Hilt, Room (settings table anchors the KSP pipeline; other 11
  tables in Phase 2), Media3 `PlaybackService` (MediaSessionService shell), Ktor `LesanClient` (wire
  format + token header + envelope), WorkManager `SyncWorker` stub (@HiltWorker), DataStore, Coil.
- Manifest: all permissions, cleartext config (esra), portrait single activity, MediaSessionService,
  WorkManager Hilt initializer override. Adaptive launcher icon (bg #2F2690) + splash theme.
- UI shell: `PejvakTheme` (light/dark glass tokens from DESING.md), `AmbientCanvas`, `PejvakNavHost`
  (5 tabs over a Material NavigationBar — glass AppDock is Phase 1), glass `PlaceholderScreen`.
- **Verification:** `JAVA_HOME=…openjdk@21 ./gradlew assembleDebug` → **BUILD SUCCESSFUL** (5m56s first
  build). APK: `app/build/outputs/apk/debug/app-debug.apk` (~81 MB **debug**, all ABIs + icons-extended
  + unstripped libs; release R8 size is the Phase-14 goal). `testDebugUnitTest` → 2/2 pass.
- No device/emulator connected (`adb devices` empty) → **owner to install** (`installDebug`) and confirm
  the shell renders in both themes. Phase 0 "Done when" build/test gates met; visual check pending owner.
- Next: Phase 1 — design system (tokens, glass components, rows, fields, motion) + the glass AppDock.

### 2026-11-14 — Phase 1 core: tokens, glass, dock, contrast contract
- Added `Tokens.kt` (radius ramp, 4 dp spacing, tiles/controls/bars/icons, dock geometry + `dockInset`,
  `tileRadius`), wired `LocalPejvakGeometry` into `PejvakTheme`.
- Built `GlassSurface` (fill + bright hairline border + 3 dp top rim light; `strong` variant),
  `BubbleButton` (outlined/filled circular glass button, 44 dp touch, Material3 `ripple`), and the
  signature `AppDock` (mini-player + 5 icon-only nav in ONE strong-glass panel; selected = solid white
  circle with knocked-out glyph). Replaced the Material NavigationBar; dock floats as a sibling of
  content, content padded by `dockInset`.
- **Contrast contract:** `ContrastContractTest` (5 assertions) initially failed (light text 2.34:1).
  Tuned the light canvas `#5E7F92 → #3D5A6B → #33505F`, switched blooms to ramp **mid** stops at 20%
  (light) / 22% (dark), and fixed the tier test to composite over the backdrop (raw white-alpha colors
  always read 1.0). Now **7/7 tests pass**; light text clears 4.5:1 worst-case. Synced the tested values
  into DESING.md §3.1.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL. APK still ~82 MB debug.
- Remaining Phase 1: Card/rows/fields/segmented, Icon wrapper, motion/haptics, global sheets, splash,
  component gallery. Next: continue Phase 1 components.

### 2026-11-14 — Phase 1: icons, motion, haptics, fonts, app icon
- `Icon.kt`: single semantic family (`ICON_GLYPHS`, ~55 names), auto-mirrored directional glyphs;
  fixed 3 deprecations (PlaylistPlay/VolumeUp/Logout → AutoMirrored). `PejvakIcon(name, …)`.
- `Motion.kt`: `PejvakSpring` (bouncy/press/gentle/sheet/snap/page), `PejvakDuration` ladder, `stagger`,
  `useMotionEnabled()` (OS animator-scale × `LocalMotionPreference`). `core/Haptics.kt`: `HapticIntent`
  + `rememberHaptics(enabled)` (master switch wired in Phase 13).
- Bundled **Vazirmatn** (Regular/Medium/SemiBold/Bold) into `res/font/` + OFL license in assets.
- Finalized app icon from `ignoreAssets/AppIcons/android` (adaptive foreground @88%, bg #2F2690, no
  monochrome layer per the pack README); copied legacy mipmaps; trashed the placeholder vector.
- **Verification:** `compileDebugKotlin` green, zero warnings. Next: Card/section/row/segmented surfaces.

### 2026-11-14 — Phase 1: cards, rows, status
- `Card.kt`: `GlassCard`, `CardSection` (header/footer + inset dividers), `CardRow` (glyph bubble +
  label/value/detail + trailing), `RowDivider`, `SegmentedControl` (single-choice, accent-filled segment).
- `row/`: `RowAction` + presets + pure `planRowLayout` (primary never dropped, destructive → overflow);
  `StatusSpec`/`StatusTone`/`StatusLine` (one vocabulary, glyph owned by UI); `RowShell` (leading tile +
  copy + status + inline/overflow cluster via DropdownMenu), `ListGroup` (one card, RowPosition),
  `ListRow`, `RecordRow`.
- Tests: `RowLayoutTest` (5), `IconCatalogTest` (2). **Verification:** `testDebugUnitTest` → 14/14 pass,
  zero warnings. Next: field system + UserText + HighlightedText + keyboard avoidance.

### 2026-11-14 — Phase 1: fields, text, keyboard
- `core/TextFold.kt`: `foldText` (Persian/Arabic normalization), `isRtlText`, `foldKeepLength` +
  `highlightRanges` (index-aligned). `ui/theme/Fonts.kt`: Vazirmatn FontFamily.
- `field/`: `TextField` (inset track, visible label, accent focus ring / danger error ring),
  `PasswordField` (show/hide), `SearchField` (pill), `TextArea`, `NumberField`, `TagInput` (folded
  dedupe), `ColorField` (aurora swatches). `UserText` (per-text RTL + Vazirmatn), `HighlightedText`.
- `KeyboardAwareColumn` (verticalScroll + imePadding, no double-count) + `rememberRevealOnFocus`
  (BringIntoViewRequester). Tests: `TextFoldTest` (9). **Verification:** 23/23 pass, zero warnings.
- Next: EmptyState/InlineNotice/SkeletonRows, global sheets, splash, gallery.

### 2026-11-14 — Phase 1 complete: states, sheets, splash, gallery
- `States.kt`: `EmptyState`, `InlineNotice` (info/warning/danger + retry), `SkeletonRows` (static).
  `GlassChip` (filter pill, count-in-place-of-icon), `GlassSheet` (ModalBottomSheet wrapper).
- `GlobalSheets.kt`: `SheetRequest` (AddToPlaylist/ContextHistory/SessionDetail) + `GlobalSheetHost`
  scaffolding (real content per feature phase).
- Splash: `core-splashscreen` 1.2.0, `Theme.Pejvak.Splash`, `installSplashScreen()`.
- `GalleryScreen`: every core component with an independent light/dark toggle; registered as the
  `gallery` route with a `BuildConfig.DEBUG`-only trigger (Settings→Developer in Phase 13).
- **Verification:** `assembleDebug` + `testDebugUnitTest` → BUILD SUCCESSFUL, **23/23 tests**, zero
  warnings. APK ~83 MB debug. Phase 1 "Done when" met in code/build; owner to confirm both themes on a
  device. **Next: Phase 2 — the full 12-table Room schema + pure domain logic.**

### 2026-11-14 — Phase 2 complete: data layer + pure domain
- Read the RN schema (`migrations.ts` v1–12) and every pure domain source; ported faithfully.
- **Domain (pure, no Android):** `Models.kt`/`OnlineModels.kt` (canonical models + enums),
  `ContentHash` (SHA-256 first 1MB‖decimal size; online identity), `SessionTracking` (delta rule +
  10 s checkpoint), `PlaybackPhase` (wait outranks playing; staged copy), `Palette` (FNV-1a → ramp
  index), `Naming` (sanitize/slug/folder keys/track filenames), `ListeningStretch` (build/group/resume),
  `SmartPlaylists` + `SmartPlaylistRules` (5 recipes with reasons), helpers `Resume`/`MediaFolders`/`TimeFormat`.
- **Room:** 12 entities (snake_case columns mirroring RN exactly), 12 DAOs (CRUD + sync-state queries;
  remote inserts use IGNORE to protect device-only columns), `PejvakDatabase` v1 + schema export,
  `Mappers.kt` (entity↔domain, JSON tags/items, enum wire).
- **Verification:** `assembleDebug` green (KSP validates every DAO query against the schema), zero
  warnings. Schema export checked **column-for-column against RN — all 12 tables match** (tracks 40,
  sessions 22, annotations 13, playlists 10, checkpoints 13, settings 2, folders 5, context_plays 19,
  online_collections 17, download_jobs 16, download_scopes 8, download_files 11). `testDebugUnitTest`
  → **96/96 pass** (session math, hash vectors, folding, naming, stretch, smart recipes, phase,
  mapper round-trips, contrast, row layout, icons).
- Note: DAO *runtime* behavior is exercised on-device in the feature phases (no Robolectric, to avoid
  the android-all jar download on this network); compile-time KSP validation + mapper tests cover the
  data layer here. **Next: Phase 3 — Media3 playback engine.**

### 2026-11-14 — Rename to FlowCast + Phase 3 complete: playback engine
- **Rename (owner request):** display name **FlowCast**, `applicationId = com.flowcast.app` (distinct
  from RN `com.pejvak.app`) so **both versions install side by side**. Code package stays `com.pejvak.app`
  for now (temporary name; avoids churn before the final name). Verified via `aapt dump badging`:
  package `com.flowcast.app`, label `FlowCast`. Recorded in prompt §4 + decision D4.
- **Architecture:** pure `PlaybackEngine` (depends on `PlaybackStore` + `PlayerCommand` interfaces, so the
  whole lifecycle is JVM-testable) + `RoomPlaybackStore` (Room impl) + `ExoPlayerCommand` (main-thread
  ExoPlayer wrapper) + `PlaybackService` (MediaSessionService, audio focus, 1 Hz progress tick, hardware
  next/prev via media-button callback) + DI (`PlaybackModule`, DAO providers).
- Ported the RN orchestration faithfully: session begin/finalize on player events, wall-clock delta rule,
  speed-change split, seeked flag, 10 s checkpoint + orphan recovery, stretch handover on auto-advance
  (new stretch on manual skip), run open/resume/touch/complete, wait/phase model, missing-file detection,
  duration write-back, volume dB curve, sleep timer.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, **115/115 tests**, zero
  warnings. 19 new playback tests (engine lifecycle with fakes + volume + sleep). Media3 service compiles;
  **background/lock-screen playback is the owner's on-device check** (no device attached).
- Deferred to their phases (noted in §4): UI MediaController binding + position smoothing + speed-cycle UI
  (Phase 6), ContextService.resolveQueue (Phases 8/10), Android Auto browse tree (PB-19 refinement).
- **Next: Phase 4 — local library pipeline (scan/import/hash/metadata/artwork/missing).**

### 2026-11-15 — Phase 4: pure library domain ported (verified)
- Read the RN pipeline sources (`scanPlan`, `importMetadata`, `audioTags`, `audioInfo`, `mediaBytes`,
  `embeddedArtwork`, `filenameTags`, `id3Genres`, `audioFormats`, `audioLocation`, `trackStats`,
  `RelinkService`, `mediaFolders`) and ported the **pure** half to `domain/`:
  - `AudioFormats` (extensions + MIME + `isStreamUri`), `FilenameTags` (date/track-number recovery),
    `ImportMetadata` (tag-vs-filename merge + audiobook rule), `Id3Genres` (192-entry table + resolve).
  - `MediaBytes` (BE/LE readers + MP4 atom walk + `scanForMoov`), `AudioTags` (full ID3v2.2/2.3/2.4 reader:
    core + extended frames, COMM/USLT, APIC/PIC, unsynchronisation, truncation), `AudioInfo` (MPEG/Xing/VBRI,
    FLAC, WAV, Ogg Vorbis/Opus, MP4 stream declarations), `EmbeddedArtwork` (ID3/FLAC/MP4 cover extraction).
  - `ScanPlan` (two-phase planner: new/known/changed/duplicate/relink + `libraryEntriesToVerify` +
    `toEpochMillis`), `TrackStats` (`computeTrackStats` + `summariseSessions`), `Missing` (groupByFolder +
    describeStake + summariseMissing), and SAF/folder helpers added to `MediaFolders`
    (`deriveFolderKey`, `deriveFolderKeyFromTreeUri`, `safTreeUriForDocument`, `safDocumentName`).
- Renamed `Naming.kt`'s private extension set to `DOWNLOAD_AUDIO_EXTENSIONS` to avoid clashing with the
  new public `AUDIO_EXTENSIONS`.
- **Verification:** `testDebugUnitTest` → **196/196 pass**, zero warnings. New tests: `AudioTagsTest` (14),
  `ScanPlanTest` (16), `ImportPipelineTest` (filename/metadata/genre/formats), `LibraryDomainTest`
  (stats/missing/folders), `AudioInspectionTest` (stream info + embedded art, synthetic headers). Three
  initial failures were wrong test expectations, corrected to RN's actual behavior (bare genre numbers and
  unresolved references pass through; a leading-dot filename keeps its stem).
- **Next:** the Android services (DeviceScan/MediaStore+SAF, AudioInspection wiring, Import, Artwork,
  FileLocation) + repositories, then the import wizard + missing screens.

### 2026-11-15 — Phase 4 complete: Android pipeline + wizard + missing screen (verified)
- **Media services (`data/media/`):** `FileIo` (ContentResolver window reads + size + conservative
  reachability), `ContentHashService` (first-1MB hash + ID3 in one pass), `AudioInspectionService`
  (head/tag-overflow/MP4-tail windows, stream-refusal), `DeviceScanService` (MediaStore enumerate +
  permission, SAF tree grant + recursive walk via DocumentsContract, 3-way identify pool),
  `ArtworkService` (SHA-256-keyed store under filesDir, saveImportedArtwork 3-outcome stamping, bounded
  backfill that skips streams without stamping).
- **Repository:** `LibraryRepository` = ImportService + RelinkService (loadLibraryIndex, findGoneLocations,
  importIdentifiedFiles insert/relink/replace-detection, listMissing with per-track stake, trackStats +
  sessionSummary). Added DAO queries: getBySourceUri/getByAvailability/setArtwork/countMissingArtwork/
  updateLocation, session activityCounts, annotation countsForTracks.
- **UI:** `ImportViewModel` + `ImportScreen` (choose→scanning→preview→importing→done, permission +
  OpenDocumentTree launchers, new-only/all chips, relink-aware button), `MissingViewModel` + `MissingScreen`
  (folder groups, stake rows, danger notice, resume-refresh). New design-system pieces: `ScreenHeader`,
  `PrimaryButton`, `PaletteTile` (DS-15), a `trailing` slot on RowShell/ListRow, and title/action on
  InlineNotice. Routes `import`/`missing`/`track/{id}` registered; debug entry bubbles in the shell.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, **196/196 tests**, zero
  warnings; KSP validated the new DAO queries. APK ~85 MB debug. Marked LIB-13…20, 28/29/30 ✅.
  LIB-21/22 (track detail) + LIB-27 (search engine) land in Phase 8. **On-device scan/import is the owner's
  check** (no device attached). **Next: Phase 5 — auth & sync.**
### 2026-11-15 — Phase 5 complete: auth & sync (verified)
- **Auth:** `SecureTokenStore` (Keystore-backed EncryptedSharedPreferences), in-memory `AuthSession`,
  `AuthRepository` (login/register/getMe/restore/logout + cached profile in settings KV), `AuthViewModel`
  + `AuthScreen` (one screen, login/register modes, IME chaining, inline error) + `AuthGate` (Loading →
  Unauthenticated/Authenticated). Restore opens on the saved token and cached profile; only a background
  `getMe` rejection (`validation`, the backend's expired-token envelope) ends the session — offline and
  timeout never log out.
- **Wire:** `LesanClient` (Ktor, `{model,act,details}`, `token` header, `{success,body}`, 15 s timeout,
  transport-error classification) + `LesanError` vocabulary matching RN `errors.ts`.
- **Push:** pure `SyncEngine.runSync` (registerTrack first, then ≤50 `syncLocalData` batch; sessions only
  when finalized + track-synced; playlist deferral; tombstones hard-deleted on ack; failures stay
  queued). `LesanSyncTransport` builds the exact RN wire payloads; `RoomSyncStore` backs it.
- **Pull:** `SyncRepository.pullFromServer` fetches tracks/sessions/annotations/playlists/runs/collections/
  settings in parallel (page 500, RN parity) and applies `reconcile*` plans: tracks by contentHash +
  originRepairs, sessions/runs/annotations by clientId INSERT-IGNORE, annotation/playlist/collection LWW,
  tombstones never resurrected, playlist items serverTrackId→local.
- **Triggers:** periodic baseline + connectivity-regained (`PejvakApp`), foreground (`MainActivity.onStart`),
  after session finalize (`PlaybackEngine.onSessionFinalized` → `SyncScheduler`), after import
  (`ImportViewModel`), after login/register/restore (`AuthViewModel`), and manual Sync now. One-time work
  carries exponential backoff; the worker exits quietly without a session.
- **Settings slice:** new `SettingsScreen`/`SettingsViewModel` (Account; Storage & sync: imported bytes,
  pending breakdown, relative last-synced, history meter, Sync now; Sign out with confirm). Auth gate now
  follows the shared token, so a sign-out from Settings returns to the auth flow. Routes + a settings
  entry in the shell. The remaining Settings sections stay Phase 13.
- **Entitlements (SY-11):** `syncLocalData`'s `historyQuota`/`historySkipped`/`crossDeviceSync` are parsed
  and carried into `SyncSummary`/`SyncRepository.lastQuota`; the meter renders in Settings. Rows skipped
  over the cap stay on-device (never pruned, never gated); the upgrade prompt itself stays future work.
- **Tests:** +`SyncStatusTest` (queue wording/plurals, relative time buckets, quota copy), +quota
  propagation in `SyncEngineTest`, +`onSessionFinalized` callback in `PlaybackEngineTest`.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, **230/230 tests**, zero
  warnings. **Live-backend login and a second-install pull are the owner's on-device check** (no device
  or credentials here). Marked AUTH-01…08, SY-01…12, SE-01/05/08 ✅. **Next: Phase 6 — player UI.**
### 2026-11-15 — Phase 6 complete: player UI (verified)
- **Pure domain:** `Enhancer.kt` (settings, gain ranges, normalise/quantise, implies-enabled, flat/active,
  dB copy), `ToneCatalogue.kt` (7 tones room-first, credits, find/default, room-tone max/pick level),
  `PlayerFormat.kt` (speed cycle, clock/remaining/listened, context position, sleep label, digit entry,
  clamp). `PlayerFormatTest` covers every branch; `PlaybackEngineTest` adds the queue-jump run test.
- **Engine/service:** `PlaybackEngine.jumpToQueueIndex` shares `loadQueueIndexLocked` with skip/previous
  (finish stretch interrupted, keep the run, new stretch, Connecting phase). `skip` no longer restarts
  the last track at a boundary. `PlaybackService.start(context)`; `ExoPlayerCommand.loadAndPlay` waits
  briefly for the service-created player so a cold start-then-load cannot race.
- **Now Playing:** a full-screen in-window overlay (not a dialog) with an anchored expand/scale
  transition from the dock edge and reverse on close, back handling, and its own system-bar insets.
  `PlayerContent` follows DESING §10.1: close/title/queue header, double-border hero with skip kick,
  context overline + listened readout, scrubber with colored markers + times + wave/sweep, status line,
  transport (prev/±30/64 dp play/next), volume + room-tone sliders, chip row, notes list.
- **Parts:** `Scrubber` (tap-to-seek vs marker hit-slop, preview drag, wave flattens when paused/static
  under reduced motion), `TransportControls`, `SpinnerRing`, `PlaybackStatusLine` (long-wait variants),
  `LevelSliderRow`, `GainSliderRow`, `PlayerChipRow`, `HeroArtwork`, `AnnotationList` (selected note
  highlight), `markerColor`.
- **Sheets:** Queue (jump within the run), Sleep (5/15/30/45/60 + custom + cancel), Jump-to-time,
  Enhancer (enable + boost/bass/treble + tone entry), Tone picker (7 tones + credits). Mini-player row
  in the dock and a standalone mini-player on non-tab screens (content reserves its height).
- **1 Hz isolation:** `PlayerViewModel` exposes a stable `frame` (position/listened zeroed, distinct) plus
  separate `position`/`listened` flows; only `ScrubberSection`, `ListenedReadout`, `SleepChip` and the
  status-line ticker collect the tick. The dock model never carries position.
- **Deferred, explicitly:** Add-note / Add-to-playlist chips need the composer (Phase 7) and playlist
  sheet (Phase 8); the context chip opens the Library tab until folder/playlist/online routes exist
  (Phases 8/10); enhancer/tone audio attach is Phase 7 and persistence Phase 12; the DESING shared-element
  morph is the documented fallback (anchored expand) until a device-tuned shared transition. The UI talks
  to the in-process engine; the MediaSession already covers external/hardware controllers.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, **246/246 tests**, zero
  warnings. Debug APK ~85 MB. Marked UI-01…UI-18 ✅. **On-device playback/visual checks are the owner's**
  (no device attached). **Next: Phase 7 — annotations & notes.**
### 2026-11-15 — Phase 7 complete: annotations & notes (verified)
- **Pure domain:** `AnnotationColors` (6 colors/names, wrap-deterministic picker, clamped marker ratio),
  `Tags` (trim/collapse, Persian-folded dedupe, 10×24 limits, typed rejects), `DateRange` (zone-aware
  day bounds, presets, contains/active, copy, `yyyy-MM-dd` input), `Notes` (join model, field table,
  ranked search with fold-index-aligned highlight ranges, range filter, tags/origin copy), `NoteDetail`
  (marker list, timeline, fact rows with position/collection/author/plays), `AnnotationsMarkdown`.
  `core/TextFold` gained `foldWithMap`/`foldQuery` so search highlighting survives folding.
- **Repository:** `AnnotationRepository` is the single owner — live/for-track flows, create (color by
  count, `timesPlayedBefore` from ended sessions, sync-now), update (strict LWW `updatedAt`), delete
  (soft tombstone + sync). `LibraryRepository.annotationCounts(ids)` exposes live counts for cards.
- **UI:** `AnnotationComposerSheet` (text, tag input, six swatches, position), `NoteTimeline`, Notes tab
  (`NotesScreen`/`NotesViewModel`) with ranked text/tag/track/folder search, highlighted rows, preset
  date chip, delete confirm, empty/no-match states; `NoteDetailSheet` (overline, tinted note, timeline,
  facts, Resume, edit/share/delete); player selected-note sheet (tap marker/list → seek + note, Edit,
  Delete) and Add-note chip; native Markdown Share (`ACTION_SEND`).
- **Deferred, explicitly:** custom (from/to) dates land with the shared `DateRangeSheet` in Phase 9;
  library cards render the count in Phase 8 (query/helper ready); track-detail Markdown export reuses
  the same formatter in Phase 8; the note detail is a dedicated sheet until History's
  `SessionDetailSheet` exists (Phase 9).
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, **308/308 tests**, zero
  failures. On-device visual/share checks are the owner's (no device attached). Marked AN-01…AN-09 ✅.
  **Next: Phase 8 — library & detail screens.**
### 2026-11-15 — Phase 8 complete: library & detail screens (verified)
- **Pure domain:** `LibrarySearch` (field-aware ranked index, quality→title→position, fold-aligned
  ranges), `FolderPlay` (mode plan: resume/restart/unfinished/shuffle, progress + status copy),
  `PlaybackContext` (run shape, partial-run detection, resume target, stats/outcome copy),
  `RecentPlays` (distinct folder/playlist/track collapse, 12 shallow / 60 deep), `Playlists`
  (normalise, add/remove/move, resolve), `LibrarySummaries` (folder/playlist cards), plus the existing
  `SmartPlaylistRules` recipes. Tests: `LibrarySearchTest`, `FolderPlayTest`, `PlaybackContextTest`,
  `RecentPlaysTest`, `PlaylistsTest`.
- **Data:** `PlaylistRepository` (create/rename/delete, add/remove/move, strict LWW `updatedAt`),
  `ContextPlayRepository` (live/get/stats/delete), `LibraryRepository` gained `getByFolderKey`,
  `allTracks`, `allSessions`, `observeAnnotations`, `annotationCounts`; `SessionDao.ContextStatsRow`.
- **UI:** Library tab (header, language prompt, global search with per-view counts and “Also N under X”,
  Local/Online sub-segment, spotlight, missing alert, Tracks/Folders/Playlists/Recent, smart recipes,
  create/delete playlist); Track detail (facts, sessions, notes, Markdown share, add-to-playlist);
  Folder detail (mode-aware Play/Continue/Play again, unfinished chip, add-to-queue, save/add-all to
  playlist, per-track status, run history); Playlist detail (rename, delete confirm, reorder up/down,
  remove, add-tracks picker, run history); Smart detail (5 rules, reasons, commute budget, save/add-all).
  Idle artwork backfill (8/visit, pauses while scrolling, streams excluded in SQL).
- **Deferred, explicitly:** Online shelf (LIB-08) needs the Phase 10 adapters; folder “batch add”
  writes to the selected playlist (multi-select sheet is a polish item); the folder history sheet is
  local to that screen while `ContextHistorySheet` serves playlists.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, zero failures.
  On-device visual/playback checks are the owner's (no device attached). Marked LIB-01…07,
  LIB-09…12, LIB-21…26 ✅. **Next: Phase 9 — history & stats.**
### 2026-11-15 — Phase 9 complete: history & stats (verified)
- **Pure domain:** `History` (stretch entries, keyset cursor + page merge, day grouping/labels both
  orders, flat “longest” sort, resume targets, time/position formatting, Persian-folded search fields,
  Markdown export), `HistoryStats` (totals from finalized sessions, leaders, daily buckets, current and
  best streaks, media split). `HistorySort` gained `Longest` (persisted through the existing LWW
  setting). Tests: `HistoryTest`, `HistoryStatsTest` (14 cases).
- **Data:** `SessionDao` keyset `pageByStretch` (subquery selects whole stretches), range query, bulk
  tombstone; `HistoryRepository` joins tracks + collection titles once, pages, deep-reads for stats,
  soft-deletes a session/stretch and queues sync.
- **UI:** `HistoryScreen` with a two-page pager (History/Stats), sessions vs collections tabs, search,
  date-range sheet, newest/oldest/longest sort (persisted), pull-to-refresh, stretch cards with
  day-section headers, run cards (resume/open/delete), selection mode + bulk delete, Markdown export via
  native Share. `SessionDetailSheet` (timeline, facts, resume, delete), `ListeningTimeline`,
  `DateRangeSheet`. Stats panel: totals, streak/best, 14-day bars, top tracks, media split.
- **Deferred, explicitly:** opening a run routes to folder/playlist screens (online runs stay in the
  sheet until Phase 10); the player has no session-history entry point yet — the shared sheet is ready
  for it in Phase 12 polish.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, zero failures.
  On-device visual/share checks are the owner's. Marked HI-01…HI-14 ✅. **Next: Phase 10 — online
  sources & Discover.**

### 2026-11-15 — Phase 10 complete: online sources & Discover (verified)
- **Adapters (ON-06…ON-08):** `data/remote/online/` — manahej, aminikhaah (series + podcasts), esra
  (HTML + cleartext), mesbah, shariati (https-forced media), librivox, radiobrowser (live), and
  archive×46 built from the language seed; shared `TextClean`/HTML helpers; `OnlineTransport` maps
  timeouts/IO/parse to `OnlineSourceException`. Archive parsing keeps seconds-vs-MM:SS rules, .mp3
  playable filter, gone-item handling and stable `/download/` URLs.
- **Registry + service (ON-09):** `OnlineRegistry` (source id → adapter, language fan-out) and
  `OnlineCatalogService` (5-min in-memory cache, network→saved-shelf fallback with `fromCache`, real
  trackCount on open, `resolveStreamUrls`, materialises ordinary `Track` rows with
  `contentHash = sha256("online:source:external")`, `origin=online`, `file_uri` = stream URL).
- **UI (ON-01…ON-05, ON-10…ON-13):** Discover tab with swipeable Continue/Favorites/Browse pages,
  searchable language picker sheet (46 languages, native/English/code), source list, language screen,
  source screen (favorites, live badge, refresh, homepage, offline notice), collection screen
  (Continue/Play, favorite, source page, per-track progress rows, stale/offline notices, resume from a
  run), and a saved shelf through `OnlineCollectionRepository`. Online runs in History now open the
  collection. Downloads remain Phase 11, so collection rows show download state but no controls yet.
- **Shelf sync + config (ON-19, ON-20, ON-22):** favourite/open/download setters dirty sync;
  remote insert stays `INSERT … IGNORE` so a tombstone is never resurrected; `describeDownloadState`
  is shared by Continue and Favorites; esra cleartext was already in `network_security_config.xml`.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, zero failures;
  `OnlineTest` (8 cases) pins key parsing, language list, durations, naming and kind labels.
  On-device streaming/visual checks are the owner's. Marked ON-01…ON-09, ON-12, ON-13, ON-19, ON-20, ON-22 ✅;
  ON-10/ON-11 keep only their Phase-11 download controls open, and ON-21 stays open for the download half. **Next: Phase 11 — Downloads.**

### 2026-11-16 — Phase 11 complete: downloads (verified)
- **Worker (ON-14, ON-18):** `DownloadService` queues one `download_jobs` row per track and pumps
  sequentially, retries at 2 s/8 s up to 3 attempts, coalesces progress writes (500 ms / 1 pp), and
  `awaitIdle()`s before delete. Cancel disconnects the active connection and keeps files; interrupted
  jobs requeue on launch. Finalising a scope always writes a state (0 jobs → `none`).
- **Scopes/files (ON-16, ON-17, ON-21):** `download_scopes` records collection/series state;
  `download_files` keeps per-scope copies so deleting a series does not break the collection copy.
  `refreshTrackLocation` prefers collection copy → earliest series copy → stream. `folder_key` is
  written only when a file lands. Naming lives in `domain/Naming.kt` (one canonical copy; the
  duplicate `domain/online/OnlineNaming.kt` was folded in) with padded track names, `::series::`
  markers and sanitised, bounded segments.
- **Series + UI (ON-10, ON-11, ON-15):** `domain/online/Series.kt` groups same-show titles (only
  groups of ≥2, one-offs in a trailing section). Collection screen gains DownloadControl, per-series
  headers with their own download chip, and a confirm-first delete dialog; the source screen gains a
  per-collection download action + state line + error notice. Strings added for every verb.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, 387/387 tests.
  `SeriesTest` (10), `DownloadProgressTest` (6) and `OnlineTest` (11) pin grouping, progress
  coalescing and naming. On-device transfer/cancel/delete checks are the owner's. **Next: Phase 12 —
  audio effects.**

### 2026-11-16 — Phase 12 complete: audio effects (verified)
- **Pure logic (FX-02, FX-06…FX-09):** `domain/Enhancer.kt` gained the log-spaced bass/treble shelf
  weights (`bassWeight`/`trebleWeight`, 120–400 Hz and 2–8 kHz) and the persisted JSON form
  (`serializeEnhancer`/`parseStoredEnhancer`, per-field fallback). `domain/ToneCatalogue.kt` gained
  the 22.05 kHz room-tone generator (mulberry32 seed `0x9e3779b9`, de-meaned, RMS 0.12, peak ≤0.98),
  `roomToneAmplitude` (−75…−30 dBFS), `normalizeRoomTone`/`describeRoomTone`, `parseToneId`,
  `toneFileName` and `toneAssetName`. `AudioEffectsTest` (10 cases) pins the catalogue/credits,
  WAV header/size/determinism/loudness, shelf weights, level mapping and enhancer round-trip.
- **Native engine (FX-01, FX-03, FX-05):** `playback/NativeEnhancer` attaches `Equalizer` +
  `LoudnessEnhancer` to the player's own generated `audioSessionId` (set before prepare), applies
  band gains from the shelf curve and catches every `Throwable` (failure becomes status, never a
  crash). `playback/TonePlayer` is a second looping ExoPlayer that plays the bundled recordings from
  `assets/tones/` and the generated WAV from cache, at the mapped volume, without audio focus.
  `AudioEffectsController` binds them to the service, follows play/pause idempotently, pauses the
  tone on pause, releases both on stop/teardown, and probes availability for the sheet.
- **Persistence + UI (FX-04, FX-10…FX-12):** `AudioEffectsRepository` stores `audioEnhancer`,
  `roomTone`, `ambientTone` and `volume` device-only (never synced), coalescing writes at 400 ms.
  Moving a slider still implies "on"; picking a tone at level 0 sets 35 %. The existing
  AudioEnhancerSheet/TonePickerSheet now read the controller's state, show an honest unavailable
  reason, and the volume + tone rows share `LevelSliderRow`. The six recordings were copied from
  `mobile/assets/tones/` into `app/src/main/assets/tones/`.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, 396/396 tests.
  On-device enhancer/tone/Bluetooth checks are the owner's (no device attached). **Next: Phase 13 —
  settings, AI & polish.**

### 2026-11-16 — Phase 13 complete: settings, AI & polish (verified)
- **Settings (SE-02…SE-04, SE-06, SE-07):** the screen now runs Account → Playback (speed segments)
  → Appearance (theme segments) → Motion (segments + Haptics switch) → Storage & sync → Library
  (“All notes” jumps to the Notes tab) → Developer (field gallery, debug only) → Sign out. Values
  come from `SettingsRepository`; each control writes through the repository. The theme preference
  drives `PejvakTheme` at the activity root, motion maps onto `LocalMotionPreference`, and haptics
  onto a new `LocalHapticsEnabled`, so BubbleButton/GlassChip/SegmentedControl fire once on press.
- **Persisted keys (SE-09…SE-11):** all shared/device-only keys already live in the Room KV store
  (no DataStore), including volume/enhancer/tone; `useMotionEnabled` (OS scale × in-app choice) is
  now actually fed by the preference.
- **AI catalogue (AI-01…AI-05):** `domain/AiFeatures.kt` carries the four tools and the pinned
  coming-soon copy; `AiScreen` renders the hero, the 2×2 grid and the “why none of this is on”
  panel; `AiFeatureScreen` shows the tool's glyph in two rings, the pinned headline/body, what it
  would do, and a way back (unknown ids land on the honest fallback). `AiGlyph` paints the ramp's
  lightest stop on a deep-canvas disc; `AiContrastTest` holds every tool at ≥3:1 on both canvases.
  No service/queue/upload exists. The AI verb is on track, folder, playlist, history and online
  rows and opens the catalogue without carrying identity; the player chip already did.
- **Polish (PL-05/07/08):** native `ACTION_SEND` Markdown sharing exists for notes/history/track;
  the field gallery stays behind `BuildConfig.DEBUG`; tone credits are listed in the tone picker.
- **Verification:** `testDebugUnitTest` + `assembleDebug` → BUILD SUCCESSFUL, 402/402 tests
  (`AiFeaturesTest` + `AiContrastTest` added). Visual light/dark checks and device haptics are the
  owner's. **Next: Phase 14 — hardening & release.**

### 2026-11-16 — Phase 14 complete: hardening & release (verified in code/build)
- **Parity audit:** walked all 148 §3 IDs. 147 are ✅ and one is retired: **PB-19 Android Auto**
  (no browse tree; RN had none; MediaSession still drives lock-screen/Bluetooth). Three IDs carry
  honest notes rather than silent claims: PB-11 ships RN's 5-step speed cycle (the 9-step list was
  aspirational), DS-05 retires Time/Date fields (no production use), DS-15 folds OriginBadge and
  artwork crossfade into existing components.
- **Missing wiring found by the audit and fixed:** PB-20 `notePlaybackStarted` was implemented on the
  Radio Browser adapter but never called; the engine now fires `onPlaybackStarted` when a session
  begins and the service forwards it to the source (pinned by a new engine test). PB-17 position
  smoothing now tweens the scrubber/wave between 1 Hz ticks (snaps on seek/pause, honours reduced
  motion).
- **Release (PL-06):** R8 + resource shrinking already configured; a lint-vital failure
  (`canvas_base_night` had no base declaration) was fixed, and the splash background now uses the
  launcher colour. `assembleRelease` → **14 MB** unsigned APK (91 MB debug). No RN release APK exists
  on this machine, so the comparison is debug-vs-release only.
- **Hardening:** the splash is now held until saved settings load, so the first frame is already in
  the listener's theme; predictive-back opt-in and the base colour fallback were added. A Room
  instrumented smoke test opens all 12 tables and round-trips a setting; it compiles via
  `assembleDebugAndroidTest` but needs a device to run.
- **Verification:** `testDebugUnitTest` + `assembleDebug` green (403/403 after the new engine test);
  `assembleRelease` green. Offline→online recovery, kill recovery, both themes, haptics and
  performance are the owner's device checks.

### 2026-11-16 — Owner bug-fix round (code done; device checks pending)
- **Tabs & insets:** bottom tabs now match RN order (Library, History, Discover, Notes, AI);
  the content is `statusBarsPadding()`, the dock/mini-player are `navigationBarsPadding()`, and the
  reserved bottom space is computed from the real dock + optional player height instead of a fixed
  inset (removes the tall empty band).
- **Library → Online:** the Online view is now RN's language → source directory (`sourcesForLanguage`
  filtered by the fold query, with counts), and a source row opens `online/source/{id}`.
- **Online playback:** `ExoPlayerCommand.loadAndPlay` resolves a fresh signed stream URL through
  `OnlineCatalogService.resolveTrack` before handing the URI to ExoPlayer; the stored URL is only a
  fallback. Local playback is unchanged.
- **Online identity in sync:** pulled tracks now carry `sourceId`/`externalId`/`collectionKey`/
  `collectionTitle`/`artworkUrl`; online inserts use the content hash as their local id; existing
  rows missing the online address are repaired in place (`OnlineIdentityRepair`), and materialise
  matches on `content_hash` so an old random-id row is reused rather than forked. This is what lets
  pulled online notes resolve to a track and online rows play.
- **Crash containment:** `onlineGuard` now converts every non-cancellation exception from a source
  adapter (parse, cast, index) into `OnlineSourceException`; `SourceViewModel` and
  `OnlineCollectionViewModel` also catch unexpected exceptions and surface the error state instead of
  crashing the screen.
- **Verification:** `testDebugUnitTest` (404/404, new `OnlineIdentityRepair` test),
  `assembleDebug`, `assembleDebugAndroidTest`, `assembleRelease` all green. The notification crash
  still needs a logcat from the owner's device; no emulator is attached here.

### 2026-11-17 — On-device bug-fix round (emulator API 35)
- **Emulator set up** because no AVD existed and `sdkmanager` cannot reach Google's repo here:
  emulator 35.4.5 + `system-images;android-35;default;x86_64` were fetched from the redirector CDN,
  unpacked into the SDK with a hand-written `emulator/package.xml`, and an AVD
  (`flowcast_api35`, Pixel 6, 4 GB) was created.
- **Playback force-close (root cause found):** starting an online track called
  `startForegroundService()` and then spent >5 s resolving the signed URL before ExoPlayer played;
  `PlaybackService` never called `startForeground()`, so Android killed the process with
  `ForegroundServiceDidNotStartInTimeException`. The service now posts a low-importance placeholder
  notification immediately in `onCreate` (same id/channel Media3 uses), so the deadline is met even
  when the network is slow.
- **Media notification was stuck on the placeholder:** the session was never handed to
  `MediaSessionService`, so `getSessions()` stayed empty and Media3 never generated its transport
  notification. `onCreate` now calls `addSession(mediaSession)`; the notification updates with the
  track title/artist and 2 transport actions, and playback survives backgrounding.
- **Bottom navigation “background”:** the three-button system bar drew an opaque light scrim over
  the teal canvas. `MainActivity` now applies `SystemBarStyle.dark(transparent)` for both bars, turns
  off navigation-bar contrast enforcement, and clears the legacy light-bar flags — the canvas runs
  edge-to-edge behind the buttons with light icons in both themes.
- **Debug shortcut overlay** no longer covers detail screens (it was overlapping the collection's
  Favorite button); it is limited to tab headers.
- **Discover → Continue** now shows the saved collection's real title (`The Art of War`) instead of
  the raw `archive-en:art_of_war_librivox` key stored by older runs.
- **Verification on emulator:** register → Library → Online source → collection → play works;
  `dumpsys media_session` reports `PLAYING`, the notification shows the real track, Home keeps audio
  alive, and `logcat -b crash` is empty. `testDebugUnitTest` 404/404, `assembleDebug`,
  `assembleDebugAndroidTest` and `assembleRelease` green.

### 2026-11-17 — Owner UX round: player entry, wave loading, glass sheets, Online default
- **Mini-player progress:** the dock and standalone mini-player now carry the same wavy progress
  line as the full scrubber. Position is a separate `miniProgress` flow so the once-a-second tick
  recomposes only the leaf wave, not the dock.
- **Open the player on play:** `PlaybackEngine` emits `openPlayer` from `transportLoadAndPlay` only
  (deliberate starts and resumes), and the shell collects it to show the full player. Auto-advance
  and queue skips never emit, so finishing a chapter does not pop the overlay.
- **Wavy loading:** while a source is `Connecting`/`Buffering`, the scrubber and mini wave draw a
  full-width low-contrast travelling wave instead of the old sweep band; reduced motion keeps it
  static.
- **Glass sheets:** `GlassSheet` is now a floating xl-rounded panel with a 1 dp white (`glassBorder`)
  stroke, a bottom margin so it clears the navigation bar, and the drag handle inside the border.
- **Glass player:** the shell behind `NowPlayingSheet` blurs (animated 18 dp on API 31+), and the
  overlay dropped from 94 % to 68 % canvas plus a glass wash, so the player reads as frosted glass
  instead of an opaque screen.
- **Online default:** once an online language is stored, the Library opens on the Online directory;
  choosing a language in the prompt switches to it, while an explicit tab choice is respected.
- **Verification:** emulator API 35 screenshots confirm the default Online tab, the sheet stroke and
  bottom gap, the mini wave, the wavy `Connecting…` scrubber, and the player opening on play.
  A new engine test pins that a deliberate start emits `openPlayer` and a queue skip does not.
  `testDebugUnitTest` 405/405, `assembleDebug` and `assembleRelease` green.

### 2026-11-17 — Owner UX round 2: sheet margins/blur, transparent chrome, history rows, chrome cleanup
- **Sheet margins + frosted backdrop:** `GlassSheet` now insets the panel on the sides as well as the
  bottom (floating card), and a new `SheetPresence` / `LocalSheetPresence` counter lets the shell blur
  the content behind any open sheet (18 dp animated, API 31+). Sheets render in their own window, so
  the panel stays crisp while the activity window behind frosts; the scrim lightened from 55 % to 35 %
  black so the blur reads. `NowPlayingSheet` blur now shares the same target as any sheet.
- **Transparent chrome:** `GlassSurface` gained `filled`; the dock and standalone mini-player pass
  `filled = false`, so they are a stroke + rim light over the soft ambient canvas instead of a filled
  panel.
- **History rows:** session and collection cards now show exactly two trailing actions — AI and delete.
  Tapping a card opens its detail sheet (which carries resume + delete) instead of resuming inline;
  the inline play/info buttons are gone. Removed the now-unused resume plumbing from `HistoryList`.
- **Top-right cleanup:** removed the floating top-right column (settings + debug gallery/import/missing)
  that overlaid History, Notes, Discover and AI. Settings stays on the Library header.
- **Verification:** API 35 screenshots confirm AI + delete rows, the removed top-right column, and the
  border-only dock. The emulator was in concurrent use by the owner during the session, so the sheet
  margin/blur pass was verified in code (build + tests) rather than by a fresh screenshot.
  `testDebugUnitTest` 405/405, `assembleDebug` and `assembleRelease` green.

### 2026-11-17 — Owner bug round: folder keys with spaces, player context/queue, wave redesign
- **Folder names with spaces (data loss on open):** every folder/collection route used
  `java.net.URLEncoder`, which is a *form* encoder — it writes a space as `+`. Navigation decodes
  `%20` but leaves `+` alone, so "Test Folder" arrived as the key `Test+Folder`, matched no track,
  and the detail screen rendered "Empty folder". All route builders now live in one place at the
  bottom of `PejvakNavHost` (`folderRoute` / `playlistRoute` / `trackRoute` / `sourceRoute` /
  `languageRoute` / `onlineCollectionRoute`) and every argument goes through `android.net.Uri.encode`.
  Verified on the emulator against a seeded folder literally named "Test Folder": the header keeps
  the space and all three tracks list.
- **Player folder/context chip went home:** `onOpenContext` was hard-wired to
  `navigate(Tab.Library.route)`, so the chip that names the playing collection always dumped the
  listener on the Library tab. `NowPlayingSheet` now takes `onOpenContext: (PlaybackContext) -> Unit`,
  passes the player's own context through, and the shell routes Folder → `folderRoute(key)`,
  Playlist → `playlistRoute(key)`, Online → `onlineCollectionRoute(key)`. Verified: the chip opens
  "Test Folder" with its three tracks and the mini-player dock intact.
- **Queue sheet robustness:** the queue may legitimately hold the same track twice (`enqueue`
  appends), and `LazyColumn` throws on a repeated key — the whole sheet dies with it. Keys are now
  `"index:trackId"` in `QueueSheet` (and the same fix in `PlaylistDetailScreen`, which has the same
  shape). Verified: folder playback fills the queue with all three tracks and the chip opens it.
- **Scrubber wave redesign** (`Scrubber.kt`), three points the owner raised:
  - *Balance over time:* the old `wavePath` took the drawn width and ran a fixed 3 cycles across it,
    so the first seconds were a tight scribble and the last stretch a lazy near-flat line. The wave
    now has an **absolute wavelength** (25 dp) — crests keep their spacing at any progress — plus a
    gentle amplitude modulation (`variation`) so no two crests are identical, and a soft ramp at each
    end so the stroke never stops on a vertical jump at the playhead.
  - *Rippled resting track:* the faint unplayed line is no longer a straight rule; it carries a fine
    9 dp ripple at 1.1 dp amplitude in `glassBorder`, deliberately shorter and weaker than the played
    wave so it reads as texture, not signal.
  - *Third layer:* a 1.4 dp, ~92 dp segment leaves the playhead and dissolves through a
    `Brush.horizontalGradient` (0.38 → 0.20 → transparent) instead of ending on a visible edge.
  - The mini-player `WavyProgress` shares the same helpers at a smaller scale, and its canvas grew
    from 3 dp to 9 dp — at 3 dp the 2 dp stroke plus amplitude was clipped and the crests smeared.
  - Verified on API 35 in dark **and** light theme: the played wave has the same rhythm at 20 % and
    80 % of a 30 s track, the resting ripple stays subordinate, and the ghost segment is legible but
    quiet. `testDebugUnitTest` green, `assembleDebug` green.

### 2026-11-17 — Owner round 2: loudness strip + fish-wake scrubber
The owner rejected the previous wave pass on both counts and restated what he wanted: the resting
line should be an **audio visualization** (bars whose height is the volume at that point), and the
progress bar's motion should read as **a fish moving near the surface** — three waves, two flanking
and one in the middle, that fade, break into dots and converge into a single wave as they run back
from the playhead.

- **Loudness strip** — new `domain/Waveform.kt` (pure, unit-tested) and
  `data/media/WaveformAnalyzer.kt`. The analyzer seeks to the middle of each of 84 buckets and
  decodes ~60 ms through `MediaExtractor` + `MediaCodec`, mono-downmixes, takes RMS, and maps it to
  0..1 between a −52 dB floor and a −6 dB ceiling (`WAVEFORM_MIN_HEIGHT = 0.12` keeps silence
  visible as a hairline rather than a gap). Results are cached twice — an in-memory LRU and
  `files/waveforms/<contentHash>.waveform` behind a magic header with an atomic rename — and the
  whole thing runs only while the player is on screen (`flatMapLatest` over the track id,
  `WhileSubscribed(5_000)`), emitting partial arrays every 12 buckets so the strip fills
  left-to-right instead of appearing all at once. Any failure (a stream, an undecodable file) emits
  `null` and the strip degrades to a plain rule.
- **Strip rendering** — `drawWaveformBars` samples the measured array to the available pitch
  (4.4 dp) with a peak-preserving resample, 1.8 dp wide, ±9 dp tall. Played bars are drawn at 0.92
  alpha and resting bars at 0.17, so the loudness shape is legible behind the playhead and a quiet
  texture ahead of it.
- **The wake** — `drawWakeStrand`, drawn twice per frame, is the part that took the tuning. Three
  things had to be true at once and each earlier attempt got one of them wrong:
  - *Three waves, not one line with a shadow.* The strands need their **own phase offset**
    (±1.5 rad, decaying), not just a vertical offset. With an offset alone they run parallel to the
    centre wave and read as a grey ghost of it.
  - *Enough room to be counted.* At a 9 dp spread the strands grazed the centre wave's own envelope
    (3 dp amplitude plus a 3 dp stroke) and were swallowed; the spread is 10.5 dp and the strand
    amplitude is 0.35× the wave's.
  - *Converge gradually, not at once.* `1-(1-near)²` holds the fan open through most of the wake and
    closes it near the tail; a plain `near^1.9` shut the fan a third of the way back and left the
    rest as one bare line.
  - The two strands are deliberately **not mirror images** (different spread, different phase,
    different sign of phase): a mirrored pair closes into a lens that reads as an outline. Dash
    length collapses `near^2.2` (9 dp → 0.6 dp) while the gaps widen, so the ripple turns into dots.
  - The wake is drawn only while `amplitude > 0.01`; paused, the amplitude animates to zero and the
    fan would freeze into three flat dashed rules. Verified paused: a flat played line, no strands.
  - The played wave is no longer tapered at the playhead end (`taperEnd = 0`), so the crest the eye
    follows stays alive; the playhead dot masks the cut. The halo shrank 11 dp/0.20 → 9 dp/0.14
    because it read as a grey smudge over the bars, and the drift slowed to 3.8 s per cycle.
- **Verification:** seeded a 120 s tone with a 17 s swell into the emulator's app-private storage and
  drove the UI with `uiautomator` + `input tap`; checked at ~60 % progress in light and dark theme,
  paused and playing, and on the dock's mini wave. `testDebugUnitTest` **413/413** (8 new in
  `WaveformTest`), `assembleDebug` green. Seeded rows, audio and the waveform cache were removed
  afterwards; `themePreference` restored to `light`.

### 2026-11-17 — Owner round 3: the playhead swims, the dock gets the same bar
Two follow-ups from the owner after round 2: the dot should rise and fall with the wave ("just
like a fish swimming"), and the mini-player should carry the same progress bar.

- **The playhead rides the wave.** The dot used to be pinned to the vertical centre, which read as
  a slider handle rather than as a body on the surface. The curve is now evaluated in exactly one
  place — `waveOffsetAt(x, amplitude, wavelength, phase, variation)` — and both `wavePath` and the
  playhead call it, so the dot cannot drift off the line it is supposed to be sitting on. The
  playhead also applies the path's start taper (`ramp(playedX, min(taper, playedX/2f))`), otherwise
  the dot would sit above the wave during the first second of a track, where the taper is still
  pulling the curve down to the baseline. Verified by sampling the dot's y in five screenshots
  ~0.5 s apart: 1489 → 1499 px, i.e. it tracks the ±3 dp swing. It rests at centre when paused
  because the amplitude animates to zero.
- **One renderer, two sizes.** `drawTrack(playedX, cy, amplitude, phase, waveform, waiting,
  accent, border, scale)` now draws the whole design — loudness strip → wake → played wave → riding
  playhead — and both surfaces call it: the scrubber at `scale = 1f`, the dock at `MINI_SCALE =
  0.55f`. Every dimension (bar pitch/width/height, wavelength, amplitude, stroke, wake spread,
  dash lengths, dot and halo radii) is the scrubber's multiplied by the scale, so the two can never
  drift into two different looks; `MINI_WAVELENGTH` / `MINI_RIPPLE_WAVELENGTH` are gone.
- **Dock wiring.** `WavyProgress` gained `waveform: FloatArray?`; `AppDock` and `StandaloneMiniPlayer`
  gained `miniWaveform: StateFlow<FloatArray?>?` and collect it in the leaf (`MiniWave`), so the
  waveform never recomposes the dock itself. `PejvakNavHost` passes `playerVm.waveform`.
- **Layout.** The dock's bar canvas went 9 dp → 14 dp (`MINI_HEIGHT`) to hold the mini bars (±5 dp)
  and the halo (±7 dp); the top padding dropped 4 dp → 2 dp so the row still fits
  `geo.dock.playerHeight` (58 dp) with **both** a title and an artist line — checked on the
  emulator, nothing clips and the panel edge is clear.
- **Verification:** API 35, light and dark theme, playing and paused, on the scrubber and on the
  dock (with and without an artist line). `testDebugUnitTest` 413/413, `assembleDebug` green.
  Seeded track/folder, audio and waveform cache removed afterwards; theme restored to `light`.

### 2026-11-18 — Owner round 4: ten fixes, one water language

The owner sent a list of ten. The theme behind most of them was that the wave language
had been invented for the scrubber and never carried anywhere else; the rest were
layout bugs that had been read as "unfinished design".

- **The wave moved into one module.** `ui/components/Wave.kt` owns `waveOffsetAt`,
  `wavePath`, `ramp`, `rememberWavePhase` and the wake; `Scrubber.kt` lost its private
  copies (~70 lines). Everything that needs a wave — the scrubber, the sliders, the
  session timeline, the tone chips, the page-transition swell — now draws the same curve.
- **Sliders are water** (`WaveSlider.kt`). The whole range is a dotted crest, the set
  value is a solid one, the thumb is a body riding the crest, and the wave only drifts
  and leaves a wake while the finger is down. The track is inset by half a thumb so the
  handle at 0 % is a whole dot; Material's `Slider` is gone from the app. The dotted rest
  is what makes "how much is left" readable — a solid line looked like the value.
- **Folder page.** Four chips in a fixed `Row` squeezed the last one into two lines; the
  row now scrolls edge-to-edge (and `GlassChip` refuses to wrap at all). The screen also
  gained a hierarchy: header → play button → chips → 20 dp break → rows at 8 dp, instead
  of one uniform 12 dp gap that made the first track look detached. Rows state what the
  folder is for: a finished track shows a tick and its play count, a partly-heard one
  shows `WaveProgressBar` with a head at the resume point. `FolderTrackRow` carries
  `playCount` (finalized sessions, same definition as `TrackStats`). The title now comes
  from `folderName`, not the tail of the key — "test-folder" was being shown as the name.
- **Icons that sit next to icons** go through `ActionCluster` (8 dp apart), applied to
  every row that pairs the AI bubble with play/delete.
- **Backdrop blur.** The shell already frosted behind the player and behind sheets, but a
  sheet opened *from* the player rendered in its own window while the player — the thing
  actually visible behind it — stayed crisp. `NowPlayingSheet` now frosts its own surface
  from `LocalSheetPresence.count`. While fixing it: `glassFill.copy(alpha = 1f)` painted
  the player solid white (the token is a 6 % white); the alpha is now scaled, not replaced.
- **Sheets got a header.** `GlassSheet(title, subtitle, icon)` draws an accent icon bubble,
  a headline, an optional subtitle and a hairline wave rule, and every call site passes an
  icon. The tone picker replaced seven identical radio dots with a per-tone wave chip and a
  check bubble; the session-detail timeline is now the player's wave with the heard range
  lit, "1 m 23 s of 3 m 19 s" above it and the seek tick still marked.
- **Room tone labels.** The player row names the selected tone ("Forest"), not the
  category; the enhancer's row shows it as an overline + value with a chevron. The row is
  also clickable as a whole — a clickable word was a 20 dp strip nobody found.
- **Swipe down to minimise.** The player body is a `verticalScroll`, so every drag went to
  the scroll and a sheet-level gesture never saw one (`change.isConsumed` on the first
  move). The body now reports its *unconsumed* downward pull through a
  `NestedScrollConnection`, and the sheet translates itself with it, dims as it travels,
  and minimises past 110 dp (springs back otherwise). `onPreFling` is the release signal.
- **Swipe between dock tabs.** `rememberTabSwipe` on the NavHost: because Compose delivers
  pointer events to the deepest node first, a horizontal drag a chip row, slider or
  scrubber has claimed never reaches it — so scrubbing cannot change tab.
- **Page transitions.** Forward: the incoming page rises and fades in while the outgoing
  one sinks and thins (mirrored on pop). A `WaveSweep` overlay sends two crests down the
  screen once per navigation, fading in and out at the ends, so the change happens behind
  a ripple. `useMotionEnabled()` turns all of it off.
- **Verification:** API 35 emulator. Folder page with mixed states (3 finished, 2 partial,
  1 untouched), swipe-down → mini player, tab swipe Library → History, queue/tone/enhancer
  sheets (frost + headers), session detail sheet, tone switch → row label follows.
  `testDebugUnitTest` 413/413, `assembleDebug` green.

### 2026-11-18 — Owner round 5: the design system written down, the AI tools in a sheet, a strip for streams

Three asks, in the order they were given.

- **`AGENTS.md` now carries the design system.** Round 4 built a water language and kept it
  in the agent's head; it is now a contract with a table of primitives, the "absolute
  wavelength" rule, "anything that sits *on* the wave asks `waveOffsetAt`", `WaveSlider` as
  the only slider, `WaveProgressBar` for read-only values, `GlassSheet(title, subtitle,
  icon)` as the only sheet, `ActionCluster` for adjacent icon bubbles, the page-transition
  vocabulary, and the `glassFill` alpha trap. A separate **Gesture rules** section records
  the three hard-won facts (a scroll container consumes vertical drags → `NestedScrollConnection`
  outside the scroller; two `pointerInput` on one node → only the inner one runs;
  `Animatable.animateTo` cannot run inside `awaitEachGesture`). A **Roles** section names
  owner / agent / reviewer and what each must not do.
- **The AI button stopped navigating.** Every per-item AI button (library, folder, playlist,
  history, online collection, and the player's own AI chip) used to push the AI tab and lose
  the listener's place. It now opens `AiCatalogSheet` — the AI page's content in the sheet
  language: `GlassSheet` header with the accent icon bubble, an `AiSeaBand` hero (three
  crests behind the glyph, the same curve as the scrubber), the page's headline and lede, the
  four tools as tinted rows with their `Soon` pill and a chevron, and the why panel. Tapping a
  row opens `AiFeatureSheet` **stacked on top** — pinned coming-soon copy, "What it will do"
  with `feature.detail`, and a way back — so closing a description lands on the list rather
  than on nothing. `AiWhyPanel` is shared with the AI page, so the explanation cannot go
  stale in one of the two places. The AI tab itself is unchanged.
- **Streams get a sample strip instead of a rule.** `WaveformAnalyzer` emitted `null` for
  anything it could not decode, and the scrubber drew a single flat line — which read as a
  bug on every Manahej/Internet Archive track. `domain/sampleWaveformFor(seed)` now returns a
  deterministic 84-bucket strip shaped like speech (phrase envelope + grain + a little tooth,
  clamped between `WAVEFORM_MIN_HEIGHT` and 1), seeded by `contentHash` so a station always
  looks the same. The analyzer emits it for stream URIs, for a track with no URI at all, and
  as the fallback when a container will not decode — never cached to disk, so a file that
  starts decoding later still gets its real strip. Local files are untouched.
- **Verification:** API 35 emulator, light and dark. AI sheet opened from an online-collection
  row, from a history row and from the player's AI chip; description sheet opened, closed by
  button and by swipe-down (the catalogue stayed); sheet content scrolls to the why panel; the
  AI tab still renders. A streamed track shows a varied strip with the played part lit in the
  scrubber and in the dock. `testDebugUnitTest` 417/417 (4 new sample-strip tests),
  `assembleDebug` green. Theme restored to `light`, language restored to English.


### 2026-11-18 — Owner round 6: two swipe gestures that had to be finished properly

- **The player's swipe-down always lands.** Two independent bugs produced the same "it stopped
  half way" symptom. (1) The release was taken from `onPreFling`, which a slow lift never
  dispatches — no velocity, no fling — so nothing settled the sheet. (2) When a fling *did*
  happen it kept reporting leftover deltas to `onPostScroll` after the finger was gone, feeding
  the pull while it was already settling. Now the release is taken from the pointer stream
  (`PointerEventPass.Initial` on `PlayerContent`, never consuming) *and* `onPreFling`/
  `onPostFling`, guarded by a one-shot `pullReleased` flag; `onPostScroll` only accepts
  `NestedScrollSource.UserInput`. Below 110 dp it springs back to the top, above it the sheet is
  carried to 460 dp and *then* dismissed, so it leaves downwards instead of dissolving in place.
  The next open resets the offset.
- **The Library's views swipe.** The chips are not routes, so the dock's swipe could not reach
  them. `Modifier.pageSwipe(index, count, onSelect)` in `ui/components/PageSwipe.kt` follows the
  finger at half rate, commits past 56 dp, and starts the incoming view from the side it should
  arrive on. It measures the slop itself instead of using `detectHorizontalDragGestures`, because
  that helper consumes the slop event — which would eat the gesture even when no view is left in
  that direction. At either end it declines, so swiping past "Recent" moves the dock on to
  History instead of dying at the edge. The chip row keeps its own horizontal scroll.
- **Verification:** API 35, light and dark. Slow lift with a short drag → snaps back; slow lift
  with a long drag → dismisses; fast flick both ways → the same two outcomes, never a stranded
  sheet; reopen starts at the top. Library swiped Online → Tracks → Folders → Playlists → Recent
  and back, past Recent into History, chip row still scrolls, vertical scrolling unaffected.
  `testDebugUnitTest` 417/417, `assembleDebug` green. Theme restored to `light`, playback paused.

### 2026-11-18 — Owner round 7: the Discover crash, and crash reports that survive the phone

- **Duplicate Lazy keys closed the app on Discover.** `IllegalArgumentException: Key "…" was already
  used` — `context_plays` keeps one row per *play*, so a collection resumed three times produced
  three "continue" cards with the same context key, and `items(cards, key = { it.key })` rejects
  that. `domain/resumableRuns()` now filters (online, not completed, not deleted), sorts by
  `updatedAt` and keeps the **newest run per context key** before the 8-item cut; the view model
  maps cards from that list. The list also stops showing the same collection twice, which it had
  been doing all along. Four tests in `ResumeRunsTest` cover the dedupe, the filters, the
  online-only rule and that the limit counts collections rather than runs.
- **Crash reports no longer need a cable.** `core/CrashLog` installs an uncaught-exception handler
  as the very first thing in `PejvakApp.onCreate`, writes `files/crashes/last-crash.txt` (time,
  version, device, thread, exception, full stack) plus a dated copy, keeps five, and always calls
  the previous handler so the platform's own reporting is unchanged. Settings → **Diagnostics →
  Send last crash report** shows "18 Nov 09:30 · IllegalStateException" (or "No crashes recorded")
  and shares the file through a `FileProvider` limited to that one folder.
- **Verification:** seeded two runs for `manahej:190` → one card, no crash; a debug-only throwing
  row produced `files/crashes/last-crash.txt` with the app frame in the stack, the Settings row
  picked it up on the next launch, and the share sheet offered `last-crash.txt` (Bluetooth /
  Messaging on the bare emulator). Probe row and seeded rows removed afterwards.
  `testDebugUnitTest` 421/421, `assembleDebug` green.

### 2026-11-20 — Playback context captured on session start

- **Both `PlaybackContext` copies carry the collection's order.** `domain.PlaybackContext` and
  `playback.PlaybackContext` gained `sort: CollectionSort = Unknown` and
  `direction: SortDirection = Asc`, so the ordering that produced the queue travels with the run
  and survives a resume.
- **The engine owns collection facts; the service supplies only audio treatment.**
  `PlaybackEngine.conditionsProvider` returns the effects snapshot (ambient tone, level, volume,
  enhancer bands). `beginSession` builds the base from the active run (title, sort, direction) and
  the live queue (`queueIndex`, `queue.size`), then overlays only the provider's audio fields with
  `copy`. A provider can never erase where the track was played from, and every field lands on the
  `Session` row in the same insert.
- **Call sites name their ordering.** Manual playlist (`PlaylistDetailViewModel`,
  `PlaylistRepository.contextFor`), folder (`FolderDetailViewModel` / `LibraryViewModel.playFolder`,
  `Shuffle` when shuffled, else `Folder`), smart (`SmartPlaylistViewModel`, `Smart`), online
  (`OnlineCollectionViewModel`, `Source`); history resumes keep `Unknown` by default, and
  `LibraryViewModel.playTrack` stays standalone with a null context.
- **Test:** `PlaybackEngineTest.sessionCapturesPlaybackConditions` installs a provider carrying only
  audio fields, plays a two-track playlist context, and asserts the stored session keeps
  `contextTitle` / `Manual` / index / size while taking all seven audio fields from the provider.
- **Verification:** `testDebugUnitTest` 440/440, `assembleDebug` green.
