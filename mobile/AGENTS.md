# AGENTS.md — Pejvak Mobile

Agent rules for the **`mobile/` workspace**: the offline-first Android audio player for audiobooks, long-form content, and music. Read the root `../AGENTS.md` first — it is authoritative. This file documents the mobile implementation rules. Where the product docs disagree, `../AGENTS.md` wins.

## Non-negotiable platform rule

Expo has changed. Read the exact versioned documentation at [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) before using or adding any Expo API, config plugin, native module, permission, background task, notification, storage, or media feature.

Confirm that every package supports the versions in `package.json` before installing it, and keep `package-lock.json` and `package.json` synchronized. Prefer the Expo-supported package for the installed SDK over an unverified native alternative.

## Project context

- Framework: Expo SDK 57, Expo Router (file-based routing), React 19.2, React Native 0.86.
- Entry point: `expo-router/entry`.
- Package manager: **npm** (`package-lock.json`). Do not mix in yarn/pnpm.
- Source: `src/app` (routes), `src/components`, `src/hooks`, `src/constants`; `src/global.css`.
- Path aliases (`tsconfig.json`): `@/*` → `./src/*`, `@/assets/*` → `./assets/*`.
- Experiments enabled: `typedRoutes` and `reactCompiler` (`app.json`).
- Intended additions per `../AGENTS.md`: `src/services` (TrackPlayerService, LocalDBService, SyncService), `src/store` (Zustand), `src/lib` (generated Lesan client wrapper).
- Backend: `../back` (Deno + Lesan + MongoDB). Generated client types live in `../back/declarations/`; consume those types, do not redefine backend schemas by hand.
- Product specs: `../docs/DEEPSEEK.md` (data models, session math, sync engine), `../docs/GROK.md` (vision, flows, testing), `../docs/QWEN.md` (Lesan schemas, offline sync, roadmap).

## Product invariants

1. **Offline-first.** Every write goes to SQLite first; a background `SyncService` pushes it later. Never block the UI on a network call.
2. **Record every session.** Each continuous listen produces a `PlaybackSession` with `startedAt`, `endedAt`, `startPositionSec`, `endPositionSec`, `durationListenedSec`, `playbackSpeed`, `completed`, `interrupted`, and `deviceInfo`.
3. **Integer seconds only.** Never store audio offsets or durations as floats — audiobooks exceed 20 hours and floating-point drift is unacceptable.
4. **`contentHash` is the identity of a track** (SHA-256 of the first 1 MB + file size). Never dedupe or match by filename or path; history and annotations follow the hash across devices.
5. **`durationListenedSec` is wall-clock time played**, not `endPositionSec - startPositionSec`. On each progress event compute `delta = currentPosition - lastPosition`; add `delta` only when `0 < delta < 5` (normal play). On a seek (`delta > 5` or `delta < 0`) update the position without adding.
6. **Never lose a session on app kill.** Persist a lightweight checkpoint every 10 s; on launch, recover any checkpoint without a matching ended session (`endedAt = checkpoint.timestamp`).
7. **Idempotent sync.** Generate one persistent `clientId` per session/annotation and reuse it for every retry. After the server acknowledges, replace the temp id with the server id and mark the row `synced`.
8. **Sessions are append-only.** Never mutate a finalized session. A speed change or seek starts a new session.
9. **Annotations are editable; last-write-wins** on `updatedAt`.
10. **Auth wire format:** send the JWT in the `token` header with no `Bearer` prefix, and treat the backend envelope `{ success, body }` as authoritative — check `success` before reading `body`.

## Architecture rules

- Keep route screens thin. Put reusable behavior in hooks, services, or domain modules so it is testable without rendering.
- Own the player through a single `TrackPlayerService`; own persistence through `LocalDBService`; own delivery through `SyncService`. Screens talk to these, not to SQLite or `fetch` directly.
- All network calls go through the typed Lesan client in `src/lib`, which wraps the generated standard `lesanApi` fetch client (`back/declarations/selectInp.ts`). Do not add another HTTP or server-state library. All persistence goes through `LocalDBService`.
- Keep state separated: server data via the typed Lesan client (`src/lib`), local queue/DB (SQLite), player/session state (Zustand), and UI state. Do not mirror the same data in two stores.
- Strict TypeScript. No `any`. Derive API types from the backend declarations; run `npm run gen:api` after backend contract changes.
- Never build SQL with user input; use parameterized `expo-sqlite` APIs and migrations.
- Preserve sync state transitions explicitly: `pending -> syncing -> synced` (or `pending -> failed`). A failed row stays queued for retry.
- Make retries idempotent, bounded, observable, and resumable. Never create a duplicate session because a request timed out — the server keys on `clientId`.

