# Plan — Pejvak Mobile Foundation, Slice 1: Typed Client + Env + Auth

Date: 2026-09-10
Status: Approved by user (client + env + auth first)
Workspace: `mobile/` (Git repo). No Docker. Backend runs manually on `localhost:1405`.

## Goal

Make the app able to **register / login / getMe against the live Lesan backend using types
generated from `back/declarations/`**, with the JWT persisted securely and session restore on
launch. This is the smallest slice that removes the remaining client-contract risk before we
build SQLite, audio, and sync on top of it.

## Verified current state

- `back/declarations/selectInp.ts` exists (generated). It exports:
  - `lesanApi({ URL, settings, baseHeaders })` -> `{ send, setHeaders }` (fetch-based transport),
  - `ReqType` (`main.user.register|login|getMe`, `main.track.registerTrack|getMyTracks|syncLocalData`),
  - `DeepPartial`, per-model `*Schema` / `*Inp` types.
- Backend acts and shapes confirmed from declarations:
  - `user.register` set `{ username, email, password, displayName? }` -> `{ token, user }`
  - `user.login` set `{ email, password }` -> `{ token, user }`
  - `user.getMe` set `{}` -> user projection
  - `track.syncLocalData` set `{ sessions[], annotations[] }` -> `{ syncedSessions, syncedAnnotations }`
- No Docker config anywhere; server started via `deno task start` (port 1405). Not currently listening.
- Mobile scaffold: Expo SDK 57, Expo Router, React 19.2, RN 0.86, strict TS, `@/*` -> `./src/*`.
- Deps now installed (from this session's approved start):
  - runtime: `expo-secure-store`, `expo-sqlite`, `expo-crypto`, `zustand`, `zod` (no TanStack Query — the standard generated `lesanApi` fetch client is used instead)
  - dev: `jest`, `jest-expo`, `@testing-library/react-native`, `@types/jest`
- No `src/services`, `src/store`, `src/lib` yet.

## Decisions

1. **Declaration consumption: copy, don't cross-reference.** `mobile/` is its own git repo and
   `back/` is not, so a tsconfig alias to `../back/declarations` breaks Metro resolution and CI.
   A sync script copies the generated file into the repo. Generated file is never hand-edited.
2. **Source layout stays `src/`** (`src/app|components|services|store|lib`), matching the scaffold
   and `mobile/AGENTS.md`. The root diagram's `mobile/app/` is stale.
3. **No audio deps yet.** `react-native-track-player` needs a dev build/config plugin and is
   deferred to the player slice.
4. **`@/*` alias already covers generated types** (`@/lib/generated/selectInp`), so no extra path.

## Deliverables

### 1. Declaration sync
- `scripts/sync-declarations.mjs` — copies `../back/declarations/selectInp.ts` ->
  `src/lib/generated/selectInp.ts`; fails with a clear message if the source is missing.
- `package.json` script: `"gen:api": "node ./scripts/sync-declarations.mjs"`.
- Run it once; commit `src/lib/generated/selectInp.ts`? -> **No**: keep generated out of git via
  `.gitignore` entry `src/lib/generated/`, and re-run `gen:api` after backend changes.

### 2. Env / config
- `.env` and `.env.example`:
  - `EXPO_PUBLIC_LESAN_URL=http://localhost:1405/lesan`
  - `EXPO_PUBLIC_APP_ENV=development`
- `src/constants/env.ts` — parse `process.env` with zod, export a frozen `env` object.
- `.env` stays untracked; `.env.example` is committed.

### 3. Typed Lesan client (`src/lib/lesan.ts`)
- Wrap the generated `lesanApi`; export `lesanApiClient` bound to `env.lesanUrl`.
- `LesanError` (code, message, cause).
- Typed `request<M extends keyof ..., A ...>()` driven by `ReqType` — no `any` in our code.
- Behaviors:
  - inject `token` header (no `Bearer`), settable/clearable,
  - `AbortController` timeout (default ~15 s),
  - unwrap the `{ success, body }` envelope and throw `LesanError` when `success === false`,
  - translate network/timeout/parse failures into `LesanError`.
- Tests `src/lib/__tests__/lesan.test.ts` (written first, TDD):
  - unwraps `{ success: true, body }`,
  - throws `LesanError` on `{ success: false }`,
  - throws on HTTP/parse failure and on timeout,
  - attaches the `token` header.

### 4. Auth
- `src/services/secureStore.ts` — `getToken` / `setToken` / `clearToken` via `expo-secure-store`.
- `src/services/AuthService.ts` — typed `register`, `login`, `getMe` using the client;
  persists/clears the token.
- `src/store/authStore.ts` — Zustand store: `status` (`loading|authenticated|unauthenticated`),
  `user`, `token`; actions `restore`, `login`, `register`, `logout`.
- Screens: `src/app/(auth)/login.tsx`, `src/app/(auth)/register.tsx` (loading/disabled/error states).
- `src/app/_layout.tsx` — session restore on mount; `<Stack.Protected>` route gate
  (redirect to `(auth)` when unauthenticated, to `(tabs)` when authenticated). No query provider:
  data access is via the typed `lesanApi` client.

### 5. Jest config
- `package.json`: add `"typecheck": "tsc --noEmit"`, `"test": "jest"`.
- `jest` block (or `jest.config.js`): preset `jest-expo`, `moduleNameMapper` for `@/*`,
  `setupFilesAfterEnv`.
- `@types/jest` may need pinning to `^29.5` to match Jest 29 — check `tsc` and pin if it errors.

## Verification (definition of done)

1. `npm run gen:api` produces `src/lib/generated/selectInp.ts`.
2. `npm run lint` passes.
3. `npx tsc --noEmit` (or `npm run typecheck`) passes — no `any` in hand-written code.
4. `npm test` passes (client envelope/error/timeout/header tests).
5. With the backend running (`deno task start` on the user's side): register -> login -> getMe
   succeed from a throwaway `ignore-scripts/`-style smoke (or a temporary test), confirming the
   real envelope shape. Reconcile the client if the server does not return `{ success, body }`.

## Risks / open items

- **Envelope unverified live.** The server was not listening during planning. Confirm the exact
  response shape before finalizing the wrapper; the wrapper design isolates this so only one
  function changes.
- **`@types/jest` v30 vs Jest 29** possible type friction; pin to 29.x if `tsc` complains.
- **Env in Expo**: `EXPO_PUBLIC_*` is inlined at build; document that `.env` changes need a restart.
- **No auto-start of servers**: the backend must be started by the user for the smoke test.

## Next slices (after Slice 1)

1. `LocalDBService` — `expo-sqlite` schema/migrations for `tracks`, `sessions`, `annotations`,
   `playlists`, `playback_checkpoints`; typed DAO; `sync_status` transitions.
2. `TrackPlayerService` — dev build/config plugin, native events, notification controls.
3. `SyncService` — batch pending rows -> `syncLocalData`, temp->server id mapping, triggers.
4. Library scan + `contentHash` (SHA-256 first 1 MB + file size) + `registerTrack`.
5. Player session lifecycle + checkpoints/recovery; then annotations/timeline; then history/stats.
