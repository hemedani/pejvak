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

## Version pins (verified stable on this machine, from Hawraa)

AGP 9.5.1 · Gradle 9.6.0 · Kotlin 2.4.21 (built-in) · KSP 2.3.13 · Hilt 2.60.1 · Compose BOM
2026.09.00 · Room 2.8.5 · Media3 1.11.1 · WorkManager 2.12.0 · Navigation 2.10.2 · Lifecycle 2.11.0 ·
Activity 1.13.0 · DataStore 1.3.0 · Ktor 3.6.1 · kotlinx-serialization 1.13.0 · coroutines 1.11.0 ·
Coil 3 (latest stable). Bump only with a stated reason; check AGP compatibility first.

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