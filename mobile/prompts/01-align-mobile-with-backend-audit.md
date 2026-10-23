# 01 — Align mobile with the backend audit contract

## Goal

Bring the mobile client back in sync with the backend contract changes made by the
backend audit. The required work is small: re-vendor the generated Lesan
declarations, fix the one payload the generator now requires, and prove the sync
and pull paths still type-check and test green. Do not edit the backend.

Read `mobile/AGENTS.md`, `back/AGENTS.md`, and `../AGENTS.md` before starting.
The nearest `AGENTS.md` wins for sector-specific rules.

## Why this is needed

The backend audit changed these contracts:

- `registerTrack.set.origin` is now `defaulted(enums(["local", "online"]), "local")`.
  The generated `set` type therefore marks `origin` as **required**.
- `syncLocalData.get`, `getMyStats.get`, `deleteAnnotation.get`,
  `deletePlaylist.get`, and `removeOnlineCollection.get` are now projection
  objects (`0 | 1`), and most are optional. They no longer use output types
  such as `number`, `string`, or `boolean`.
- `syncLocalData` now scopes session and annotation lookups by `user._id`.
  The wire payload did not change.
- `updatePlaylist` now verifies that every `trackId` belongs to the caller.
  The mobile client does not call this act; it syncs playlists through
  `syncLocalData`.

The mobile copy of the generated client is vendored at
`src/lib/generated/selectInp.ts`. `mobile/AGENTS.md` requires it to stay
byte-identical with `../back/declarations/selectInp.ts`. It is currently stale.

## Required work

### 1. Re-vendor the generated declarations

From `mobile/`:

```bash
npm run gen:api
cmp -s ../back/declarations/selectInp.ts src/lib/generated/selectInp.ts \
  && echo "declarations are identical"
```

If `../back/declarations/selectInp.ts` is missing or older than the backend
sources, regenerate it once by starting the backend against a live MongoDB,
waiting for `Lesan server is running`, then stopping it:

```bash
cd ../back
DB_NAME=pejvak APP_PORT=1406 deno run --allow-all mod.ts
# Ctrl-C after the server starts and declarations are written
cd ../mobile
npm run gen:api
```

Never hand-edit `src/lib/generated/selectInp.ts`.

Expected generated diff:

- `registerTrack.set.origin` becomes `origin: ("local" | "online")` (required).
- `syncLocalData.get` becomes optional and uses `0 | 1` projections.
- `deleteAnnotation.get`, `deletePlaylist.get`, and
  `removeOnlineCollection.get` become optional with `success?: (0 | 1)`.
- `getMyStats.get` becomes optional with `0 | 1` projection fields.

### 2. Fix the `registerTrack` payload

File: `src/services/SyncService.ts`, function `registerTrack`.

The generated type now requires `origin`. Send it from the local row and send
the online provenance the backend already accepts. The backend never accepts a
stream URL or a download path, so do not add those.

Use this shape:

```ts
set: {
  title: track.title,
  contentHash: track.contentHash,
  durationSec: track.durationSec,
  fileSizeBytes: track.fileSizeBytes,
  isAudiobook: track.isAudiobook,
  origin: track.origin,
  ...(track.fileName ? { fileName: track.fileName } : {}),
  ...(track.mimeType ? { mimeType: track.mimeType } : {}),
  ...(track.author ? { author: track.author } : {}),
  ...(track.narrator ? { narrator: track.narrator } : {}),
  ...(isRemoteArtwork(track.artworkUrl) ? { artworkUrl: track.artworkUrl } : {}),
  ...(track.sourceId !== null ? { sourceId: track.sourceId } : {}),
  ...(track.externalId !== null ? { externalId: track.externalId } : {}),
  ...(track.collectionKey !== null
    ? { collectionKey: track.collectionKey }
    : {}),
  ...(track.collectionTitle !== null
    ? { collectionTitle: track.collectionTitle }
    : {}),
  ...(track.downloadedAt !== null
    ? { downloadedAt: track.downloadedAt }
    : {}),
},
```

Why this matters: without `origin`, online tracks are stored on the server as
local tracks, and the backend's re-register path can never update their
provenance. The mobile `LocalTrack` already carries all of these fields.

### 3. Verify the sync payload remains compatible

`src/services/SyncService.ts` already sends the right projection values:

```ts
get: {
  syncedSessions: 1,
  syncedAnnotations: 1,
  syncedPlaylists: 1,
  syncedContextPlays: 1,
  annotations: [],
  playlists: [],
  contextPlays: [],
  onlineCollections: [],
}
```

That remains valid under the new `0 | 1` types. Do not change it to booleans.
The mobile client does not call the dedicated delete/update acts; if future code
does, remember that their `get.success` is now `0 | 1`, not `boolean`.

### 4. Update tests

- Add or update a test in `src/services/__tests__/SyncService.test.ts` that
  asserts a `registerTrack` request includes `origin: "local"` for a local track
  and `origin: "online"` plus `sourceId` / `externalId` / `collectionKey` for an
  online track.
- If any test constructs `RegisterTrackDetails` directly, add `origin`.
- Do not weaken existing sync tests to accommodate the new type; fix the
  payloads instead.

### 5. Run verification

From `mobile/`:

```bash
npm run gen:api
cmp -s ../back/declarations/selectInp.ts src/lib/generated/selectInp.ts \
  && echo "declarations are identical"
npm run typecheck
npm run lint
npm test -- --runInBand
```

All four must pass. Inspect `git status` and the generated diff; only the
vendored declaration file, the `registerTrack` payload, and the related test
should change.

## Optional follow-up — pull online provenance

This is **not required** for the contract sync, and should be a separate change
with its own tests. Today `fetchRemoteTracks()` pulls only title, duration,
size, author, and narrator, so a second device restores an online track without
its `origin` or collection key.

If you take this on:

- Extend `RemoteTrack` in `src/lib/reconcile.ts` with optional `origin`,
  `sourceId`, `externalId`, `collectionKey`, `collectionTitle`, and
  `downloadedAt`.
- Request those fields in `fetchRemoteTracks()`.
- Pass them to `LocalDBService.insertTrack()` in `pullFromServer()`.
- Add a pull test proving an online track restores with `origin: "online"` and
  its `collectionKey`.
- Do **not** invent a `streamUrl`: the server deliberately stores no media
  address. A restored online row is a catalog/provenance row and must be
  re-resolved through `OnlineCatalogService` before playback.
- Check the `availability` / `isStreamUri` path so a pulled online row with no
  local file is not treated as a playable local file.

## Acceptance criteria

- `src/lib/generated/selectInp.ts` is byte-identical to
  `../back/declarations/selectInp.ts`.
- `registerTrack` sends `origin` and the optional provenance fields; TypeScript
  accepts the payload.
- No hand edits to the generated declaration file.
- `npm run typecheck`, `npm run lint`, and `npm test -- --runInBand` pass.
- No backend files are modified.
- No new HTTP or server-state library is introduced.

## Non-goals and guardrails

- Do not edit `../back/`.
- Do not hand-edit `src/lib/generated/selectInp.ts`.
- Do not start Expo, an emulator, a watcher, or a long-running build.
- Do not change the local SQLite schema for this task.
- Do not commit unless the user explicitly asks.
