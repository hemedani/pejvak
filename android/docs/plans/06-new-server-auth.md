# Plan 06 — New server, non-blocking auth, home sign-in button

Sector: `android/`. Brief: [`../prompts/06-new-server-auth.md`](../prompts/06-new-server-auth.md).
Precedence: code > plan > AGENTS.md > docs.

## Goal

Move the app to the new Lesan endpoint, stop hard-gating on auth, and give every listener (registered
or not) a home-screen button that opens a register/login **modal**; on success the device's existing
local data is pushed to the new server so nothing is lost.

## Why the data can be lost silently today

`SyncEngine`/`RoomSyncStore` only read rows where `sync_status IN ('pending','failed')`. A listener
who was logged in on the old server has rows marked `synced`. After pointing at a new, empty server
and signing in, those rows are **never re-sent** — the engine considers them done. There is no stored
server identity to detect the move. So a URL swap alone would strand the owner's history/notes.

Lesan `syncLocalData` is idempotent on `clientId` (unique sparse index), so a one-time re-queue is
safe: to a fresh server the rows insert; to a server that already has them the batch skips them.

## Feature IDs (this round)

| ID | Feature | Status |
| --- | --- | --- |
| SRV-01 | `LESAN_BASE_URL` → `http://46.245.98.207:1405/lesan` (supersedes SY-12 prod value) | ✅ |
| SRV-02 | One-time endpoint re-queue: when the configured base URL changes, flip every `synced` row back to `pending` once, then record the new endpoint | ✅ |
| SRV-03 | Pure predicate `endpointNeedsMigration(stored, current)` (testable) | ✅ |
| AUTH-09 | `AuthGate` is **non-blocking**: always render the app; restore + migration run in the background; a cached/valid token still auto-signs-in and kicks sync | ✅ |
| AUTH-10 | Home-screen auth button in the Library header (`BubbleButton` + attention dot); opens the modal when signed out, the account sheet when signed in | ✅ |
| AUTH-11 | Register/login **modal** (`AuthSheet`, a `GlassSheet` hosting the existing form) — never a full-screen takeover | ✅ |
| AUTH-12 | **Account + sync sheet** (`AccountSheet`): identity, pending queue line, last-synced, *Sync now*, manage-in-Settings, *Sign out* (with confirm) | ✅ |
| AUTH-13 | Pure `accountButtonState(signedIn, pendingTotal)` → icon + attention dot mapping (testable) | ✅ |
| SY-13 | `AuthViewModel` also drives the account surface: pending counts, last-synced, in-flight sync; calls SRV-02 on restore/login/register/sync-now | ✅ |

## Out of scope

- Any `back/` change. The acts, models, relations and sync contract already cover this; the move is
  client-side. (Verified: `register`/`login`/`getMe`/`syncLocalData` exist and are idempotent.)
- `mobile/` (RN) — deprecated, untouched.
- On-device light/dark + gesture verification — **the owner's job**, always.

## Approach

1. **Config** — `build.gradle.kts` `LESAN_BASE_URL`.
2. **Domain (pure)** — `domain/AuthSurface.kt`: `endpointNeedsMigration`, `accountButtonState` +
   `AccountButtonState` enum. JVM tests.
3. **Re-queue** — `requeueSynced()` on TrackDao / SessionDao (sessions + context_plays) /
   AnnotationDao / PlaylistDao / OnlineCollectionDao; `SyncRepository.ensureEndpointMigrated(endpoint)`
   runs them + records the endpoint via `SettingsRepository`. Invoked by `AuthViewModel` on restore
   and after establish/sync.
4. **Non-blocking gate** — `AuthGate` always composes `PejvakNavHost`, passing the shared
   `AuthViewModel` + state; no Loading full-screen, no login takeover.
5. **Modal + sheet** — `AuthScreen` becomes `AuthSheet` (GlassSheet-hosted form). New `AccountSheet`.
   Both hosted as shell-level siblings in `PejvakNavHost` (float over the app, like the AI sheet).
6. **Home button** — `LibraryScreen` gains `onOpenAccount` + `account` icon/attention params;
   rendered in the `GlassHeader` actions slot.
7. **Strings + icons** — new glyphs (`cloud_upload`, `cloud_done`, `person_add`) + `strings.xml`.

## Progress log

_(tick a box + append a row after EVERY small task)_

| Task | Done | Note |
| --- | --- | --- |
| SRV-01 base URL | ✅ | `build.gradle.kts` `LESAN_BASE_URL` → `http://46.245.98.207:1405/lesan`. Kept the `/lesan` suffix (Lesan mounts the API there). Live reachability could not be probed from this box (a local `http_proxy` at 127.0.0.1:7897 intercepts curl and isn't running); on-device login/sync is the owner's. |
| SRV-03 / AUTH-13 domain | ✅ | New `domain/AuthSurface.kt`: `endpointNeedsMigration` (trims + trailing-slash normalises; blank current never migrates; null stored → migrate) + `AccountButtonState`/`accountButtonState`/`glyphKey`/`needsAttention`. `AuthSurfaceTest` (7 cases). |
| SRV-02 re-queue | ✅ | `requeueSynced()` (`synced`→`pending`) on TrackDao, SessionDao, ContextPlayDao, AnnotationDao, PlaylistDao, OnlineCollectionDao. `SyncRepository.ensureEndpointMigrated(endpoint)` runs them once + records `syncEndpoint` via `SettingsRepository`. |
| SY-13 AuthViewModel | ✅ | Added `SyncRepository` dep + `pendingTotal`/`lastSyncAt`/`isSyncing` state; runs migration on `restore` and after `establish`; `syncNow()` does an inline `syncAll` + refresh; `refreshAccount()` re-reads queue/last-sync/cached user. |
| AUTH-09 non-blocking gate | ✅ | `AuthGate` no longer shows a full-screen login or spinner — always renders `PejvakNavHost` with the shared `AuthViewModel` + state. |
| AUTH-11 AuthSheet | ✅ | `AuthScreen` (full-screen) removed; `AuthSheet` hosts the same login/register form in `GlassSheet`, using the **shared** VM instance. |
| AUTH-12 AccountSheet | ✅ | New `AccountSheet`: identity bubble, queued/up-to-date line, last-synced (hidden when never), *Sync now*, manage-in-Settings, *Sign out* + confirm. Empty facts hidden. |
| AUTH-10 home button | ✅ | `LibraryScreen` header gained an account `BubbleButton` (glyph from `accountButtonState`, attention dot, `filled` when it wants a tap) beside Settings. `PejvakNavHost` hosts the two sheets as shell siblings (float over the app, like the AI sheet). |
| Icons + strings | ✅ | Glyphs `cloud_upload`/`cloud_done`/`person_add` added to `ICON_GLYPHS` + pinned in `IconCatalogTest`; new `auth_modal_*`, `home_account_*`, `account_*` strings. |
| Ship gate | ✅ | `assembleDebug` BUILD SUCCESSFUL, **0 Kotlin warnings**; `testDebugUnitTest` 500 tests green. On-device light/dark + live-backend login/sync/move is the owner's. |