## Audio engine (`TrackPlayerService`)

- Use Expo SDK 57 first-party `expo-audio` (`createAudioPlayer`, `setAudioModeAsync`) for playback, background audio, and lock-screen controls. It replaced `react-native-track-player`, which neither runs in Expo Go nor ships a New-Architecture codegen config for RN 0.86.
- Background playback + lock-screen controls come from the `expo-audio` config plugin (`enableBackgroundPlayback: true`, recording disabled) plus `player.setActiveForLockScreen(...)` at runtime. **Expo Go cannot run the plugin's background `AudioControlsService`**, so `TrackPlayerService` detects Expo Go (`Constants.executionEnvironment`) and skips lock-screen/background calls there — foreground playback is unaffected, but background/lock-screen only work in a development/production build.
- **Never use `setInterval` in the JS thread to track position.** Drive `durationListenedSec` from the player's `playbackStatusUpdate` events (1 s update interval) through the pure `src/lib/sessionTracking` state machine.
- JS status events are not guaranteed while the app is backgrounded, so persist a checkpoint every 10 s and reconcile on resume/launch via `recoverOrphanedSessions()` (finalizes any checkpoint whose session never ended).
- On `play`, end any open session and start a new one with the current position and speed. On `pause`/`stop`/track end, finalize the session with `endPositionSec`, `durationListenedSec`, and `completed`.
- A speed change splits the session; within-session seeks are ignored by the delta rule.

## Local database (`LocalDBService`)

Local schema lives in `expo-sqlite`. Minimum tables: `tracks`, `sessions`, `annotations`, `playlists`, plus `playback_checkpoints` for kill recovery. Every syncable table carries:

- `id` (local temp id), `server_id` (nullable), and `sync_status` (`pending` | `syncing` | `synced` | `failed`).
- Renaming is not identity: match tracks by `content_hash`.
- Store positions/durations as integers (seconds), not floats.

## Sync (`SyncService`)

1. Batch rows where `sync_status = 'pending'`.
2. Call the Lesan `syncLocalData` act with the batch (sessions and annotations keyed by `clientId`).
3. On success, write `server_id`, set `sync_status = 'synced'`.
4. On failure, keep the row `pending` and retry later.

Trigger sync on app start, on returning to the foreground, after each session ends, and on a periodic timer. Never surface sync errors as blocking UI errors; the app must remain fully usable offline.

## API and backend integration

- Send Lesan requests as `POST` bodies shaped `{ model, act, details: { set, get } }`; never invent REST paths.
- The relevant backend acts are `register`, `login`, `getMe`, `registerTrack`, `getMyTracks`, and `syncLocalData` (see `../back/AGENTS.md`).
- Use deep `get` projections to fetch exactly the fields a screen needs (e.g. a track with its recent sessions/annotations).
- Request/response types must come from the generated declarations in `../back/declarations/`; keep the mobile alias pointed at the backend output and update adapters when the generator changes.

## Screens and annotation UX

- **Home / Library** — the user's tracks and playlists, with play count, last listened, and annotation count.
- **Player** — full controls, speed (0.5x–3.0x), sleep timer, and a timeline where every annotation is a colored marker; tapping a marker seeks to it.
- **History** — chronological session list grouped by day.
- **Track Detail** — per-track stats, session timeline, and annotations.
- **Annotation editor** — create/edit a note at a position (text, tags, color).
- **Settings** — account, sync status, storage.

Annotation behavior: long-press (or a quick-add control) creates a note at the current position in one step; markers on the progress bar seek to their position and show the note.

## Testing and validation

- Jest + React Native Testing Library for units. Highest-value tests: `durationListenedSec` calculation, session finalization, checkpoint recovery, sync id mapping, and sync retry/idempotency.
- Test offline → online recovery and the queue's bounded retry behavior.
- Run `npm run lint` after edits and the TypeScript check when applicable.
- Do not claim a feature is complete until its offline, retry, and recovery states have been exercised.

## Development commands

```bash
cd mobile
npm install
npm start            # Expo dev server
npm run android      # build & run on Android device/emulator
npm run lint         # expo lint
```

Do not automatically start a development server, emulator, watcher, build, or other long-running process unless explicitly asked.

## Agent rules

- Inspect the nearby route/component and its existing patterns before editing; prefer the smallest atomic change and avoid unrelated cleanup.
- Remove unused imports, variables, and debug logging introduced by your change.
- Do not commit, reset, or revert user changes unless explicitly requested.
- When unsure, re-read the relevant section of `../docs/` and the root `../AGENTS.md`; do not invent APIs that contradict the backend.
