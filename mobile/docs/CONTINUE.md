# CONTINUE — Pejvak

One-page next-task prompt. The authoritative status backlog is `docs/TODO.md`. Product specs are `../docs/DEEPSEEK.md` (models, session math, sync, acceptance), `../docs/GROK.md` (vision, flows, testing), and `../docs/QWEN.md` (Lesan schemas, offline sync, roadmap). Architecture and rules are in `../AGENTS.md`, `../back/AGENTS.md`, and `AGENTS.md`.

---

## Brief history (current state)

- **Specs + rules:** the three AI-generated product descriptions are consolidated in `../docs/`; `../AGENTS.md` fixes the architecture (Deno + Lesan + MongoDB backend, Expo + React Native mobile, future `../web/`), the stack (`expo-audio`, `expo-sqlite`, Zustand, the standard Lesan fetch client), and the non-negotiable domain rules (integer seconds, `contentHash` identity, wall-clock `durationListenedSec`, 10 s checkpoints, append-only sessions, LWW annotations, local-first sync).
- **Backend (`../back/`):** Deno + Lesan scaffold is in place following lesanSatek conventions (`mod.ts`, `models/`, `src/`, `utils/`, `@model`/`@lib`). Five models (User, Track, PlaybackSession, Annotation, Playlist), simple JWT auth (`register`/`login`/`getMe`), track acts (`registerTrack`/`getMyTracks`/`getTrackDetail`), session read acts (`getTrackSessions`/`getMyListeningHistory`, paginated + date-filterable, track embedded), annotation acts (`updateAnnotation`/`deleteAnnotation`/`getMyAnnotations`, LWW + ownership checks), a stats act (`getMyStats`: totals + top tracks via `$facet`), playlist acts (`createPlaylist`/`updatePlaylist`/`deletePlaylist`/`getMyPlaylists`, ownership-checked), and an idempotent `syncLocalData` batch act that inserts sessions by `clientId`/`$inc`s track aggregates and **upserts annotations with last-write-wins, processes delete tombstones, and returns `{clientId, serverId}` mappings**. `deno check mod.ts`, `deno lint`, and `deno fmt --check` all pass. **Ran against MongoDB and generated `../back/declarations/selectInp.ts`; the annotation lifecycle, `getMyAnnotations`, both session read acts, `getTrackDetail`, `getMyStats`, and the playlist CRUD acts were smoke-verified against Mongo. hurl suite not yet executed.**
- **Mobile:** Expo SDK 57 scaffold (`create-expo-app` default template) — Expo Router, React 19.2, RN 0.86, TypeScript strict, source under `src/` with the `@/*` alias. Built: typed Lesan client (`src/lib`, wrapping the generated `lesanApi`), env/config, auth (service, secure token storage, Zustand store, login/register screens with route gating), `LocalDBService` (`expo-sqlite`, versioned schema/migrations), `contentHash` (SHA-256 first 1 MB + size), the pure `sessionTracking` state machine, `syncEngine`/`SyncService`, and the `expo-audio`-based `TrackPlayerService` (background audio, lock-screen controls, 10 s checkpoints, orphan-session recovery) with Library + Player screens. **Annotations:** `AnnotationService` (create/update/delete), `useTrackAnnotations`, colored markers on the player progress bar (tap to seek), a composer anchored at the current position, per-note edit/delete with LWW, and a tappable note list; migration v2 adds the `deleted_at` tombstone column and sync maps server ids back. **History:** a local-first History tab (Library + History native tabs) with day-grouped session cards (`getSessionsForHistory` join, `groupSessionsByDay`, `SessionCard`, `useHistory`). **Track Detail:** `src/app/track/[id].tsx` reached via a Details affordance on each Library row — track header, stats (plays/listened/last played via `computeTrackStats`), session timeline (`SessionCard`), and annotation list (`useTrackDetail`). **Stats:** a Stats tab (Library + History + Stats native tabs) computing totals, sessions, tracks, day streak, most-listened, longest session, recent days, and last played from local sessions (`src/lib/stats.ts` + `StatCell`). **Playlists:** a Playlists tab + `src/app/playlist/[id].tsx` (create/rename/delete, add/remove tracks, up/down reorder, play a track) backed by `PlaylistService` and pure `src/lib/playlists.ts` (local-first; server sync pending). **Sync pull/restore:** `pullFromServer` fetches tracks/sessions/annotations and reconciles them into SQLite by `contentHash`/`clientId` (pure `src/lib/reconcile.ts`), run after auth and on foreground/periodic via `useSyncLifecycle` with exponential backoff (`retryDelayMs`), after pushing pending rows. **Settings + sync status:** `src/app/settings.tsx` (account/sign out, pending-queue counts, last sync, Sync Now, storage usage, theme, default speed) backed by a `settings` table (migration v3), `SettingsService`, `settingsStore` (theme via `Appearance.setColorScheme`), and `useSyncStatus`. Installed: `expo-audio`, `expo-document-picker`, `expo-sqlite`, `expo-secure-store`, `expo-crypto`, `expo-file-system`, `zustand`, `zod`, Jest + RNTL. Device verification in Expo Go is the remaining step.

