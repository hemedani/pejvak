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

## Online audio (Discover)

Free audio that lives on someone else's server: browsed by language, streamed, and optionally downloaded. `src/lib/online/` holds the source-agnostic vocabulary and one adapter per provider; `OnlineCatalogService` turns a source's JSON into local rows; `DownloadService` puts a collection on the device.

- **The app fetches media from the source's own API; our backend stores addresses and user state, never bytes.** `manahej.ir` is WordPress + Sonaar Music Player and exposes a real read-only JSON API (`/wp-json/wp/v2/categories`, and `/?load=playlist.json&category=…`), so nothing is scraped from HTML. Adding a provider means one adapter module plus one line in the registry.
- **The Internet Archive is registered as one source per language, not as one source.** `src/lib/online/archive.ts` holds a table of 46 languages and the registry spreads it, so a source's id (`archive-fa`) carries its language and a saved course keeps the language it was found under. `ADAPTER_BUILDERS` therefore takes the **source**, not only its kind: one kind can serve many sources.
- **A language is several facets, not one.** The archive files an item under its English name *or* an ISO 639-2 code, and the sets are disjoint — `Persian` alone matches 91 items where the union matches 2,194, and the most-downloaded Persian item of all is filed only under `per`. `ARCHIVE_LANGUAGES` lists every spelling and the browse query ORs them. Never reduce it to a single name; a one-name query loses ~96% of the content and hides the best of it.
- **`parseArchiveDuration` exists because the archive's `length` is not one unit.** A single item holds `"977.66"` (already seconds) and `"20:45"` (`MM:SS`) side by side, and `MM:SS` is **minutes** — the longest first component observed is 109. Anything unreadable becomes `0` ("ask the player") rather than a guess, because a duration wrong by sixtyfold corrupts every statistic derived from it and nothing downstream can detect it.
- **An archive collection's size is unknown until it is opened.** The search index holds no per-item track count, and the field that looks like one counts every derivative (227 files for a 35-part course), so `listCollections` reports `trackCount: 0` and `OnlineCatalogService` writes the real figure on first open. Browse cards must use `describeKnownTrackCount`, which renders an unknown size as nothing rather than as "0 tracks".
- **The extension decides what is playable, not the `format` label.** One Persian `.mp3` is labelled `Ogg Vorbis`, so `getTracks` filters on `.mp3` and ignores `format`. The browse query does the opposite and filters on the bare token `format:("mp3")`, which matches `VBR MP3` and `128Kbps MP3` alike where naming `VBR MP3` would hide items carrying only another variant.
- **An archive item that is gone answers `200` with `{}`.** There is no 404 to branch on, so "the response carries no file list" is the not-found signal.
- **These stream URLs do not expire**, unlike manahej's signed ones: `/download/<id>/<name>` is a stable redirect. A download from the archive does not have to re-resolve the collection first, and a stored URL is still playable next month.
- **An online item is an ordinary `tracks` row** with `origin = 'online'`; `file_uri` is the stream URL while streaming and the downloaded file afterwards. Nothing downstream needed a second code path: the player, sessions, stretches, runs, stats and annotations all work unchanged.
- **`file_uri` holds a stream URL while streaming, so a byte read of it cannot succeed.** `readAsStringAsync` — and everything built on it, from `inspectAudioFile` to the artwork extractor — is a *file* reader: the native module accepts only `file://`, a SAF `content://` URI, an asset or a null-scheme resource path, and throws `IOException("Unsupported scheme for location …")` for anything else. `isStreamUri` in `src/lib/audioLocation.ts` is the one place that answers "is this a stream?", and every caller must ask it *before* reading rather than learn from a failure — a caller that treats a failed read as retryable retries forever.
- **The artwork backfill excludes streams by filtering, never by stamping.** A streamed row in the worklist is a native call that can only throw, so it spends the pass's limit on rows that can never succeed and holds `countTracksMissingArtwork` above zero forever. `getTracksMissingArtwork` therefore excludes `http(s)` locations in SQL — the same rule as `isStreamUri`, written twice because a `LIKE` clause cannot call a function, and the two must agree. Filtering rather than stamping is what makes it safe: downloading writes a real path into `file_uri` and the row is a candidate again that day, whereas `markTrackArtworkChecked` would record a verdict about a file that does not exist and permanently deny the row the cover that arrives with the download. The loop keeps its own guard as defence — counting `skipped` and deliberately **not** stamping — so a row that becomes a stream mid-pass cannot be mis-stamped.
- **A screen that shows a streamed track must not describe it as a file.** `useAudioInspection` derives "this streams" beside "the file is missing" — both are properties of the row, so neither is state, neither writes state from the effect, and neither touches the filesystem; a streamed row must also not report `loading`, or a spinner turns forever over a track that is working as intended. `buildFileFacts` labels the URL `Stream` rather than `Location` and says "Streamed from its source" instead of the `source === null` default, "Imported file".
- **Identity is the source's own id, never the URL.** `content_hash = sha256("online:<sourceId>:<externalId>")`. These sources hand out signed, expiring URLs, so a hash taken from a URL would split one episode into two rows and its history in half. URLs are a cache: `OnlineCatalogService.resolveStreamUrls` re-resolves them before any (re)download.
- **`ContextType` includes `"online"`.** A streamed collection is a *run* like a folder or a playlist, and `ContextService.resolveQueue` resolves it the same way — including while offline, from the rows already on the device.
- **`folder_key` is written per file, when that file lands.** Never while streaming: an online collection must not appear in the Library's folder list before anything has been downloaded. Per-track "finished / resume at" for a streamed collection is read from `collection_key` via `getCollectionTrackProgress`.
- **Download folder names include the source's id** — `Online/<source>/<sanitised title> (<externalId>)`. Two shows can share a title, and without the id they would write `01 - …` over each other in one directory. Naming is pure and lives in `src/lib/online/naming.ts`.
- **The download queue is rows, not memory.** One `download_jobs` row per track: progress is a `COUNT`, an interrupted run resumes from the first row that is not done, and a kill costs one file. Sequential by design, bounded retries per file, and a file that will not arrive does not fail the course.
- **Stopping a download is not undo; only `deleteDownload` is.** `cancelDownload` keeps what arrived and keeps every row pointing at it, because stopping means "stop spending my data". `deleteDownload` is the mirror of `startDownload` and the only verb that gives the space back — `DownloadControl` offers it in all four of its other states, bordered in the danger colour rather than filled with it, and the screen confirms first because it is the one action there that destroys something the listener waited for.
- **Deleting a download keeps every row and rewinds it to streaming.** `forgetDownloadedTracks` is the exact inverse of `markTrackDownloaded`: `file_uri` returns to `stream_url`, and `download_path`, `downloaded_at`, `file_size_bytes`, `folder_key` and `folder_name` are cleared — the folder key going with the bytes so the folder leaves the Library's Folders view in the same breath, since that view is derived from the column and a folder whose tracks are absent would open onto nothing. The row is what history, statistics, annotations and resume positions hang off, and `content_hash` never changed, so a course finished last year keeps its finished count after the space is reclaimed. `availability` returns to `present`, **not** `missing`: `missing` is the flag that offers a relink, and there is no file left to relink to.
- **Delete the files the rows recorded, never a path recomputed from the title.** The download folder is named after a title the source can edit upstream, so `download_path` is the only reliable record of where the bytes went — and it has to be read *before* the revert, which is what clears it. A delete that rebuilt the path from today's title would remove nothing and leave every byte on the device forever.
- **Aborting is not stopping.** `inFlight.abort()` only asks the current file to give up; the promise it is awaited on has not settled yet, so code that ran straight on could still be overtaken by a `finishTrack` writing afterwards. Anything that must happen strictly *after* the worker is done with a collection awaits `whenIdle()`, which resolves from the queue loop's own `finally`. Without it, a file that lands mid-delete re-marks a row that has just been reverted and points it at a file that is already gone.
- **`finalizeCollection` must write a state, even when there is nothing to finalize.** A collection sitting in `downloading` with zero jobs is reachable two ways — a delete during a download, and a process killed between dropping the queue and recording the state — and both would otherwise be finalized as `complete`, because 0 done of 0 queued is not *incomplete*. It writes `none`. Returning early instead would spin the worker's loop forever on the same row: the loop stops only when the collection leaves `downloading`.
- **`Directory.delete()` and `File.delete()` are synchronous and throw on a missing target.** The per-file pass therefore checks `exists` first, so one file the system has already reclaimed cannot abandon the rest of the collection; and the recursive directory delete is confined to a path strictly below `Paths.document`.
- Downloads are read through `use-online-collection` / `use-online-catalog`, which keep their result **keyed by the collection or source** rather than guarded by a ref — the pattern `useFolderDetail` established, and the one `react-hooks/refs` and `react-hooks/set-state-in-effect` both require.
- **A new route requires regenerating `.expo/types/router.d.ts`.** It is generated, gitignored, and checked against by typed routes, so a route that is missing from it fails `tsc` — and it is only written during dev-server startup (`npx expo start --offline`, then kill it). Without regenerating it, a green typecheck proves nothing about routes.
- **Download state is shown where the listener already looks.** `describeDownloadState` in `src/lib/online` owns the *words* ("Downloaded", "Downloading", "Download failed", "Download paused") and is used by the source listing **and** by the Continue and Favorites cards — three copies of that switch would eventually call `cancelled` something different on one of them. The glyph and the accent colour stay with the component that draws them. A state of `none`, and no collection row at all, print nothing: an undownloaded collection must add no noise to a listing, and a run can outlive the collection row it came from. `downloading` deliberately claims no progress — a card in a list holds no job rows, and fetching them per row is the query-per-row the catalogue hooks exist to avoid.
- **A new `LocalDBService` method must be added to every `jest.mock` factory that lists it.** A factory returns `undefined` for anything unlisted, which TypeScript cannot see; an async method needs `jest.fn(async () => …)`, because the caller attaches `.catch` to the returned value.
- **The saved shelf syncs both ways.** `online_collections` rows travel as a fifth payload in the `syncLocalData` batch, and `pullFromServer` restores them through `reconcileOnlineCollections`. Push alone would make the server a write-only sink: the addresses would be kept there and never come back, so a new phone would show an empty shelf.
- **A local tombstone is never resurrected by a pull.** `softDeleteOnlineCollection` sets `deleted_at` and dirties `sync_status`; the tombstone goes out as `deleted: true`, the server removes its row, and only then is the local row hard-deleted. A removal the listener made is a decision, not a gap.
- **Every listener-state setter dirties `sync_status`** — favourite, download state, and *open*. `last_opened_at` is the field that makes Continue mean anything on a second device, and one small row update inside a batch that is already going out is cheap next to the streaming it accompanies.
- **`insertRemoteOnlineCollection` uses `ON CONFLICT DO NOTHING`, not `INSERT OR REPLACE`.** A replace on a key that turned out to exist would take `download_state` with it — the one column that describes *this* device and that the server has no opinion about.
- **`back/declarations/selectInp.ts` and `src/lib/generated/selectInp.ts` must stay byte-identical.** The mobile copy is vendored, never hand-edited: run the backend against a live MongoDB (`APP_PORT=1406 ~/.deno/bin/deno run --allow-all mod.ts`, then kill it) and copy the file over. It had silently drifted a week behind before anyone noticed, so treat a mismatch as a bug rather than a curiosity.

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
