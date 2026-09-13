# TODO — Pejvak

Implementation backlog for the Pejvak monorepo: an offline-first **Android audio player** for audiobooks, long-form content, and music, with an exhaustive **playback-session history** and **timestamped annotations**, backed by a Lesan API.

This backlog is derived from:

- `../docs/DEEPSEEK.md` — data models, session math, sync engine, acceptance criteria.
- `../docs/GROK.md` — product vision, features/user flows, testing priorities.
- `../docs/QWEN.md` — Lesan schema examples, offline sync strategy, phased roadmap.
- `../AGENTS.md` — architecture, stack, domain rules, roadmap (authoritative where docs conflict).
- `docs/CONTINUE.md` — the one-page next-task prompt.
- `AGENTS.md` and `../back/AGENTS.md` — per-workspace implementation rules.

## Status legend

- `[ ]` not started
- `[-]` in progress or blocked
- `[x]` verified complete
- `[?]` requires a product/technical decision

## 0. Current state (verified)

- [x] Product specs captured in `../docs/` and synthesized into `../AGENTS.md`.
- [x] `../back/` scaffold (Deno + Lesan): `mod.ts`, `models/` (User, Track, PlaybackSession, Annotation, Playlist), `utils/`, `src/` acts (`auth`: register/login/getMe; `tracks`: registerTrack/getMyTracks; `sync`: syncLocalData), `http/e2e.hurl`, `Dockerfile`.
- [x] Backend static checks green: `deno check mod.ts`, `deno lint`, `deno fmt --check`.
- [x] Mobile scaffold: Expo SDK 57, Expo Router, React 19.2, RN 0.86, TypeScript strict (`src/app`, `@/*` alias).
- [x] `AGENTS.md` and `docs/` created.
- [x] Backend run against MongoDB; `../back/declarations/selectInp.ts` generated and consumed by mobile (`npm run gen:api`). Hurl suite green (36 requests, all 17 acts).
- [-] Docker intentionally skipped (local Mongo). Built: typed Lesan client (`src/lib`), `LocalDBService` (schema/migrations/DAO), auth store/screens, `contentHash`, `sessionTracking`, `SyncService`, and an `expo-audio` `TrackPlayerService` with Library + Player screens. Sync triggers are wired (launch/foreground/timer/session-end); device-level verification and background reconciliation remain.

---

## 1. Monorepo, tooling, and contracts

- [ ] Add `docker-compose.dev.yml` (MongoDB 7 + backend, hot reload) and `docker-compose.yml` (production).
- [x] Env examples: `../back/.env.example` (`MONGO_URI`, `DB_NAME`, `APP_PORT`, `ENV`, `TOKEN_KEY`) and `mobile/.env.example` (`EXPO_PUBLIC_LESAN_URL`, `EXPO_PUBLIC_APP_ENV`).
- [x] Generate `../back/declarations/` (`typeGeneration: true`) by starting the server against Mongo; keep it out of git.
- [x] Consume `../back/declarations/` types in mobile via the generated `lesanApi` + `ReqType` wrapper; `npm run gen:api` syncs the copy into `src/lib/generated/` (gitignored).
- [x] `deno task seed` builds a reusable, idempotent dataset: demo user, three tracks, sessions (with aggregate `$inc`), annotations, and a playlist — all keyed by `contentHash`/`clientId` so re-runs are safe.
- [x] Root-level check entrypoint `./check.sh` runs backend `deno check/lint/fmt` then mobile `npm run lint` + typecheck.
- [ ] Decide the read-only vs. writable contract for `Track` aggregation fields (`totalPlayCount`, `totalListenTimeSec`, `lastPlayedAt`) — server-written only. `[?]`

## 2. Backend core (`../back/`)