---

## Next task

**Steps 1–3 are complete: the contract is frozen, the mobile foundation is built, and the vertical slice, annotations, History, Track Detail, Stats, Playlists, sync pull/restore (with backoff), and Settings + sync status are implemented. The next step is verification hardening (hurl suite + mobile integration tests) or the remaining polish (sleep timer, export, accessibility, playlist server sync). Device verification in Expo Go remains the human step.**

The audio engine is decided: **`expo-audio`** (SDK 57 first-party) — it runs in Expo Go and has first-class New-Architecture support, unlike `react-native-track-player`.

### Step 1 — Backend online + contract frozen ✅

1. Add `docker-compose.dev.yml` — **skipped by request; the backend runs locally via `deno task start`.**
2. Run `deno task dev` (or `start`) in `../back/` so `typeGeneration: true` emits `../back/declarations/`.
3. Run `deno task seed`, then `deno task test` (hurl) and confirm the register → login → getMe → registerTrack → getMyTracks → syncLocalData flow is green. *(hurl still pending)*
4. Verify the aggregates: after `syncLocalData`, the track's `totalPlayCount`/`totalListenTimeSec`/`lastPlayedAt` reflect the ingested session, and a replayed batch does not double-insert (`clientId`). *(verified — see below)*
5. Freeze the mobile-relevant contract: act names, `set`/`get` shapes, `token` header, and the `{ success, body }` envelope. Document any deviations from `../back/AGENTS.md`. *(verified)*

### Step 2 — Mobile foundation ✅

1. Install and version-check the stack against Expo SDK 57 docs: `expo-sqlite`, `expo-secure-store`, `expo-crypto`, `zustand`; plus `zod` and Jest + RNTL for tests.
2. Add `src/lib` typed Lesan client wrapping the generated standard `lesanApi` fetch client (act transport, envelope parsing, timeout, `token` header, error translation); run `npm run gen:api` to sync `back/declarations/`.
3. Add config/env loading (`EXPO_PUBLIC_LESAN_URL`, `EXPO_PUBLIC_APP_ENV`).
4. Build `LocalDBService` (`expo-sqlite`) with a versioned schema for `tracks`, `sessions`, `annotations`, `playlists`, and `playback_checkpoints`.
5. Build the auth flow (login/register, secure token storage, session restore).

### Step 3 — First vertical slice (next)

Register one track (hash + metadata) and play it end-to-end: `TrackPlayerService` records a session with correct `durationListenedSec`, checkpoints it, and `SyncService` pushes it through `syncLocalData`. This is the smallest proof that the audio → local DB → sync loop works.

---

## Condensed roadmap (full detail in `TODO.md`)

