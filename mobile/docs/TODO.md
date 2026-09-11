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
- [x] Backend run against MongoDB; `../back/declarations/selectInp.ts` generated and consumed by mobile (`npm run gen:api`). Hurl suite still to be executed.
- [-] Docker intentionally skipped (local Mongo). Built: typed Lesan client (`src/lib`), `LocalDBService` (schema/migrations/DAO), auth store/screens, `contentHash`, `sessionTracking`, `SyncService`, and an `expo-audio` `TrackPlayerService` with Library + Player screens. Not wired yet: sync triggers on app-lifecycle are in place, but device-level verification and background reconciliation remain.

---

## 1. Monorepo, tooling, and contracts

- [ ] Add `docker-compose.dev.yml` (MongoDB 7 + backend, hot reload) and `docker-compose.yml` (production).
- [ ] Add env examples: `../back/.env.example` (`MONGO_URI`, `DB_NAME`, `APP_PORT`, `ENV`, `TOKEN_KEY`) and `.env.example` (`EXPO_PUBLIC_LESAN_URL`, `EXPO_PUBLIC_APP_ENV`).
- [x] Generate `../back/declarations/` (`typeGeneration: true`) by starting the server against Mongo; keep it out of git.
- [x] Consume `../back/declarations/` types in mobile via the generated `lesanApi` + `ReqType` wrapper; `npm run gen:api` syncs the copy into `src/lib/generated/` (gitignored).
- [ ] Extend `deno task seed` into a reusable dataset (users, tracks, sessions, annotations).
- [ ] Add a root-level check entrypoint that runs backend `deno check/lint/fmt` and mobile `npm run lint` + typecheck.
- [ ] Decide the read-only vs. writable contract for `Track` aggregation fields (`totalPlayCount`, `totalListenTimeSec`, `lastPlayedAt`) — server-written only. `[?]`

## 2. Backend core (`../back/`)

- [x] 5 core models with integer-second positions and content-hash identity.
- [x] Auth acts: `register`, `login`, `getMe` (JWT in `token` header).
- [x] Track acts: `registerTrack`, `getMyTracks`.
- [x] `syncLocalData` batch ingest of offline sessions + annotations with `$inc` aggregates and `clientId` idempotency. Annotations now **upsert with last-write-wins** (`updatedAt`), process `deleted` tombstones, and return `{ clientId, serverId }` mappings.
- [x] Session acts: `getTrackSessions` and `getMyListeningHistory` (paginated, date-filterable via `from`/`to`, `startedAt` desc, embedded track).
- [-] Annotation acts: `updateAnnotation` + `deleteAnnotation` (ownership-checked, LWW) shipped under `src/annotations/`; `createAnnotation`/`getTrackAnnotations` still pending (create/update/delete now flow through `syncLocalData`).
- [ ] Playlist acts: CRUD, `addToPlaylist`, `reorder`.
- [x] A track-detail act (`getTrackDetail`) returning a Track with embedded recent sessions and annotations (deep `relatedRelations` projection, bounded by the model limits), ownership-checked.
- [ ] Link annotations to their server session (`session` relation) during sync via `sessionClientId`.
- [ ] Compute `timesPlayedBefore` when an annotation is created; compute/refresh annotation play counts from session ranges.
- [x] Stats aggregations (`getMyStats`): total listened time, session/track counts, first/last listened, and top tracks by time (day buckets/streaks computed client-side).
- [ ] Run `http/e2e.hurl` against Mongo; add hurl coverage for every new act.
- [ ] Add regression tests for aggregate increments, sync idempotency (replayed batch), and projection correctness.
- [ ] Document backend open questions as product decisions when settled (see "Open decisions").

## 3. Mobile foundation

- [x] Install and lock the stack: `expo-audio`, `expo-document-picker`, `expo-sqlite`, `expo-secure-store`, `expo-crypto`, `expo-file-system`, `zustand`, `zod`, Jest + React Native Testing Library. Confirmed against Expo SDK 57 docs. (`nativewind` deferred to a UI-polish slice.)
- [x] Decide the final source layout (`src/app|components|services|store|lib` vs. root `app/`) and record it in `AGENTS.md`. Decided: **`src/` with the `@/*` alias**.
- [x] Build the typed Lesan client in `src/lib`: wraps the generated standard `lesanApi` fetch client (`back/declarations/selectInp.ts`), typed act transport `{ model, act, details: { set, get } }`, `{ success, body }` envelope parsing, timeout, `token` header, error translation. `npm run gen:api` syncs declarations.
- [x] Add environment/config loading (`src/constants/env.ts`, `EXPO_PUBLIC_LESAN_URL`/`EXPO_PUBLIC_APP_ENV` with zod) and dev-only error logging that never prints tokens.
- [x] Auth flow: login/register screens with loading/disabled/error states, secure token storage (`expo-secure-store`, with a web fallback), session restore on launch, and route gating.
- [-] App shell and routing: Library+History+Stats tabs, Annotation editor on Player, and Track Detail done; Settings pending.
- [x] `LocalDBService` (`expo-sqlite`): versioned schema/migrations (`PRAGMA user_version`) for `tracks`, `sessions`, `annotations`, `playlists`, `playback_checkpoints`; typed DAO with parameterized queries and `sync_status` transitions; checkpoint upsert + orphan-recovery query.
- [-] `SyncService`: engine + wiring built — pending tracks via `registerTrack`, finalized sessions/annotations batched to `syncLocalData`, `pending -> syncing -> synced/failed`. Triggers (start/foreground/session-end/timer) not wired yet.
- [x] `TrackPlayerService` (SDK 57 `expo-audio`): background playback + lock-screen via config plugin, `playbackStatusUpdate`-driven session tracking, 10 s checkpoints, orphan-session recovery.