- [x] 5 core models with integer-second positions and content-hash identity.
- [x] Auth acts: `register`, `login`, `getMe` (JWT in `token` header).
- [x] Track acts: `registerTrack`, `getMyTracks`. `registerTrack` is idempotent by `(user, contentHash)`: re-registering the same file returns the existing track so a second device joins the same history instead of splitting it.
- [x] `syncLocalData` batch ingest of offline sessions + annotations with `$inc` aggregates and `clientId` idempotency. Annotations **upsert with last-write-wins** (`updatedAt`), process `deleted` tombstones, and return `{ clientId, serverId }` mappings. **Playlists sync too**: keyed by `clientId`, items resolved from `contentHash` to this user's server track ids, LWW on `updatedAt`, `deleted` tombstones, returning `{ clientId, serverId }`. All request/response fields are optional so a client may send any subset of the batch.
- [x] Session acts: `getTrackSessions` and `getMyListeningHistory` (paginated, date-filterable via `from`/`to`, `startedAt` desc, embedded track).
- [-] Annotation acts: `updateAnnotation` + `deleteAnnotation` (ownership-checked, LWW) and `getMyAnnotations` (paginated pull) shipped under `src/annotations/`; `createAnnotation`/`getTrackAnnotations` still pending (create/update/delete flow through `syncLocalData`).
- [x] Playlist acts: `createPlaylist`, `updatePlaylist` (title/description/isPublic + full `items`, so add/remove/reorder), `deletePlaylist`, `getMyPlaylists` — ownership-checked. (No `addToPlaylist`/`reorder` micro-acts; those go through `updatePlaylist`.) The Playlist model now carries `clientId` (indexed) for idempotent offline upserts.
- [x] A track-detail act (`getTrackDetail`) returning a Track with embedded recent sessions and annotations (deep `relatedRelations` projection, bounded by the model limits), ownership-checked.
- [ ] Link annotations to their server session (`session` relation) during sync via `sessionClientId`.
- [ ] Compute `timesPlayedBefore` when an annotation is created; compute/refresh annotation play counts from session ranges.
- [x] Stats aggregations (`getMyStats`): total listened time, session/track counts, first/last listened, and top tracks by time (day buckets/streaks computed client-side).
- [x] `http/e2e.hurl` runs green against local Mongo (36 requests, all 17 acts) via `deno task test`; `{{unique}}` makes each run re-runnable.
- [x] Hurl asserts idempotent `registerTrack` (same `contentHash` → same `_id`), aggregate increments (`totalPlayCount`/`totalListenTimeSec` after `syncLocalData`), replayed-batch idempotency (session `syncedSessions == 0`, annotation/playlist return the same `serverId`), playlist item contentHash→server-track resolution, playlist LWW + tombstone delete, and ownership isolation (`getTrackDetail == null` for another user).
- [ ] Document backend open questions as product decisions when settled (see "Open decisions").

## 3. Mobile foundation

- [x] Install and lock the stack: `expo-audio`, `expo-document-picker`, `expo-network`, `expo-sqlite`, `expo-secure-store`, `expo-crypto`, `expo-file-system`, `zustand`, `zod`, Jest + React Native Testing Library. Confirmed against Expo SDK 57 docs. (`nativewind` deferred to a UI-polish slice.)
- [x] Decide the final source layout (`src/app|components|services|store|lib` vs. root `app/`) and record it in `AGENTS.md`. Decided: **`src/` with the `@/*` alias**.
- [x] Build the typed Lesan client in `src/lib`: wraps the generated standard `lesanApi` fetch client (`back/declarations/selectInp.ts`), typed act transport `{ model, act, details: { set, get } }`, `{ success, body }` envelope parsing, timeout, `token` header, error translation. `npm run gen:api` syncs declarations.
- [x] Add environment/config loading (`src/constants/env.ts`, `EXPO_PUBLIC_LESAN_URL`/`EXPO_PUBLIC_APP_ENV` with zod) and dev-only error logging that never prints tokens.
- [x] Auth flow: login/register screens with loading/disabled/error states, secure token storage (`expo-secure-store`, with a web fallback), session restore on launch, and route gating.
- [x] App shell and routing: Library+History+Stats+Playlists tabs, Annotation editor on Player, Track Detail, Playlist Detail, and Settings done.
- [x] `LocalDBService` (`expo-sqlite`): versioned schema/migrations (`PRAGMA user_version`) for `tracks`, `sessions`, `annotations`, `playlists`, `playback_checkpoints`; typed DAO with parameterized queries and `sync_status` transitions; checkpoint upsert + orphan-recovery query.
- [x] `SyncService`: engine + wiring built — pending tracks via `registerTrack`, finalized sessions/annotations/playlists batched to `syncLocalData`, `pending -> syncing -> synced/failed` (playlist tombstones hard-removed on ack). Triggers wired: launch + foreground + timer with exponential backoff (`useSyncLifecycle`) and after each finalized session (`TrackPlayerService.finishSession`).
- [x] `TrackPlayerService` (SDK 57 `expo-audio`): background playback + lock-screen via config plugin, `playbackStatusUpdate`-driven session tracking, 10 s checkpoints, orphan-session recovery.

## 4. Library and track registration

- [-] Scan device audio (folder picker / media library). Current: single/multi-file import via `expo-document-picker` (`multiple: true`, copy to app storage); folder (SAF) and media-library scan still pending.
- [x] Compute `contentHash` = SHA-256 of first 1 MB + file size (`src/lib/contentHash.ts` + `ContentHashService`); never dedupe by filename/path.
- [-] Extract metadata (title, author, narrator, duration, artwork, mime) and cache locally. Current: title from filename, size/mime from the picker; duration captured from playback, embedded tags not parsed.
- [x] Register each track via `registerTrack` (through `SyncService`); persist the returned `server_id` locally.
- [x] Match an existing server track by `contentHash` on other devices: `registerTrack` upserts by `(user, contentHash)` and `pullFromServer`/`reconcileTracks` backfill the server id, so history and annotations follow the file.
- [x] Library list UI with play count, note count (`getAnnotationCounts`), and last listened.

