# AGENTS.md — Pejvak Backend

Agent rules for the **`back/` workspace** of Pejvak: a Deno + Lesan + MongoDB API that stores listener-owned tracks, an exhaustive playback-session history, timestamped annotations, and playlists. Read the root `../AGENTS.md` first — it is authoritative. This file documents the backend implementation and the Lesan patterns in use.

---

## Project Overview

Pejvak is an offline-first Android audio player. The mobile app writes everything to SQLite first and syncs here. The backend is therefore optimized for **append-heavy ingest** (sessions/annotations) plus **fast, deeply projected reads** (a track with its recent sessions and annotations) — not for server-side playback.

- **Runtime**: Deno 1.x+ (developed on 2.x)
- **Framework**: Lesan (`jsr:@hemedani/lesan`) — MongoDB ODM + generated acts
- **Database**: MongoDB 7+
- **Auth**: JWT (HS512, `djwt`), token in the `token` request header
- **Types**: generated into `declarations/` on server start (`typeGeneration: true`); the mobile client consumes only these
- **Product specs**: `../docs/DEEPSEEK.md` (data models, session math, sync engine, acceptance criteria), `../docs/GROK.md` (vision, flows, testing), `../docs/QWEN.md` (Lesan schemas, offline sync, roadmap)

There is **no RBAC** on the backend. Every authenticated act resolves a single `user._id`; a user can only ever read or write their own tracks, sessions, annotations, and playlists. Ownership is enforced in each act's query (`"user._id": userId`), not by roles.

---

## Project Structure

```
back/
├── deno.json               # tasks + import aliases (@lib, @model, lesan, djwt)
├── deno.lock               # committed dependency lock
├── mod.ts                  # entry: lesan(), setDb, register models, functionsSetup(), runServer
├── Dockerfile              # multi-stage Deno build (development + production)
├── models/                 # Lesan models (one file per model)
│   ├── mod.ts              # barrel: re-exports all models + excludes
│   ├── excludes.ts         # per-model field exclusion lists for relations
│   ├── user.ts
│   ├── track.ts
│   ├── playbackSession.ts
│   ├── annotation.ts
│   └── playlist.ts
├── src/                    # Lesan acts (one folder per domain, one folder per act)
│   ├── mod.ts              # functionsSetup() — registers every domain
│   ├── auth/               # register, login, getMe
│   ├── tracks/             # registerTrack, getMyTracks
│   └── sync/               # syncLocalData
├── utils/                  # shared helpers
│   ├── mod.ts              # barrel (@lib)
│   ├── context.ts          # MyContext typing
│   ├── token.ts            # JWT key + createToken
│   ├── setTokens.ts        # preAct: verify header token -> context.user
│   ├── setUser.ts          # preAct: load user from DB -> context.user
│   ├── createUpdateAt.ts   # createdAt/updatedAt pure-field pair
│   ├── pagination.ts       # page/limit/skip pure-field mixin
│   ├── throwError.ts
│   └── seed.ts             # deno task seed
├── http/
│   ├── vars.env            # hurl variables (serverAddress)
│   └── e2e.hurl            # end-to-end smoke test
└── declarations/           # generated — do not edit, do not commit
```

---

## Data Models

Lesan models are declared in `models/*.ts` as a `*_pure` field map (Superstruct validators) plus a `*_relations` map, then registered by a factory function (`users()`, `tracks()`, …) called from `mod.ts`.

### User

`models/user.ts` — credentials only.

- Pure: `username`, `email` (`emailPattern`), `password`, optional `displayName`, optional `avatarUrl`, `createdAt`, `updatedAt`.
- Unique index on `email`; `password` is model-level `excludes` so it never leaks through a relation.
- Relations: none declared here. Child models (Track, PlaybackSession, Annotation, Playlist) own the relation to User and let Lesan generate the reverse arrays.

### Track

`models/track.ts` — an audio file (song or audiobook chapter), owned by one user.

- Pure: `title`, `contentHash`, optional `fileName`, `durationSec`, `fileSizeBytes`, optional `mimeType`, `isAudiobook`, optional `author`, `narrator`, `artworkUrl`, and the denormalized aggregates `totalPlayCount`, `totalListenTimeSec`, `lastPlayedAt`.
- Index on `contentHash` for cross-device lookup.
- Relations: `user` (single, required) with reverse `tracks`.

### PlaybackSession

`models/playbackSession.ts` — one continuous period of listening; the heart of the product.

- Pure: optional `clientId` (device-generated id for idempotent sync), optional `contentHash`, `startedAt`, optional `endedAt`, `startPositionSec`, `endPositionSec`, `durationListenedSec`, `playbackSpeed`, `completed`, `interrupted`, optional `deviceInfo`.
- Unique sparse index on `clientId` so a replayed sync batch cannot double-insert.
- Relations: `track` (reverse `sessions`), `user` (reverse `sessions`).