## 4. Library and track registration

- [-] Scan device audio (folder picker / media library). Current: single-file import via `expo-document-picker` (copy to cache); folder/bulk scan still pending.
- [x] Compute `contentHash` = SHA-256 of first 1 MB + file size (`src/lib/contentHash.ts` + `ContentHashService`); never dedupe by filename/path.
- [-] Extract metadata (title, author, narrator, duration, artwork, mime) and cache locally. Current: title from filename, size/mime from the picker; duration captured from playback, embedded tags not parsed.
- [x] Register each track via `registerTrack` (through `SyncService`); persist the returned `server_id` locally.
- [ ] Match an existing server track by `contentHash` on other devices so history/annotations follow the file.
- [-] Library list UI with play count and last listened. Annotation count still pending.

## 5. Player and session recording

- [-] Session lifecycle: start on play, finalize on pause/stop/track-end; new session on speed change (implemented). Cross-boundary seek still starts a session split only if the delta rule flags a seek — explicit boundary handling pending.
- [x] `durationListenedSec` from progress deltas: add only when `0 < delta < 5`; ignore seeks (`delta > 5` or `delta < 0`). Implemented in `sessionTracking` and driven by `expo-audio` status events.
- [x] Persist a checkpoint every 10 s; recover an orphaned checkpoint on launch (`endedAt = checkpoint.timestamp`) via `recoverOrphanedSessions()`.
- [x] Record `playbackSpeed`, `completed`, `interrupted` per session (`deviceInfo` still null until device metadata is added).
- [ ] Reposition on launch to the last position; "continue listening".
- [-] Playback controls: play/pause, seek ±30 s, speed 0.5x–3.0x. Sleep timer pending.
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
- [ ] Export a book's annotations as Markdown (PDF stretch).

## 7. History, stats, and playlists

- [x] Global History screen grouped by day + per-track session timeline and stats on Track Detail (local-first).
- [-] Session cards: start/end time, actual listened time, speed, completed/interrupted done; explicit position range pending.
- [x] Stats dashboard tab: total hours, sessions, tracks, day streak, most-listened, longest session, recent days, last played (local-first).
- [ ] Playlist CRUD with drag-reorder (`items[].order`).
- [ ] Smart playlists: Unfinished, Annotated, Listened > 3 times (stretch).

## 8. Sync robustness

- [ ] Batch pending sessions/annotations, bounded retries with backoff, connectivity triggers.
- [x] Idempotent re-sync (server keys on `clientId`); annotation upserts return the same `serverId` on replay, so a timeout never duplicates or resets local state.
- [-] Temp-id → server-id mapping: tracks (register) and annotations (syncLocalData mapping) done; sessions are append-only and need no mapping.
- [x] Conflict handling: sessions append-only; annotation edits LWW (server compares `updatedAt`); deletes are tombstoned and acknowledged.
- [ ] Sync status surface (queue counts, last successful sync, "Sync Now"); never block UI on sync errors.
- [ ] Tests: offline→online recovery, airplane mode, interrupted upload, app kill mid-sync.

## 9. Polish

- [ ] Settings: account, storage management, sync status, theme (system/dark/light), default speed, sleep timer default.
- [ ] Lock-screen / Android Auto refinements.
- [ ] Export history and annotations.
- [ ] Accessibility (touch targets, contrast), list virtualization, startup performance.
- [ ] Respect reduced motion and avoid battery-heavy background loops.

## 10. Testing and verification

- [ ] Backend: hurl e2e for every act; regression tests for sync/aggregates.
- [-] Mobile unit tests (Jest + RNTL): client envelope/error/timeout, DB migrations/mappers, `contentHash`, `sessionTracking`/`syncEngine` (incl. id mapping + tombstone removal), annotation marker math/color/clock, `AnnotationService` create/update/delete, history grouping/formatting, `trackStats`/`stats`, and the `useTrackAnnotations`/`useHistory`/`useTrackDetail` hooks covered (90 passing); sync retry/idempotency and checkpoint recovery at the integration level still to come.
- [ ] Persistence tests: draft/session recovery after process termination.
- [ ] Offline + reinstall survival: after login, history and annotations restore from the server.
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
- [-] Sessions + annotations acts exposed (done); playlists acts still pending before the matching mobile screens can persist to the server.
- [ ] Confirmed `syncLocalData` validation/limits (batch size, unknown-hash handling) documented for the mobile SyncService.
- [ ] Auth contract (token header, envelope, expiry/refresh) pinned and covered by hurl.

## Out of scope for v1 (from `../docs/GROK.md` §8)

- AI-generated chapter summaries from annotations.
- Collaborative/shared annotations.
- Web player (`../web/`) reusing the same Lesan backend.
- Voice notes as annotations; automatic highlight detection.
- Media-source integrations (Audiobookshelf / Plex / Emby).
