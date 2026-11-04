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

There are two audiences on this backend, and they are separated by **role**, not by a second server:

- **Listeners** — every act outside `src/admin/`. Ownership is enforced in each act's own query (`"user._id": userId`), so a listener can only ever read or write their own tracks, sessions, annotations and playlists.
- **Operators** — the admin panel (`src/admin/`), gated by `user.role` (`user` | `support` | `admin`). Reads require `support` or `admin`; mutations require `admin`. See [Roles and the admin panel](#roles-and-the-admin-panel).

Monetization is part of the model layer, not a bolt-on: `plan` rows carry the limits, `subscription` rows carry who has which plan, and every ingest path checks the resolved entitlement before it writes. The free tier is capped at **500 history entries**; Pro is $3.99/month with no cap. See [Entitlements and billing](#entitlements-and-billing).

---

## Project Structure

```
back/
├── deno.json               # tasks + import aliases (@lib, @model, lesan, djwt)
├── deno.lock               # committed dependency lock
├── mod.ts                  # entry: lesan(), setDb, register models, bootstrap(), functionsSetup(), runServer
├── Dockerfile              # multi-stage Deno build (development + production)
├── models/                 # Lesan models (one file per model)
│   ├── mod.ts              # barrel: re-exports all models + excludes
│   ├── excludes.ts         # per-model field exclusion lists for relations
│   ├── user.ts             # + role / status (RBAC and suspension)
│   ├── track.ts
│   ├── playbackSession.ts
│   ├── annotation.ts
│   ├── playlist.ts
│   ├── playbackContext.ts
│   ├── onlineCollection.ts
│   ├── plan.ts             # the catalogue: price + limits (one row per tier)
│   ├── subscription.ts     # who is on which plan, and until when
│   ├── billingTransaction.ts  # the ledger — no relation to User, on purpose
│   ├── aiUsage.ts          # per-user, per-month credit meter
│   ├── adminAuditLog.ts    # append-only operator activity feed
│   └── platformSetting.ts  # singleton: signups, AI switch, maintenance, announcement
├── src/                    # Lesan acts (one folder per domain, one folder per act)
│   ├── mod.ts              # functionsSetup() — registers every domain
│   ├── bootstrap.ts        # orchestrates default plans, platform row, indexes before runServer
│   ├── db/                 # indexes.ts — secondary indexes Lesan's model factory cannot take
│   ├── auth/               # register, login, getMe
│   ├── tracks/             # registerTrack, getMyTracks, getTrackDetail
│   ├── sessions/           # getMyListeningHistory, getTrackSessions
│   ├── stats/              # getMyStats
│   ├── playlists/          # create/update/delete/getMyPlaylists
│   ├── contexts/           # getMyPlaybackContexts
│   ├── online/             # save/get/remove online collections
│   ├── settings/           # getMySettings, updateMySettings + mergeSetting
│   ├── sync/               # syncLocalData (quota-enforcing ingest)
│   ├── entitlements/       # plan limits, entitlement resolution, quota helpers, defaultPlans.ts
│   ├── billing/            # getMySubscription, createCheckout, confirmCheckout, cancelMySubscription
│   │   ├── lifecycle.ts    # activate / revoke / pending → paid, the only write path
│   │   └── providers/      # manual (operator-confirmed) + stripe (Checkout Sessions)
│   ├── ai/                 # getMyAiUsage, period.ts (UTC month key)
│   ├── platform/           # getPlatformStatus (public, tokenless), setting.ts
│   └── admin/              # the panel: 22 acts across 8 schemas
│       ├── audit.ts        # recordAudit
│       ├── query.ts        # adminPagination, safeUserProjection, escapeRegex, textFilter
│       ├── time.ts         # UTC day/week buckets
│       ├── users/          # list, get, update, delete, resetPassword, history
│       ├── analytics/      # overview, timeseries, topTracks, retention
│       ├── plans/          # list, upsert
│       ├── subscriptions/  # grant, revoke, list
│       ├── transactions/   # list, confirm, refund
│       ├── auditLog/       # list
│       ├── platform/       # get/update the global switches
│       └── ai/             # grant credits
├── utils/                  # shared helpers
│   ├── mod.ts              # barrel (@lib)
│   ├── context.ts          # MyContext typing
│   ├── token.ts            # JWT key + createToken
│   ├── setTokens.ts        # preAct: verify header token -> context.user
│   ├── setUser.ts          # preAct: load user from DB -> context.user (rejects deleted)
│   ├── roles.ts            # roleOf/statusOf, currentUser, requireActive/Support/Admin
│   ├── createUpdateAt.ts   # createdAt/updatedAt pure-field pair
│   ├── pagination.ts       # page/limit/skip pure-field mixin
│   ├── throwError.ts
│   └── seed.ts             # deno task seed (demo listener + first admin + plans)
├── http/
│   ├── vars.env            # hurl variables (serverAddress, admin credentials)
│   ├── e2e.hurl            # listener-facing end-to-end suite
│   └── admin.hurl          # admin, entitlements and billing suite
└── declarations/           # generated — do not edit, do not commit
```

---

## Data Models

Lesan models are declared in `models/*.ts` as a `*_pure` field map (Superstruct validators) plus a `*_relations` map, then registered by a factory function (`users()`, `tracks()`, …) called from `mod.ts`.

### User

`models/user.ts` — credentials plus the listener's shared preferences.

- Pure: `username`, `email` (`emailPattern`), `password`, optional `displayName`, optional `avatarUrl`, optional `setting`, `createdAt`, `updatedAt`.
- `setting` is an **optional embedded object on `User`** — no separate model, collection, relation, or index. Its fields:
  - `languageCode: string | null` — the one online language the listener chose; `null` means none. Unknown codes are accepted (the catalogue lives in the clients), and `null`/`""` clears the choice.
  - `defaultSpeed: number` — speed for a **new** session, inclusive `0.5–3.0`; existing sessions keep their own `playbackSpeed`.
  - `historySort: "newest" | "oldest" | "longest"` — a display choice with no server-side effect.
  - `updatedAt: number` — epoch milliseconds and the settings' own last-write-wins token. It is never the user document's top-level `updatedAt`.
- Defaults are `null`, `1`, `"newest"`, `0` (`0` means "never written"). They are applied **on read**, not written at registration, so an existing user stays valid with no `setting` object.
- Unique index on `email`; `password` is model-level `excludes` so it never leaks through a relation.
- `role: "user" | "admin" | "support"` — defaulted to `"user"`. Indexed (`{ role: 1 }`).
- `status: "active" | "suspended" | "deleted"` — defaulted to `"active"`, plus `suspendedAt` and `suspendedReason`. Indexed (`{ status: 1 }`).
- **`role` and `status` are normalised on every read, not trusted from the document.** Dozens of accounts predate these fields, so `roleOf()` / `statusOf()` in `utils/roles.ts` are the only readers; a raw `user.role` comparison would treat a legacy admin as a listener.
- Relations: none declared here. Child models (Track, PlaybackSession, Annotation, Playlist, Subscription, AiUsage) own the relation to User and let Lesan generate the reverse arrays.

**Shared vs device-local.**

| State | Share across devices? | Backend storage |
|---|---|---|
| `displayName`, `avatarUrl` | Yes | `User` |
| Online language, default speed, history sort | Yes | `User.setting` |
| Tracks, sessions, annotations, playlists, runs, saved collections | Yes | their own models |
| Theme, motion, haptics | No | device/OS only |
| File URIs, folder paths, tree grants | No | **never** |
| Download state/path, file bytes | No | **never** |
| Checkpoints, `lastSyncAt`, UI state | No | **never** |

`Track.downloadedAt` is device-specific despite living on the server; do not treat it as shared download state. See `prompts/01-shared-listener-state.md` §1 for the full inventory.

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

### OnlineCollection

`models/onlineCollection.ts` — an online collection the listener saved, favourited or downloaded.

- Pure: `clientId`, `sourceId`, `externalId`, `title`, optional `subtitle`/`artworkUrl`/`pageUrl`, `languageCode`, `trackCount`, `isFavorite`, `lastOpenedAt`, `deletedAt`.
- Relations: `user` (single, required) with reverse `onlineCollections`.

The server stores **addresses and user state, never media**. The audio stays on the source's own CDN and is fetched by the device.

- **`clientId` is `sourceId:externalId`** — the same string the device uses as its primary key and as the run's `contextKey`. It is **not** unique: two listeners who save the same public course share it, so uniqueness is per user and lives in the act's lookup. Both `saveOnlineCollection` and `removeOnlineCollection` **derive** it rather than accepting it, so it can never disagree with what the device's history looks for.
- **No `streamUrl` and no `downloadPath`.** The source signs its media URLs with an expiry, so a copy kept here would be a link that fails opaquely weeks later; `downloadPath` is an absolute path that means nothing on another device. The durable address is `pageUrl`.
- **No `downloadedAt` on the collection.** Whether the audio is on a device is already recorded per track (`track.downloadedAt`), so a flag here would be a second source of truth — the rule already applied to play counts.

### Plan

`models/plan.ts` — one row per tier. **Prices and limits are data, not constants.**

- Pure: `code` (unique, e.g. `free` / `pro`), `title`, optional `description`, `priceCents`, `currency`, `billingInterval` (`month` | `year` | `lifetime`), `isActive`, `isDefault`, `sortOrder`, embedded `limits` (`planLimits_pure`), `features` (string array).
- `limits`: `historyEntries`, `crossDeviceSync`, `playlists`, `maxTracks`, `aiCreditsPerMonth`. **`-1` means unlimited** and is the only negative value accepted — a typo like `-5` would silently mean the same thing, so `adminUpsertPlan` refuses it.
- `isDefault` marks the tier a listener with no subscription gets. Exactly one row may be default; marking one clears the others in the same request.
- Seeded by `ensureDefaultPlans()` (insert-only-if-absent): `free` (500 history, 10 playlists, 0 AI credits) and `pro` (399¢/month, unlimited history and playlists, 100 AI credits). A restart never overwrites an admin's reprice or archive.

### Subscription

`models/subscription.ts` — who is on which plan, and until when. **One row per listener** in practice, updated in place.

- Pure: `planCode`, `status` (`active` | `trialing` | `past_due` | `canceled` | `expired`), `startedAt`, `currentPeriodStart`, optional `currentPeriodEnd`, `cancelAtPeriodEnd`, optional `canceledAt`, `provider`, optional `providerRef`, `autoRenew`, optional `note`, optional `grantMode`, optional `usageCaps`.
- `grantMode` (`forever` | `duration` | `usage`) exists only on an admin comp; a normal purchase leaves it absent. `duration` expires at `currentPeriodEnd`; `forever` has no end; `usage` ends when a cap is reached.
- `usageCaps` is an embedded `{ historyEntries?, playlists?, maxTracks? }` of **absolute stock thresholds**. A cap replaces that resource's plan limit; an uncapped resource keeps the plan's limit. Caps are not deltas and not AI credits.
- Relations: `user` (single, required) with reverse `subscriptions` (limit 20). Index `{ "user._id": 1, status: 1 }`.
- `currentPeriodEnd` is absent for a `lifetime` plan or a `forever`/`usage` grant — there is nothing to expire, and a far-future date would only pretend otherwise.
- A canceled row is **kept**, never deleted: it is the answer to "why can this person not sync?".

### BillingTransaction

`models/billingTransaction.ts` — the ledger. **Deliberately has no relation to `User`.**

- Pure: `reference` (unique, `txn_<uuid>`), `userId` (**string**), optional `userEmail`, `planCode`, `planTitle`, `amountCents`, `currency`, `billingInterval`, `status` (`pending` | `paid` | `failed` | `refunded` | `canceled`), `provider`, optional `providerRef`, `paidAt`, `refundedAt`, optional `periodStart`/`periodEnd`, optional `metadata` (JSON string), optional `note`.
- The owner is a **string snapshot**, not a relation, so a receipt survives the listener being deleted, refunded or renamed. A relation would cascade or dangle; a receipt must do neither.
- The amount is copied from the plan at checkout time, so a later reprice cannot change what a listener was asked to pay.

### AiUsage

`models/aiUsage.ts` — the per-month credit meter, shipped before the AI features exist so the allowance has a history.

- Pure: `periodKey` (`YYYY-MM`, UTC), `creditsUsed`, `bonusCredits`, `requestCount`, `lastUsedAt`.
- Relations: `user` (single, required) with reverse `aiUsage`. Unique index on `{ "user._id": 1, periodKey: 1 }`.
- `bonusCredits` is a **pool that is added to**, never an edit to `creditsUsed`: lowering consumption would make the meter claim they used less than they did. A grant is a separate fact, and therefore auditable.
- The row is created on first spend, so a listener who never uses AI costs nothing here.

### AdminAuditLog

`models/adminAuditLog.ts` — append-only operator activity. **`actorId` and `targetId` are strings, not relations**, for the same reason as the ledger: the log must outlive the account it names.

- Pure: `actorId`, `actorEmail`, `actorRole`, `action` (dotted vocabulary: `user.update`, `plan.create`, `subscription.grant`, `transaction.refund`, `platform.update`, `ai.grantCredits`, …), `targetType` (`user` | `plan` | `subscription` | `transaction` | `platformSetting` | `aiUsage`), `targetId`, `summary`, optional `metadata` (JSON string).
- The fields stay **flat** (`targetType` + `targetId`, not a nested target object): rows are immutable, so nesting would force nested indexes and filters and a backfill on everything already written.
- Index `{ targetType: 1, targetId: 1, createdAt: -1 }`. Written by `recordAudit()` (best-effort, awaited) from every mutating admin act.

### PlatformSetting

`models/platformSetting.ts` — a singleton, `key: "platform"`.

- Pure: `signupsEnabled` (default `true`), `aiEnabled` (default `false`), `maintenanceMode` (default `false`), optional `announcement`.
- **Not a bag of limits.** A limit belongs to a plan because it is sold; duplicating one here would create two answers to "how much history does a free listener get?".
- `signupsEnabled` is enforced by `register`, which refuses with a message rather than silently creating an account.
- `maintenanceMode` is a **client signal, not a server interlock**: the server keeps serving reads and the panel, because the operator who ends the maintenance is using the panel.
- Read through `readPlatformSetting()` (create-on-first-read, guarded by a unique index), so a fresh database never fails a request and an admin edit is never overwritten by a default. `getPlatformStatus` exposes the four fields anonymously.

---

## Domain Rules (non-negotiable)

These mirror `../AGENTS.md`; the backend must enforce them server-side too.

1. **All positions and durations are integer seconds.** Never floats. Audiobooks exceed 20 hours; floating-point drift is unacceptable. Field names carry the `Sec` suffix.
2. **`contentHash` is the identity of a track** (SHA-256 of first 1 MB + file size, computed on device). Never dedupe by filename or path. Cross-device history and annotations follow the hash.
3. **`durationListenedSec` is wall-clock time played**, not `endPositionSec - startPositionSec`. The device computes it from progress deltas (`0 < delta < 5` adds; seeks don't). The backend trusts and stores it; it does not recompute it.
4. **Sessions are append-only.** They are never edited after creation. A seek or speed change starts a new session on the device.
5. **Annotation edits are last-write-wins on `updatedAt`.**
6. **Limits are data, never constants.** A number a plan could carry belongs on a `plan` row, so an operator can change it without a deploy. Hard-coding `500` in an act is a bug even when it matches today's catalogue.
7. **A quota never destroys data.** When an account is over its cap, the new rows are skipped and reported — never a silent delete of what is already stored, and never a refused batch that would also lose the rows travelling with it.
8. **Money and access are written in that order.** A ledger row is the receipt; it is written before the entitlement changes and is never deleted. The owner on a transaction is a string snapshot, not a relation, so it survives the account.

---

## Acts Reference

Every act lives in `src/<domain>/<actName>/` and consists of three files: `mod.ts` (registration), `<actName>.val.ts` (validator), `<actName>.fn.ts` (implementation). The validator is always defined **before** the implementation.

**Registration** (`mod.ts`) uses `coreApp.acts.setAct({ schema, actName, fn, validator, preAct?, validationRunType? })`. Authenticated acts put `preAct: [setTokens, setUser]`, which verifies the `token` header and loads the user into context.

| Act | Model / route | Auth | Purpose |
|---|---|---|---|
| `register` | `POST /user/register` | public | Create a user, return `{ token, user }`. |
| `login` | `POST /user/login` | public | Verify password, return `{ token, user }`. |
| `getMe` | `POST /user/getMe` | token | Return the current user with a deep `get` projection. |
| `getMySettings` | `POST /user/getMySettings` | token | Return the caller's shared settings, filling defaults on read without writing. |
| `updateMySettings` | `POST /user/updateMySettings` | token | Patch the caller's settings with atomic last-write-wins on `setting.updatedAt`. |
| `registerTrack` | `POST /track/registerTrack` | token | Insert a track owned by the caller. |
| `getMyTracks` | `POST /track/getMyTracks` | token | Paginated/filterable list of the caller's tracks. |
| `getMyPlaybackContexts` | `POST /playbackContext/getMyPlaybackContexts` | token | Paginated runs through a collection; `contextType`/`contextKey` narrow to one. |
| `saveOnlineCollection` | `POST /onlineCollection/saveOnlineCollection` | token | Upsert a saved/favourite online collection. LWW on `updatedAt`; `deleted` removes the row. |
| `getMyOnlineCollections` | `POST /onlineCollection/getMyOnlineCollections` | token | The listener's shelf, filterable by `isFavorite`, `sourceId`, `languageCode`. |
| `removeOnlineCollection` | `POST /onlineCollection/removeOnlineCollection` | token | Delete by `sourceId` + `externalId`. Idempotent: an absent row is a success. |
| `syncLocalData` | `POST /track/syncLocalData` | token | Batch-ingest offline sessions, annotations, playlists, runs, online collections and a settings snapshot; bump track aggregates. Enforces the history/playlist quota. |
| `getPlatformStatus` | `POST /platformSetting/getPlatformStatus` | **public** | The four global switches, readable without a token so a client can show a maintenance banner or hide AI before it has an account. |
| `getMySubscription` | `POST /subscription/getMySubscription` | token | The caller's plan, limits and live history quota — one call for the paywall and the account page. |
| `createCheckout` | `POST /subscription/createCheckout` | token | Start a purchase; returns a `txn_…` reference plus the provider's instructions or redirect URL. |
| `confirmCheckout` | `POST /subscription/confirmCheckout` | token | Ask the provider whether a reference was paid, and activate it if so. Never trusts the query string. |
| `cancelMySubscription` | `POST /subscription/cancelMySubscription` | token | Stop the next renewal, keep the paid days (`cancelAtPeriodEnd`). |
| `getMyAiUsage` | `POST /aiUsage/getMyAiUsage` | token | The credit meter for the current (or a named) month. |

The admin panel's 22 acts are listed separately in [Roles and the admin panel](#roles-and-the-admin-panel).

**Request shape**: `{ "details": { "set": { ... }, "get": { ... } } }`; the token goes in the `token` header. `set` is validated by the act's validator; `get` drives the projection via `selectStruct(model, depth)`.

**Computed responses** (an act that assembles a shape rather than returning a model row) declare that response as the validator's `get` and pass the result through `pickByGet(result, get)` from `@lib`. `pickByGet` is a recursive inclusion projection applied after the database read: it keeps only the leaves the caller asked for, so the generated request type and the actual response always agree. A list act's `get` describes **one row**; the `{ rows, total, page, limit }` wrapper is always returned, and computed columns (`planCode`, `usage`, `subscribers`, …) are merged in after per-row projection.

**Client transport**: `typeGeneration: true` emits `declarations/selectInp.ts`, which exports the standard `lesanApi` fetch client (POST body `{ model, act, details }`, `{ success, body }` envelope) plus the `ReqType` request/response tree. Mobile consumes these directly by wrapping `lesanApi`; do not add another HTTP or server-state library. Projection fields inside an act's `get` validator must be declared as `enums([0, 1])` (or `selectStruct`), never as their output type — otherwise the generated `get` type is unusable as a projection (see `login`/`register`).

> **Two consumers, both byte-identical.** `mobile/src/lib/generated/selectInp.ts` and `front/src/types/declarations/selectInp.ts` are vendored copies, and each app treats a mismatch as a bug. **Regenerating declarations here is a breaking change for both clients**, not just a backend edit: the next `npm run check` in `front/` fails at `scripts/check-declarations.mjs` until the copy is refreshed, and the copy must be refreshed byte for byte (no reformatting). Adding an act therefore lands as a backend commit followed by one commit per client — see `front/AGENTS.md` for the web half.

**`syncLocalData` behavior** (idempotent):
1. Resolve the caller's entitlement **once for the whole batch** and count what is already stored.
2. Drop rows whose `clientId` the server already has — **before** the quota is applied, so a retried batch never reports known rows as "skipped by your plan".
3. Accept the remaining sessions **newest-first**, up to `historyEntries`; the overflow is skipped, not refused (see [Quota enforcement](#quota-enforcement)).
4. Resolve the caller's Track by `contentHash` + `user._id`; skip the row if there is none.
5. Insert the session/annotation with its `track` and `user` relations wired.
6. For sessions, `$inc` the parent Track's `totalPlayCount` and `totalListenTimeSec`, and set `lastPlayedAt`.
7. If `set.settings` is present, merge it as a **snapshot** (`mergeSetting(..., "snapshot")`): it is last-write-wins on `setting.updatedAt`, and omitted fields mean defaults because the device sends every field.
8. Return `{ syncedSessions, syncedAnnotations, syncedPlaylists, syncedContextPlays, syncedOnlineCollections, syncedSettings, settings, historyQuota, historySkipped, playlistsQuota, playlistsSkipped, crossDeviceSync }` plus a `clientId -> serverId` mapping per collection.

Runs are processed before sessions so a session that names one can be linked to a row that already exists. Playlists and online collections need nothing resolved first: a playlist carries content hashes, and a collection carries its own key. Every batchable row follows the same shape — idempotent on `clientId`, last-write-wins on `updatedAt`, and a `deleted` flag that removes the server row rather than resurrecting it.

**Settings on sync.** `syncedSettings` is `1` only when the incoming snapshot was applied and `0` when it was absent or lost LWW. The authoritative `settings` object is returned on every call, so a sync doubles as a settings pull. A newer server value (`settings.updatedAt > local.settingsUpdatedAt`) is applied locally; otherwise the local values stay. Resending the full snapshot on every sync is safe because the merge is atomic, idempotent, and ignores equal timestamps. Both `updateMySettings` and `syncLocalData` share `src/settings/mergeSetting.ts`; do not duplicate the LWW logic.

Unknown `contentHash` rows are skipped (the device registers the track first). Never surface partial failures as a blocking error — the device retries.

---

## Roles and the admin panel

Two roles plus the default, normalised by `roleOf()`:

| Role | Can | Cannot |
|---|---|---|
| `user` | Everything listener-facing | Any admin act |
| `support` | Every admin **read** act | Any admin mutation |
| `admin` | Everything | — (but cannot demote or suspend themselves) |

The split is the whole point of having two roles: a support agent needs to see a listener's history and payments to answer a ticket, and nothing more. Granting a subscription or deleting an account is not a support action, so a support token cannot do it **even if the panel offers the button**.

Guards live in `utils/roles.ts` and are **synchronous** (`requireSupport` / `requireAdmin`), because the caller is already in context. `requireActive` is the listener-side counterpart: a `suspended` account is refused on every write and still allowed every read, so the app can show "your account is read-only: <reason>" instead of entering a 401 retry loop. `deleted` is refused outright by `setUser`.

**Schema ≠ folder.** Lesan routes on `(schema, act)`, and a synthetic `admin` schema would have to be a model to exist. So admin acts are registered under the real schema they operate on:

| Schema | Acts |
|---|---|
| `user` | `adminListUsers`, `adminGetUser`, `adminUpdateUser`, `adminDeleteUser`, `adminResetUserPassword`, `adminGetUserHistory` |
| `playbackSession` | `adminGetOverview`, `adminGetTimeseries`, `adminGetTopTracks`, `adminGetRetention` |
| `plan` | `adminListPlans`, `adminUpsertPlan` |
| `subscription` | `adminGrantSubscription`, `adminRevokeSubscription`, `adminListSubscriptions` |
| `billingTransaction` | `adminListTransactions`, `adminConfirmTransaction`, `adminRefundTransaction` |
| `adminAuditLog` | `adminListAuditLogs` |
| `platformSetting` | `adminGetPlatformSetting`, `adminUpdatePlatformSetting` |
| `aiUsage` | `adminGrantAiCredits` |

### Panel conventions

- **List acts return `{ rows, total, page, limit }`**, not a bare array. The listener acts keep their bare-array convention; an admin table needs a total to paginate. `pageArgs()` clamps `limit` to 1–200.
- **A list act's `get` describes one row.** Rows are filtered with `pickByGet(row, get)`; the wrapper and the computed columns (`planCode`, `subscription`, `usage`, `subscribers`) are always returned because the table needs them to render a row.
- **`safeUserProjection()` is an allow-list.** An inclusion projection built from an arbitrary `get` could ask for `password` (the schema's `excludes` only applies to relations, not to a direct read), and an exclusion projection would return every other field. Filtering the request through `SAFE_USER_FIELDS` is the only shape that cannot leak. `safeUserStruct()` builds the matching `get` validator from the same list.
- **`textFilter()` escapes the search before it becomes a regex.** Without it, `(` typed into the search box is an invalid pattern that throws, and `.*` scans the collection.
- **Filters handle legacy rows.** `role=user` and `status=active` match documents where the field is absent too, or the panel would show an empty list on a pre-RBAC database.
- **Analytics are derived, never stored.** There is no counters collection; every figure is an aggregation over the rows that define it, so it cannot disagree with the history it summarises. `active` means "listened", not "logged in" — a login is not engagement in an offline-first player.
- **`adminDeleteUser` requires `confirmEmail`.** A destructive act with an irreversible result must not be one mis-click away, and a confirmation dialog the client draws is not a guard: the API refuses the call that skipped it. It purges per collection (subscription first, track last) and **keeps billing transactions**.
- **`adminUpsertPlan` merges limits and refuses to archive a plan with live subscribers**, the same reasoning as refusing to delete the last admin: the plan row is what describes a subscriber's tier.
- **Every mutation calls `recordAudit()`.** It is best-effort and awaited; a failed audit write must not roll back the action it describes, but a silent one would make the panel lie.
- **`adminResetUserPassword` returns the generated password exactly once** and never writes it to the audit log.

---

## Entitlements and billing

`src/entitlements/` answers one question — *what is this account allowed right now?* — and every ingest path asks it before writing.

- **`resolveEntitlement(userId)`** returns `{ planCode, planTitle, isPaid, limits, subscriptionStatus, currentPeriodEnd?, cancelAtPeriodEnd, autoRenew, startedAt?, grantMode?, usageCaps? }`.
- **No subscription row means free.** Registration writes no subscription, so absence is the free tier rather than a broken record.
- **Free is a plan row too.** Its limits are read from the `free` plan on every resolution, so an admin edit takes effect immediately. `FALLBACK_LIMITS` applies only when the row is missing entirely (fresh database, or someone archived it) — and it falls back to *limits*, never to *no limits*, because a missing row must not open the paywall.
- **The clock wins over `status`.** A row that still says `active` after its `currentPeriodEnd` is expired. Expiry is written lazily on read (there is no scheduler); the write is best-effort and never blocks the answer, which is computed from the timestamps either way.
- **A usage grant is resolved against live counts.** Only the capped resources are counted, so a normal subscription pays no extra queries. A cap overrides the plan limit for that resource; when any count reaches its cap the whole grant expires and the account falls back to free (the same lazy write as the clock).
- **A subscriber whose plan row vanished degrades to the free limits**, not to unlimited. Erring towards "no paywall" on a missing document is how a data mistake becomes free Pro for everyone.
- `canonicalLimits()` normalises any stored shape; a number is always compared `>= 0` before it is enforced, so an old plan document cannot accidentally mean "zero".

### Quota enforcement

The cap is enforced in `syncLocalData`, and the failure mode is **skip, never refuse**:

- Rows the server already has are removed **before** the quota is applied. A device resends its batch whenever a response is lost, so counting those duplicates as "skipped by your plan" would tell the listener their history was refused when it is already stored — the one message that must never be wrong.
- What is left is accepted **newest-first**, and the overflow is skipped. The batch still succeeds: a rejected sync would be retried forever and would also lose the annotations and runs travelling with it.
- **Deleting the oldest server rows to make room was considered and rejected.** The listener already had that history, and a paywall must not be the reason it disappears.
- The response always carries `historyQuota` and `playlistsQuota` (`{ limit, used, remaining, unlimited }`, with `limit: -1` for unlimited) plus `historySkipped` / `playlistsSkipped`, which is what the app turns into an upgrade prompt. They are returned on **every** sync, not only when something was skipped, so the account screen's meter is always current.
- Playlists are gated only on **new** rows: a capped plan can still rename and delete, so a listener never gets stuck with a list they cannot fix.
- `registerTrack` checks `maxTracks` on new rows only; `createPlaylist` checks `playlists`.

### Money

- **The price comes from the plan row, never from the request**, and the amount is copied onto the transaction at checkout so a later reprice cannot change what a listener was asked to pay.
- **`completeTransaction` claims `pending → paid` with a conditional update**, so two confirmations racing cannot both extend the period; the second reports `alreadyProcessed`. If activation then fails, the claim is **rolled back to `pending`** — a payment that bought nothing must stay retryable.
- **`confirmCheckout` never trusts the query string.** A listener returning from a payment page is making a *claim*; the answer comes from the provider's API, keyed by our reference.
- **`activateSubscription` extends rather than replaces.** A renewal of the same plan starts where the paid time ends; a change of plan starts now. One row per listener, updated in place, so "what plan is this account on?" is one lookup and cannot return two answers.
- **`revokeSubscription` has two modes.** `immediate: true` (admin revoke, refund, abuse) writes `currentPeriodEnd` to the present so the very next sync sees the free cap; the default (listener cancel) only sets `cancelAtPeriodEnd` and keeps the paid days. Both write `canceled` rather than deleting the row.
- **Guards ask "is there a running subscription", not "is it paid".** A comped tier has a price of 0 and still auto-renews in the model; refusing to revoke or cancel it would leave those accounts with no way off the plan except deleting the listener.
- **`adminGrantSubscription` goes through the same transaction path** with `provider: "manual"`, so a comped month and a paid month leave the same audit trail and the same kind of receipt. The `note` is what distinguishes them.
- **A grant is a plan plus one amount.** `mode: "forever"` has no end; `mode: "duration"` takes `{ value, unit }` (day/week/month/year) and ends on a calendar date, extending from the current end when the same plan is already running; `mode: "usage"` takes one or more caps and ends as soon as any capped resource reaches its ceiling. Repeating a usage grant replaces the caps with the new set. Omitting `mode` keeps the legacy one-interval grant.
- **A usage cap counts stock, not flow.** `historyEntries: 15000` means 15,000 stored sessions in total, including rows that predate the grant. The AI meter is deliberately not a cap: AI will be a balance-based system, not a plan resource.
- **A reached usage cap ends the whole grant.** The row is lazily written `expired` and the listener falls back to the free plan (keeping the rows that already exist), the same way the clock ends a timed period.
- **`adminRefundTransaction` writes the ledger first, then revokes access.** A failure between them leaves a refund the operator can see and finish, rather than a silent loss of access with no record of why.
- Providers live in `src/billing/providers/`: `manual` (operator confirms the reference) and `stripe` (Checkout Sessions; `verify` requires `payment_status === "paid"` **and** `client_reference_id === reference`). `BILLING_PROVIDER` selects the default; the client may name one only when it is offering a choice.

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
5. Shared settings travel inside the same batch as a full snapshot (`settings.updatedAt = settingsUpdatedAt`). The merge is snapshot LWW; after the response the device applies the server values only when `settings.updatedAt > local.settingsUpdatedAt`. The web reads `getMySettings` after login and writes with `updateMySettings`; it does not need `syncLocalData` for settings.

The backend must be **idempotent** (`clientId` unique index) because the device may resend a batch after a dropped response.

---

## Development

```bash
# run from the back/ directory

deno task start        # start Lesan server (default port 1405)
deno task dev          # hot reload
deno task seed         # bootstrap plans/indexes + demo user + first admin + sample content
deno task test         # listener-facing hurl suite (requires a running server)
deno task test:admin   # seeds, then the admin/billing/entitlements hurl suite
deno task test:all     # both suites
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
- `BILLING_PROVIDER` — `manual` (default) or `stripe`
- `STRIPE_SECRET_KEY`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` — only read by the Stripe provider

`bootstrap()` runs before `runServer` and is idempotent: it inserts the two default plans **only when their code is absent**, creates the platform row on first read, and confirms the analytics/admin indexes. None of it overwrites an operator's decision, so a restart is safe on a live database. The implementations live next to their domain — `src/entitlements/defaultPlans.ts`, `src/platform/setting.ts`, `src/db/indexes.ts` — and `src/bootstrap.ts` only fixes the order.

**The first admin comes from the seed, not from an endpoint.** `deno task seed` creates `admin@pejvak.app / password123` (and promotes an existing account with that email). There is deliberately no public "make me an admin" act — that endpoint would *be* the security model. Afterwards, admins promote each other from the panel. **Change that password before exposing the server.**

The Lesan playground is available at `/playground` in development. `typeGeneration: true` regenerates `declarations/` on server start.

---

## Testing

- E2E tests are [hurl](https://hurl.dev) files under `http/`:
  - `deno task test` — `http/e2e.hurl`, the listener-facing suite (62 requests).
  - `deno task test:admin` — seeds, then `http/admin.hurl` (73 requests): RBAC, plans, quota enforcement, the full money path, forever/duration/usage grants, AI credits, suspension, analytics, the audit trail, the platform switches and the destructive-act guards.
  - `deno task test:all` — both.
- Both suites are **re-runnable against the same database**: every fixture is created under a `{{unique}}` suffix (injected per run by the task), and `admin.hurl` deletes its own listener and archives its own throwaway plan at the end. It uses a dedicated `e2e-cap` plan rather than editing `free`, so a failed run can never leave the real paywall at 2 entries.
- Each act should have at least one hurl assertion. The highest-value tests are: session ingest + aggregate updates, idempotent re-sync, quota skip-vs-refuse behaviour, annotation position accuracy, and projection correctness.
- Backend work is not "done" until `deno check mod.ts`, `deno lint`, and `deno fmt --check` pass, and the act's hurl steps are green.

---

## Conventions

- **Strict TypeScript. No `any`.** Use the generated Lesan types and `MyContext`.
- One model per file in `models/`; one domain folder per act group in `src/`.
- Register every new model in `models/mod.ts` and instantiate it in `mod.ts`; register every new domain's setup function in `src/mod.ts`.
- Validators (`*.val.ts`) are written before implementations (`*.fn.ts`), always with a `get` projection.
- **A `get` projection block is a closed allow-list.** Every leaf is a projection flag (`enums([0, 1])`), never an output type. Adding a field to a response without adding it to `get` means a client that asks for it gets a validation error — the `syncLocalData` quota fields were caught by `admin.hurl` exactly this way. For computed shapes, enforce the request with `pickByGet` after the read; a validator alone does not strip anything.
- Import models from `@model`. In `models/`, import pure-field mixins from their own file (e.g. `../utils/createUpdateAt.ts`) so the model layer does not pull in the `@lib` barrel (which imports `mod.ts` and creates a cycle); in `src/` acts, import helpers from `@lib`.
- Put throwaway scripts in `ignore-scripts/`. Never commit `declarations/` or `.env` files.
- Commits (only when explicitly asked): Conventional Commits + Gitmoji. Never use `git reset`.

---

## Roadmap (next backend work)

1. **AI features themselves** — the meter (`getMyAiUsage`), the plan allowance and the `aiEnabled` switch all exist; what is missing is the acts that spend credits and the code that decrements `creditsUsed` atomically.
2. **Recurring billing.** Checkout is one-off per period today. A Stripe subscription + webhook (`invoice.paid`, `customer.subscription.deleted`) would make renewal automatic instead of operator-driven.
3. **A scheduled sweep.** Expiry is lazy (written on the next entitlement read). A cron that expires `past_due`/`active` rows keeps the panel's numbers honest for accounts nobody touches.
4. **A support-role UI** and per-operator action attribution beyond `actorEmail` (a real `AdminUser` model) if the panel grows past a handful of operators.
5. **Export / GDPR delete-account self-service** — the purge logic exists in `adminDeleteUser`; a listener-facing version needs a confirmation flow and a grace period.