### Annotation

`models/annotation.ts` — a note at an audio position.

- Pure: optional `clientId`, `positionSec`, `text`, `tags` (string array), optional `color`, `timesPlayedBefore`.
- Unique sparse index on `clientId`.
- Relations: `track` (reverse `annotations`, sorted by `positionSec` asc, limit 1000), `user` (reverse `annotations`), optional `session`.

### Playlist

`models/playlist.ts` — an ordered collection of tracks, owned by one user.

- Pure: `title`, optional `description`, `isPublic`, and `items` — an embedded array of `{ trackId, order }`.
- Relations: `user` (single, required) with reverse `playlists`.

---

## Domain Rules (non-negotiable)

These mirror `../AGENTS.md`; the backend must enforce them server-side too.

1. **All positions and durations are integer seconds.** Never floats. Audiobooks exceed 20 hours; floating-point drift is unacceptable. Field names carry the `Sec` suffix.
2. **`contentHash` is the identity of a track** (SHA-256 of first 1 MB + file size, computed on device). Never dedupe by filename or path. Cross-device history and annotations follow the hash.
3. **`durationListenedSec` is wall-clock time played**, not `endPositionSec - startPositionSec`. The device computes it from progress deltas (`0 < delta < 5` adds; seeks don't). The backend trusts and stores it; it does not recompute it.
4. **Sessions are append-only.** They are never edited after creation. A seek or speed change starts a new session on the device.
5. **Annotation edits are last-write-wins on `updatedAt`.**

---

## Acts Reference

Every act lives in `src/<domain>/<actName>/` and consists of three files: `mod.ts` (registration), `<actName>.val.ts` (validator), `<actName>.fn.ts` (implementation). The validator is always defined **before** the implementation.

**Registration** (`mod.ts`) uses `coreApp.acts.setAct({ schema, actName, fn, validator, preAct?, validationRunType? })`. Authenticated acts put `preAct: [setTokens, setUser]`, which verifies the `token` header and loads the user into context.

| Act | Model / route | Auth | Purpose |
|---|---|---|---|
| `register` | `POST /user/register` | public | Create a user, return `{ token, user }`. |
| `login` | `POST /user/login` | public | Verify password, return `{ token, user }`. |
| `getMe` | `POST /user/getMe` | token | Return the current user with a deep `get` projection. |
| `registerTrack` | `POST /track/registerTrack` | token | Insert a track owned by the caller. |
| `getMyTracks` | `POST /track/getMyTracks` | token | Paginated/filterable list of the caller's tracks. |
| `syncLocalData` | `POST /track/syncLocalData` | token | Batch-ingest offline sessions + annotations and bump track aggregates. |

**Request shape**: `{ "details": { "set": { ... }, "get": { ... } } }`; the token goes in the `token` header. `set` is validated by the act's validator; `get` drives the projection via `selectStruct(model, depth)`.

**Client transport**: `typeGeneration: true` emits `declarations/selectInp.ts`, which exports the standard `lesanApi` fetch client (POST body `{ model, act, details }`, `{ success, body }` envelope) plus the `ReqType` request/response tree. Mobile consumes these directly by wrapping `lesanApi`; do not add another HTTP or server-state library. Projection fields inside an act's `get` validator must be declared as `enums([0, 1])` (or `selectStruct`), never as their output type — otherwise the generated `get` type is unusable as a projection (see `login`/`register`).

**`syncLocalData` behavior** (idempotent):
1. Resolve the caller's Track by `contentHash` + `user._id`.
2. Skip any row whose `clientId` already exists.
3. Insert the session/annotation with its `track` and `user` relations wired.
4. For sessions, `$inc` the parent Track's `totalPlayCount` and `totalListenTimeSec`, and set `lastPlayedAt`.
5. Return `{ syncedSessions, syncedAnnotations }`.

Unknown `contentHash` rows are skipped (the device registers the track first). Never surface partial failures as a blocking error — the device retries.

---

## Lesan Framework Patterns

### Model definition

```ts
export const model_pure = {
  name: string(),
  description: optional(string()),
  ...createUpdateAt,
};

export const model_relations = {
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      tracks: { type: "multiple" as RelationDataType, limit: 50, sort: { field: "_id", order: "desc" as RelationSortOrderType } },
    },
  },
};

export const models = () =>
  coreApp.odm.newModel("modelName", model_pure, model_relations);
```

### Act pattern

```ts
// mod.ts
export const addSetup = () =>
  coreApp.acts.setAct({
    schema: "track",
    actName: "registerTrack",
    preAct: [setTokens, setUser],
    validator: registerTrackValidator(),
    fn: registerTrackFn,
    validationRunType: "create",
  });

// val.ts
export const registerTrackValidator = () =>
  object({
    set: object({ title: string(), contentHash: string() }),
    get: selectStruct("track", 1),
  });

// fn.ts
export const registerTrackFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const created = await track.insertOne({
    doc: set,
    relations: { user: { _ids: user._id, relatedRelations: {} } } as never,
    projection: { _id: 1 },
  });
  if (!created) throwError("Track was not created");
  return await track.findOne({ filters: { _id: created._id }, projection: get });
};
```

### One-directional relations — never duplicate

The model that *belongs to* another model owns the relation. Define it on the child with `relatedRelations`; Lesan auto-creates the reverse on the parent. **Never define the reverse on the parent too.** For example, `playbackSession.ts` defines `track` with `relatedRelations: { sessions }`; `track.ts` must not also define `sessions`.

### Single relations are embedded

A `type: "single"` relation is stored inline in the parent document. Reading it costs no extra query, and you can index sub-fields like `user._id`. Do **not** denormalize `userId`/`userName` into extra pure fields — filter on `user._id` instead.

### `hardCascade` on `deleteOne`

Default (`false`) deletes the child and auto-cleans the parent's embedded reverse array, but **blocks** deleting a parent that still has children. `hardCascade: true` cascade-deletes children — use sparingly and never for routine cleanup. Delete leaf nodes first.

---

## Offline-First Sync Contract

1. The device writes sessions/annotations to SQLite with `sync_status = 'pending'` and a client-generated `clientId`.
2. `SyncService` batches pending rows and calls `syncLocalData`.
3. The backend validates the batch, skips already-synced `clientId`s, inserts the rest, wires relations, and increments track aggregates.
4. The device replaces its temp id with the returned server id and marks the rows `synced`.

The backend must be **idempotent** (`clientId` unique index) because the device may resend a batch after a dropped response.

---

## Development

```bash
# run from the back/ directory

deno task start        # start Lesan server (default port 1405)
deno task dev          # hot reload
deno task seed         # insert a demo user (demo@pejvak.app / password123)
deno task test         # hurl e2e smoke test (requires a running server)
deno check mod.ts      # typecheck
deno lint              # lint
deno fmt               # format
```

Environment variables:

- `MONGO_URI` — MongoDB connection string (default `mongodb://127.0.0.1:27017/`)
- `DB_NAME` — database name (default `pejvak`)
- `APP_PORT` — server port (default `1405`)
- `ENV` — `development` enables the `/playground`; anything else disables it
- `TOKEN_KEY` — JWT signing secret (default is a dev-only value; always set in production)

The Lesan playground is available at `/playground` in development. `typeGeneration: true` regenerates `declarations/` on server start.

---

## Testing

- E2E tests are [hurl](https://hurl.dev) files under `http/` and run with `deno task test`.
- Each act should have at least one hurl assertion. The highest-value tests are: session ingest + aggregate updates, idempotent re-sync, annotation position accuracy, and projection correctness.
- Backend work is not "done" until `deno check mod.ts`, `deno lint`, and `deno fmt --check` pass, and the act's hurl steps are green.

---

## Conventions

- **Strict TypeScript. No `any`.** Use the generated Lesan types and `MyContext`.
- One model per file in `models/`; one domain folder per act group in `src/`.
- Register every new model in `models/mod.ts` and instantiate it in `mod.ts`; register every new domain's setup function in `src/mod.ts`.
- Validators (`*.val.ts`) are written before implementations (`*.fn.ts`), always with a `get` projection.
- Import models from `@model`. In `models/`, import pure-field mixins from their own file (e.g. `../utils/createUpdateAt.ts`) so the model layer does not pull in the `@lib` barrel (which imports `mod.ts` and creates a cycle); in `src/` acts, import helpers from `@lib`.
- Put throwaway scripts in `ignore-scripts/`. Never commit `declarations/` or `.env` files.
- Commits (only when explicitly asked): Conventional Commits + Gitmoji. Never use `git reset`.

---

## Roadmap (next backend work)

1. `src/sessions/` — `getTrackSessions`, `getMyListeningHistory`.
2. `src/annotations/` — `createAnnotation`, `updateAnnotation`, `deleteAnnotation`, `getTrackAnnotations` (with position-range filter).
3. `src/playlists/` — CRUD, `addToPlaylist`, `reorder`.
4. A track-detail act that returns a Track with its recent sessions and annotations via embedded `relatedRelations` projections.
5. Stats/history aggregations (total hours, most-listened tracks, streaks).
