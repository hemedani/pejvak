# AGENTS.md — Pejvak

Agent rules and conventions for the **Pejvak** project. Read this before writing any code.

Pejvak is an offline-first **Android audio player** for audiobooks, long-form content, and music. Its differentiators are an **exhaustive, queryable playback history** (every play/pause/seek/complete session is recorded) and **timestamped annotations** that sync across devices. Full product specs live in `docs/` — see [Reference Specs](#reference-specs).

---

## Architecture

Three-tier, offline-first monorepo. `mobile/` and `back/` are independent projects; a future `web/` reuses the same generated Lesan client types.

```
Pejvak/
├── back/                    # Deno + Lesan + MongoDB
│   ├── mod.ts               # Entry point: lesan(), setDb, register models, runServer
│   ├── models/              # Lesan models (one file per model)
│   ├── src/                 # Lesan API acts (one folder per domain)
│   ├── utils/               # JWT, validation, shared helpers
│   └── declarations/        # Auto-generated TS declarations (typeGeneration: true)
├── mobile/                  # React Native (Expo)
│   ├── app/                 # Expo Router screens
│   ├── components/          # Reusable UI components
│   ├── services/            # TrackPlayerService, LocalDBService, SyncService
│   ├── store/               # Zustand stores
│   └── lib/                 # Lesan client wrapper, utils
├── web/                     # (Future) Next.js / React frontend
├── docker-compose.yml       # Production MongoDB + backend
├── docker-compose.dev.yml   # Development MongoDB + backend
└── AGENTS.md
```

- **Data flow is local-first.** All writes go to SQLite, then a background `SyncService` pushes them to the Lesan backend.
- **Never block the UI on a network call.**

---

## Tech Stack

| Layer | Choice |
|---|---|
| Backend runtime | Deno 1.x+ |
| Backend framework | Lesan (`jsr:@hemedani/lesan`) |
| Database (server) | MongoDB 7+ |
| Auth | JWT (`jose` / `djwt`) |
| Mobile | React Native + Expo (SDK 52+), Expo Router (file-based routing) |
| Audio engine | `expo-audio` (SDK 57 first-party; background playback + lock-screen via config plugin) |
| Local DB | `expo-sqlite` |
| State / server data | Zustand + standard Lesan fetch client (`lesanApi`) |
| Styling | NativeWind |
| Validation | Superstruct (Lesan) + Zod on mobile |
| E2E / API tests | hurl (`deno task test`) |
| Unit tests | Jest + React Native Testing Library |

Do not swap these without a strong, stated reason.

---

## Domain Model

One Lesan model per file in `back/models/` (e.g. `track.ts`, `playbackSession.ts`).

- **User** — credentials/settings.
- **Track** — an audio file (song or audiobook chapter). Owned by a user; may belong to playlists. Carries denormalized aggregates (`totalPlayCount`, `totalListenTimeSec`, `lastPlayedAt`).
- **PlaybackSession** — one continuous period of listening. The heart of the product: `startedAt`, `endedAt`, `startPositionSec`, `endPositionSec`, `durationListenedSec`, `playbackSpeed`, `completed`, `interrupted`, `deviceInfo`.
- **Annotation** — a note at a specific audio position: `positionSec`, `text`, `tags`, `color`, `createdAt`, `updatedAt`, `timesPlayedBefore`, `sessionId`.
- **Playlist** — ordered collection of tracks (`items[].order`).

**Rules:**
- **All positions and durations are integer seconds.** Never store audio offsets as floats — audiobooks can exceed 20 hours and floating-point drift is unacceptable.
- **`contentHash` (SHA-256, first 1 MB + file size) is the true identity of a track.** Never dedupe by filename or path. Cross-device history and annotations follow the hash.
- `durationListenedSec` is **actual wall-clock time played**, not `endPositionSec - startPositionSec`. Compute it from progress deltas: add a delta only when `0 < delta < 5` (normal play); on a seek (`delta > 5` or `delta < 0`) update position without adding.
- Persist a lightweight checkpoint every 10 s so a killed app doesn't lose a session; recover orphaned checkpoints on next launch.
- Relations: embedded (`relatedRelations`, bounded — e.g. last N sessions/annotations on a Track) for fast reads; referenced for unbounded collections.

---

## Lesan Conventions

- Entry point `back/mod.ts` creates `coreApp = lesan()`.
- Models: `coreApp.odm.newModel(name, pureFields, relations)`, pure fields use Superstruct validators.
- Acts: `coreApp.acts.setAct({ schema, actName, validator, fn })`. Every act has a validator (`*.val.ts`) defined **before** its implementation (`*.fn.ts`).
- Validators use `object({ set: ..., get: coreApp.schemas.selectStruct(...) })`; always support deep projections via `get`.
- One act folder per domain under `back/src/` (`auth/`, `tracks/`, `sessions/`, `annotations/`, `playlists/`, `sync/`).
- Enable `typeGeneration: true` in `runServer()` so `back/declarations/` stays in sync; the mobile client consumes only these generated types.
- The generated `declarations/selectInp.ts` exports the standard `lesanApi` fetch client plus `ReqType`. The mobile app wraps `lesanApi` (never re-implements transport or adds a second HTTP/query library) and imports its types.
- Inject `userId` into request context for every authenticated act.
- Enable the playground in development.

---

## Coding Standards

- **Strict TypeScript. No `any`.** Rely on generated Lesan types end-to-end.
- Backend: one model per file in `back/models/`; one domain folder per act group in `back/src/`.
- Mobile: functional components + hooks only (no class components). Prefer pure functions.
- Naming: `camelCase.ts` for backend modules (Lesan convention), `PascalCase.tsx` for components.
- All network calls go through the generated Lesan fetch client (`lesanApi` in `back/declarations/selectInp.ts`) wrapped by `mobile/src/lib`. All persistence goes through `LocalDBService`.
- Put throwaway scripts in `ignore-scripts/`.
- **Never use `git reset`.**
- Commits (only when explicitly asked): Conventional Commits + Gitmoji. Never commit secrets or generated `.env` files.

### Git Commit Workflow

When I say `git commit` please do the following:

Please act as an expert Git commit assistant. Your task is to carefully review the recent project changes (e.g., via git diff or staged files) and generate a series of clear, conventional commit messages following best practices. Use Gitmoji emojis at the start of each commit message to make them more expressive and readable (e.g., :sparkles: for new features, :bug: for fixes).
Key guidelines:
- Conventional structure: Each commit message should start with a Gitmoji, followed by a type (e.g., feat, fix, refactor, docs, test, chore), a scope in parentheses if applicable (e.g., (ui)), a colon, and a concise description. Include a body if needed for more details, and reference issues if relevant.
- Grouping: Break changes into logical, atomic commits. Group related files or changes together (e.g., one commit for UI updates, another for bug fixes), rather than lumping everything into a single commit. Avoid overly large or unrelated groupings.
- Execution: Directly output and execute the necessary Git shell commands (e.g., git add for specific files, followed by git commit -m "message") to apply these commits. Do not ask for confirmation, additional input, or perform unrelated actions like rebasing, squashing, or amending existing commits. Only create new commits on the current branch.
- Best practices: Ensure messages are imperative, concise (50 chars for subject), and descriptive. Focus on what changed and why, not how.
- Use present tense for the subject line (e.g., "Add feature" not "Added feature")
- Be specific about what was changed (e.g., "Fix user login validation" rather than just "Fix bug")
- When making breaking changes, indicate this with an exclamation mark after the type (e.g., "feat!: Remove deprecated API endpoint")
- Reference issue numbers if applicable (e.g., "fix(auth): Resolve login issue #123")
- For multiple related changes, create separate commits for each logical change
- When updating dependencies, mention the specific packages (e.g., "chore(deps): Update react and react-dom to v18")
- For documentation changes, be clear about what documentation was added or updated
- When changing configuration files, explain the purpose of the changes
- Proceed step-by-step: First, analyze the changes, then propose the grouped commits, and finally execute the Git commands in sequence.

⚠️ **WARNING**: Under no circumstances should you ever use the `git reset` command when performing git operations, as it can permanently erase work that took days to complete. This command has caused significant data loss in the past and should be avoided entirely.

---

## Offline-First Sync

1. **Local write first.** Every session/annotation is written to SQLite with `sync_status = 'pending'` and a client-generated temp id.
2. **Background sync** (`SyncService`) batches pending rows and calls the Lesan `syncLocalData` act. Trigger on app start, on foreground, after each session ends, and on a periodic timer.
3. **Server processing** validates the batch, inserts docs, wires relations, and increments the parent Track's aggregate fields.
4. **Id mapping:** after sync, replace the temp id with the server id and mark the row `synced`.
5. **Conflict resolution:** sessions are append-only (no conflicts). Annotation edits use last-write-wins on `updatedAt`.

Never lose data on app kill; never surface sync errors as blocking UI errors.

---

## Agent Workflow

- **Decompose work as: models → validators → acts → tests (backend), then DB → audio engine → services → screens (mobile).**
- **Implement the backend before the frontend for any feature.**
- Read the relevant section of `docs/` before starting a feature; do not invent APIs that contradict Lesan patterns.
- Every act needs at least one test; the audio engine, sync engine, and duration calculation are the highest-value tests.
- A feature is **done** only when: types are correct end-to-end, it works fully offline, history/annotations survive reinstall (after login), and tests pass.

### Roadmap (build in order)

1. **Bootstrap** — monorepo, Deno + Lesan hello model + playground, Expo app, Docker Compose, generated client types.
2. **Backend core** — User + auth, Track, PlaybackSession, Annotation, Playlist + CRUD acts.
3. **Mobile skeleton** — auth flow, local library scanner (hash + metadata), player that records sessions locally, session sync.
4. **Annotations & timeline** — create/edit/delete annotations, markers on the progress bar, jump-to-annotation.
5. **Polish** — playlists, stats/history dashboard, offline queue robustness, lock-screen/Android Auto, export.

---

## Commands

```bash
# Backend
cd back
deno task start        # start Lesan server (default port 1405)
deno task dev          # hot reload
deno task seed         # seed database
deno task test         # run hurl e2e tests

# Mobile
cd mobile
npm install
npx expo start         # Expo dev server
npx expo run:android   # build & run on device/emulator

# Docker
docker compose -f docker-compose.dev.yml up --build   # development
docker compose up --build                             # production
```

---

## Reference Specs

These are the source documents. Where they conflict, the rules in this file win; otherwise the spec is authoritative for its domain.

- `docs/DEEPSEEK.md` — data models, session math, sync engine, acceptance criteria.
- `docs/GROK.md` — product vision, features/user flows, testing priorities.
- `docs/QWEN.md` — Lesan schema examples, offline sync strategy, phased roadmap.