## 5. Player and session recording

- [-] Session lifecycle: start on play, finalize on pause/stop/track-end; new session on speed change (implemented). Cross-boundary seek still starts a session split only if the delta rule flags a seek — explicit boundary handling pending.
- [x] `durationListenedSec` from progress deltas: add only when `0 < delta < 5`; ignore seeks (`delta > 5` or `delta < 0`). Implemented in `sessionTracking` and driven by `expo-audio` status events.
- [x] Persist a checkpoint every 10 s; recover an orphaned checkpoint on launch (`endedAt = checkpoint.timestamp`) via `recoverOrphanedSessions()`.
- [x] Record `playbackSpeed`, `completed`, `interrupted` per session (`deviceInfo` still null until device metadata is added).
- [x] Reposition on launch to the last position; "continue listening" — `resumePositionSec` derives the resume point from the most recent finished session and the player loads there (completed tracks restart at 0).
- [x] Playback controls: play/pause, seek ±30 s, speed 0.5x–3.0x, and a sleep timer (5/15/30/45/60 min via `useSleepTimer`, pauses playback at the deadline; foreground-only timer).
- [x] Background playback and lock-screen media controls via the `expo-audio` config plugin + `setActiveForLockScreen`. Android Auto refinements pending.
- [ ] End-to-end device test of kill/restart with no session loss.

## 6. Annotations and timeline

- [x] Create an annotation at the current position (one-tap quick add): “+ Note” opens a composer anchored at the live position; `AnnotationService` rounds to integer seconds, trims text, and assigns a palette color.
- [x] Edit/delete annotations; last-write-wins on `updatedAt` (backend upsert compares timestamps; dedicated `updateAnnotation`/`deleteAnnotation` acts).
- [x] Render annotation markers (colored by `color`/tags) on the player progress bar; tap to seek and show the note (selected card + highlighted list row).
- [x] Annotation list on the Player and on Track Detail (sorted by `positionSec`).
- [x] Offline annotation create/update/delete with a `clientId`; server id mapped back after sync and acknowledged deletes hard-removed (tombstone queue).
- [-] `timesPlayedBefore` snapshot stored at creation (approximate: count of finalized local sessions); server-range computation and play-count display pending.
- [-] Annotation editor: text composer built; tags, color picker pending.
- [x] Export a book's annotations as Markdown (`annotationsToMarkdown` + native share sheet from Track Detail). PDF remains a stretch.

## 7. History, stats, and playlists

- [x] Global History screen grouped by day + per-track session timeline and stats on Track Detail (local-first).
- [x] Session cards: start/end time, explicit in-track position range (`formatPositionRange`), actual listened time, speed, completed/interrupted.
- [x] Stats dashboard tab: total hours, sessions, tracks, day streak, most-listened, longest session, recent days, last played (local-first).
- [-] Playlist CRUD with reorder (`items[].order`): create/rename/delete, add/remove tracks, up/down reorder, and play a track done. **Playlist server sync done**: `clientId` idempotency, contentHash→server-track item mapping, LWW, delete tombstones, and pull reconcile (`reconcilePlaylists`). Remaining: drag-reorder (up/down buttons exist).
- [ ] Smart playlists: Unfinished, Annotated, Listened > 3 times (stretch).

## 8. Sync robustness

- [x] Batch pending tracks/sessions/annotations/playlists; bounded retries with exponential backoff; triggers on launch, foreground, timer, session-end, and **connectivity regain** (`expo-network` `addNetworkStateListener` in `useSyncLifecycle`).
- [x] Idempotent re-sync (server keys on `clientId`); annotation upserts return the same `serverId` on replay, so a timeout never duplicates or resets local state.
- [x] Temp-id → server-id mapping: tracks/annotations/sessions backfill `server_id` on push and pull; server pulls are deduped by `contentHash`/`clientId`.
- [x] Conflict handling: sessions append-only; annotation edits LWW (server compares `updatedAt`); deletes are tombstoned and acknowledged.
- [x] Sync status surface (queue counts per table, last successful sync, "Sync Now"); sync errors never block the UI.
- [ ] Tests: offline→online recovery, airplane mode, interrupted upload, app kill mid-sync.

## 9. Polish