1. **Backend core completion** — sessions, annotations, playlists acts; track-detail projection; stats.
2. **Mobile foundation** — client, env, local DB, auth.
3. **Library + registration** — device scan, `contentHash`, metadata, `registerTrack`.
4. **Player + sessions** — event-driven tracking, delta duration, checkpoints/recovery, background/lock-screen.
5. **Annotations + timeline** — create/edit/delete, progress-bar markers, jump-to-annotation, offline temp-id mapping.
6. **History + stats + playlists.**
7. **Sync robustness** — bounded retries, id mapping, LWW, offline recovery.
8. **Polish** — settings, export, lock-screen/Android Auto, accessibility.

## Outstanding verification

- [ ] Backend hurl suite green against a real MongoDB.
- [x] `../back/declarations/` generated and consumed by mobile types (`npm run gen:api`).
- [x] Contract smoke-verified live: `register → login → getMe → registerTrack → syncLocalData`; replayed batch is idempotent (`syncedSessions: 0`) and aggregates are not double-counted.
- [x] Annotation lifecycle smoke-verified against Mongo: create returns `{clientId, serverId}`, replay is idempotent, newer `updatedAt` wins / older is ignored (LWW), `updateAnnotation` act updates, and both `syncLocalData` tombstones and `deleteAnnotation` remove the row.
- [x] Session read acts smoke-verified against Mongo: `getMyListeningHistory` returns sessions newest-first with the track embedded and filters by `from`/`to`; `getTrackSessions` scopes to an owned track.
- [x] `getTrackDetail` smoke-verified against Mongo: returns the track with embedded sessions + annotations, and a different user receives `null`.
- [x] `getMyStats` smoke-verified against Mongo: totals (listen time/session/track counts) and top tracks sorted by listen time.
- [x] Playlist acts smoke-verified against Mongo: create, update (rename + items), getMyPlaylists, delete, and ownership isolation (other users cannot update).
- [x] `getMyAnnotations` smoke-verified against Mongo: returns `clientId`, position, text, tags, `updatedAt`, and the parent track's `contentHash` (for pull reconciliation).
- [x] Settings + sync-status surface implemented (pending counts, last sync, Sync Now, theme, default speed); device verification pending.
- [x] Mobile unit tests for `durationListenedSec` and session transitions.
- [ ] Mobile unit tests for sync retry/idempotency and checkpoint recovery at the integration level (unit-level coverage exists; 138 passing).
- [ ] Offline → online sync recovery with no duplicate rows (device).
- [ ] App-kill mid-session loses no data (checkpoint recovery).

## Exit criteria (this session)

- Backend runs against MongoDB; `deno task test` passes; `../back/declarations/` generated.
- The mobile stack is installed and SDK-57-compatible; `npm run lint` and typecheck pass.
- The typed Lesan client, `LocalDBService`, and auth flow exist and are wired to the backend contract.
- One track registered and one session synced end-to-end, verified.
- Results recorded in `TODO.md` statuses.

## Open decisions (do not silently assume)

- Multi-device annotations: LWW editing vs. append-only for v1.
- Server file storage: metadata only vs. S3/MinIO.
- Playback-rate change mid-session: new session (current assumption) vs. separate event.
- Annotation play-count granularity.
- Offline annotation temp→server id mapping.
- Whether `registerTrack` is metadata-only or expects an uploaded file.

## Working rules

- Follow `../AGENTS.md` first, then `../back/AGENTS.md` / `AGENTS.md`. Where `../docs/` conflict, `../AGENTS.md` wins.
- Read the exact Expo SDK 57 docs (https://docs.expo.dev/versions/v57.0.0/) before adding native/Expo APIs; confirm package versions before installing.
- Strict TypeScript, no `any`; consume generated Lesan types end-to-end.
- Local-first: every write goes to SQLite before the network; never block the UI on a call.
- Integer seconds everywhere; identify tracks by `contentHash`; never recompute `durationListenedSec` from position deltas.
- Do not auto-start dev servers, emulators, watchers, or builds unless explicitly asked.
- Do not commit/reset/revert user changes unless explicitly asked. Backend commits (when asked): Conventional Commits + Gitmoji; never `git reset`.