- [-] Settings: account + sign out, storage usage (read-only), sync status, theme (system/light/dark via `Appearance`), and default playback speed done; the sleep timer now lives on the Player; storage management still pending.
- [ ] Lock-screen / Android Auto refinements.
- [x] Export annotations (Markdown from Track Detail) and listening history (Markdown from the History tab) via the native share sheet.
- [-] Accessibility: primary controls have labels and ≥44pt targets (Player speed/sleep/note, seek, play/pause; Library/History actions); full contrast/virtualization/startup audit and device verification remain.
- [ ] Respect reduced motion and avoid battery-heavy background loops.

## 10. Testing and verification

- [x] Backend: hurl e2e for every act (36 requests, 17 acts) plus idempotent-register/aggregate/idempotency/LWW/ownership assertions.
- [x] Mobile integration tests: `SyncService` glue end-to-end (idempotent retry with stable `clientId`s, tombstone hard-removal, playlist push with contentHash item mapping, pull/push, `syncAll` timestamp), checkpoint-orphan recovery, `reconcilePlaylists`, `useSyncLifecycle` reconnect trigger, and the pure `sleepTimer`/`resume`/`exportAnnotations`/`exportHistory`/`formatPositionRange` helpers — **182 passing**.
- [-] Mobile unit tests (Jest + RNTL): client envelope/error/timeout, DB migrations/mappers, `contentHash`, `sessionTracking`/`syncEngine` (incl. id mapping + tombstone removal), the pull reconciler + `retryDelayMs`, annotation marker math/color/clock, `AnnotationService` create/update/delete, history grouping/formatting, `trackStats`/`stats`, `settings` helpers/`SettingsService`, `playlists` helpers, `PlaylistService`, and the hook suites; device-level offline/kill scenarios remain.
- [ ] Persistence tests: draft/session recovery after process termination.
- [x] Offline + reinstall survival: after login the app pulls tracks/sessions/annotations and reconciles by `contentHash`/`clientId` (`pullFromServer`); device verification pending.
- [ ] `deno check/lint/fmt` (backend) and `npm run lint` + typecheck (mobile) green before each checkpoint.

## Acceptance criteria (from `../docs/DEEPSEEK.md` §10)

- [ ] Sign up, log in, and see the library.
- [ ] Register an audio file and play it with background playback.
- [ ] Every session records `startedAt`, `endedAt`, `startPositionSec`, `endPositionSec`, `durationListenedSec`.
- [x] Chronological session history per track (Track Detail session timeline; global History grouped by day).
- [ ] `totalPlayCount` and `totalListenTimeSec` update after each session.
- [x] Create an annotation at any position with `positionSec`, `createdAt`, `text`.
- [x] Annotations appear as markers on the progress bar (tap to seek/show; edit/delete from the selected note).
- [x] See how many times a track was played and when it was last played (Library shows play count + last played).
- [ ] All data stored locally first and synced to the Lesan backend.
- [ ] App works fully offline; sync resumes on reconnect.
- [ ] Backend hurl tests for all acts; mobile unit tests for audio and sync engines.

## Open decisions

- [x] **Audio engine:** decided — Expo SDK 57 first-party `expo-audio` (runs in Expo Go, first-class New-Arch support, background + lock-screen via config plugin). `react-native-track-player` rejected (no Expo Go, no New-Arch `codegenConfig`).
- [x] Multi-device annotations: editable with last-write-wins on `updatedAt` (server upsert/act compares timestamps).
- [?] Server file storage: metadata only, or audio files in S3/MinIO?
- [?] Playback-rate change mid-session: split into a new session (current assumption) or record a separate event?
- [?] Annotation play-count granularity: count only sessions whose range includes the position, or also manual seeks?
- [x] Offline annotation temp-ID mapping: local `clientId` returned with the server `_id` by `syncLocalData`; deletes tombstoned and pushed by `clientId`.
- [?] Does the backend accept `registerTrack` before the file is uploaded, or is registration metadata-only? (Current model: metadata + hash.)

## Backend dependencies (blockers for the mobile backlog)

- [x] MongoDB available (local, no Docker) and `../back/declarations/` generated.
- [x] Sessions, annotations, and playlists acts exposed, with playlist sync/mapping wired through `syncLocalData`.
- [ ] Confirmed `syncLocalData` validation/limits (batch size, unknown-hash handling) documented for the mobile SyncService.
- [ ] Auth contract (token header, envelope, expiry/refresh) pinned and covered by hurl.

## Out of scope for v1 (from `../docs/GROK.md` §8)

- AI-generated chapter summaries from annotations.
- Collaborative/shared annotations.
- Web player (`../web/`) reusing the same Lesan backend.
- Voice notes as annotations; automatic highlight detection.
- Media-source integrations (Audiobookshelf / Plex / Emby).
