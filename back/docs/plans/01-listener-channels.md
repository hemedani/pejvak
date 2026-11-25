# Plan 01 — Listener Channels (user-created public audio)

Sector: `back/`. Brief: [`../prompts/01-listener-channels.md`](../prompts/01-listener-channels.md).
Android counterpart: [`../../android/docs/plans/07-listener-channels.md`](../../android/docs/plans/07-listener-channels.md).
Precedence: code > plan > `back/AGENTS.md` > root `AGENTS.md` > docs.

> **Status: B1–B7 implemented and verified.** This file was the contract; the backend now ships all three
> models, the creator/public acts, the multipart upload act (CH-UP resolved — see prompt D14), the
> creator quotas and moderation. `deno check`/`lint`/`fmt` are clean and `http/channels.hurl` passes
> against a live MongoDB (32 requests); `e2e.hurl` + `admin.hurl` still pass. Backend landed **before**
> the client (root AGENTS §Agent Workflow), so `android/` Plan 07 is now unblocked. Every feature ID below
> is implemented or explicitly retired; nothing is silently dropped.

---

## 1. What this is

Listeners can **create their own channels** and **upload the podcasts and audiobooks they have made**.
Everything on this surface is **public and free by construction** — there is no private channel, no
private audio, and no paid audio. A channel is the creator's public shelf; it holds **playlists**, and
each playlist holds **audios**.

This is the most advanced feature in the project because it is the first time Pejvak **hosts and
serves media it did not merely index**. That single fact drives every design choice below.

### 1a. The three "collection-ish" models must never be confused

| Model | Whose thing | Public? | Does the server hold the **bytes**? | Purpose |
|---|---|---|---|---|
| `onlineCollection` | a third party (LibriVox, Archive, …) | n/a (it is a saved *address*) | **No** — audio stays on the source CDN | The listener's *saved shelf* of free external resources |
| `playlist` (existing) | the **listener**, privately | optional `isPublic` (default false) | No — references the listener's own `track`s by id | A personal, device-synced grouping of *their* library |
| **`channelPlaylist` (new)** | a **creator's public channel** | **always public** | **No** — it groups `channelAudio` rows | A *folder* inside a channel that organises uploaded episodes |
| **`channel` / `channelAudio` (new)** | a **creator**, published | **always public** | **Yes** — Pejvak serves the uploaded file | User-created podcasts / audiobooks anyone can browse & play |

The owner's words, verbatim, are the rule: *"the channels concept is completely different with online
resources. The online resources stand for free available resources but the channels are for user
created audios."* And: *"the playlist almost acts like a folder for us."* So `channelPlaylist` is a
**folder**, not the personal `playlist`. The two share a concept-word and **must not** share a model.

---

## 2. Domain rules this feature inherits (non-negotiable, from root + back AGENTS)

1. **`contentHash` is the identity of audio** (SHA-256 of first 1 MB + file size, computed on device).
   A `channelAudio` carries it, so the same episode uploaded twice dedupes, and any listener's
   `PlaybackSession`/`Annotation` keyed by that hash follows it for free.
2. **All positions and durations are integer seconds** (`durationSec`). No floats.
3. **One-directional relations.** The child owns the relation to its parent with `relatedRelations`;
   Lesan auto-creates the reverse. Never define the reverse on the parent too.
4. **Single relations are embedded** and filterable on `user._id` / `channel._id`; do not denormalise
   an id into a plain field when a relation gives it to you.
5. **A `get` projection is a closed allow-list** (`enums([0,1])`/`selectStruct`), never an output type.
6. **Catalogues live in the clients.** Like `User.setting.languageCode`, `category`/`tag` values are
   **not** enumerated server-side — an unknown code must never make a write or read fail. We store the
   slug the client sent.
7. **A quota never destroys data; a derived fact is not stored.** Counts kept for a fast card are
   *informational* (like `onlineCollection.trackCount`), never a second source of truth that can lie.
8. **Money/access ordering** is irrelevant here — channel audio is **free**; there is no checkout path
   for it. Donation links point *out* to the creator's own page; Pejvak never touches the money.

---

## 3. Data model

Three new Lesan models, one file each in `models/`, registered in `models/mod.ts` and instantiated in
`mod.ts`. All three relate to `user` (the creator) so ownership is enforced the same listener-act way
(`"user._id": userId` in the act's own query).

> **Reverse-relation `limit` is a first-page embed size, not a collection size.** Lesan embeds the
> `relatedRelations` array on the parent document, so it must stay small (~50) to respect the 16 MB Mongo
> document cap; everything past the first page is fetched by querying the child model directly (the public
> browse acts do exactly that with their own bounded `page`/`audioLimit`). The numbers below were corrected
> from the earlier draft's 100/500/1000 for this reason.

### 3a. `channel` — `models/channel.ts`

A public, creator-owned shelf.

```
channel_pure
  slug          string()                 // unique, URL-safe, derived from name; stable across renames
  name          string()
  bio           optional(string())       // long "about" text
  categories    array(string())          // REQUIRED min 1 (validated in the act, not by Superstruct)
  languageCode  optional(string())       // primary content language; client catalogue, unvalidated
  avatarUrl     optional(string())       // single tile image
  gallery       defaulted(array(string()), [])   // extra showcase images (URLs)
  donationUrl   optional(string())       // out-link to the creator's own donation page
  websiteUrl    optional(string())
  socials       defaulted(array(object({ platform: string(), url: string() })), [])
  contactEmail  optional(string())       // "and etc." — a way to reach the creator
  status        defaulted(enums(["active","removed"]), "active")   // moderation switch (see §3d)
  audioCount    defaulted(number(), 0)   // informational, maintained by the audio acts
  playlistCount defaulted(number(), 0)   // informational, maintained by the playlist acts
  ...createUpdateAt

channel_relations
  user: { schemaName:"user", type:"single", optional:false, excludes:user_excludes,
          relatedRelations:{ channels:{ type:"multiple", limit:20, sort:{field:"_id",order:"desc"} } } }
```

- **No `isPublic` field.** Public is structural; a boolean that can only ever be `true` is a
  placeholder that invites a future bug ("what if I set it false?"). The absence *is* the decision.
- **`slug`** gives a shareable, rename-stable public address (`/c/<slug>`) and a unique index. The act
  derives it from `name` and de-duplicates (`name-2`, …); the client never sends it on create.
- **`status:"removed"`** exists only for moderation (§3d). A removed channel is hidden from every
  public read but kept on disk; the owner sees it as "taken down" with a reason.
- Indexes: **unique `{ slug: 1 }`** (the model factory's one index); secondaries in `db/indexes.ts`:
  `{ "user._id": 1 }`, multikey `{ categories: 1 }`, `{ status: 1, createdAt: -1 }` for browse.

### 3b. `channelPlaylist` — `models/channelPlaylist.ts`

A **folder** inside one channel. Public.

```
channelPlaylist_pure
  title        string()
  description  optional(string())
  category     string()                 // EXACTLY one (required), client catalogue
  tags         defaulted(array(string()), [])   // several
  sortOrder    defaulted(number(), 0)   // manual order of folders within the channel
  audioCount   defaulted(number(), 0)   // informational
  ...createUpdateAt

channelPlaylist_relations
  channel: { schemaName:"channel", type:"single", optional:false, excludes:shared_relation_excludes,
             relatedRelations:{ playlists:{ type:"multiple", limit:50, sort:{field:"sortOrder",order:"asc"} } } }
  user:    { schemaName:"user",    type:"single", optional:false, excludes:user_excludes,
             relatedRelations:{ channelPlaylists:{ type:"multiple", limit:50, sort:{field:"_id",order:"desc"} } } }
```

- The `user` relation is not redundant: it lets a creator's folder be found, counted and purged
  without walking up to the channel, and lets the act enforce ownership with one filter — the same
  reason `playbackSession` carries `user` even though it also carries `track`.
- Indexes: `{ "channel._id": 1, sortOrder: 1 }` (factory), secondaries `{ "user._id": 1 }`,
  `{ category: 1 }`, multikey `{ tags: 1 }`.

### 3c. `channelAudio` — `models/channelAudio.ts`

One uploaded episode/chapter. Public, free, **served by us**.

```
channelAudio_pure
  contentHash  string()                 // identity (SHA-256 first 1MB + size), computed on device
  title        string()
  description  optional(string())
  category     string()                 // EXACTLY one (required)
  tags         defaulted(array(string()), [])   // several
  audioUrl     string()                 // DURABLE — we host the bytes (the key contrast with online)
  durationSec  defaulted(number(), 0)
  fileSizeBytes defaulted(number(), 0)
  mimeType     optional(string())
  isAudiobook  defaulted(boolean(), false)
  author       optional(string())
  narrator     optional(string())
  artworkUrl   optional(string())       // episode-level art (channel art is the fallback)
  position     defaulted(number(), 0)   // order within its folder
  languageCode optional(string())
  status       defaulted(enums(["active","removed"]), "active")
  createdAt/updatedAt ...createUpdateAt
  // playCount / totalListenSec are DEFERRED (§7, CH-AGG); discovery sorts by createdAt for now.

channelAudio_relations
  channel:         { schemaName:"channel",         type:"single", optional:false, excludes:shared_relation_excludes,
                     relatedRelations:{ audios:{ type:"multiple", limit:50, sort:{field:"position",order:"asc"} } } }
  channelPlaylist: { schemaName:"channelPlaylist", type:"single", optional:false, excludes:shared_relation_excludes,
                     relatedRelations:{ audios:{ type:"multiple", limit:50, sort:{field:"position",order:"asc"} } } }
  user:            { schemaName:"user",            type:"single", optional:false, excludes:user_excludes,
                     relatedRelations:{ channelAudios:{ type:"multiple", limit:50, sort:{field:"_id",order:"desc"} } } }
```

- **`audioUrl` is required and durable.** This is the whole difference from `onlineCollection`:
  online stores only a `pageUrl` *because* a third party signs expiring media URLs, so a stored stream
  URL would rot. Here **we** host the file, so the URL we hand back is stable and is the thing the
  device streams. Document this loudly in the model's doc-comment so nobody "fixes" it into a
  re-resolve path.
- **Containment is single** ("a folder"): an audio lives in exactly one `channelPlaylist`, and that
  playlist lives in exactly one `channel`. The `channel` relation on the audio is **denormalised from
  the playlist** so a public channel page is one indexed query and ownership is one filter. The
  `publishChannelAudio` act **derives** `channel` from the playlist's channel and rejects any request
  whose playlist is not owned by the caller — the client never picks the channel out from under the
  folder. This mirrors how `saveOnlineCollection` *derives* `clientId` rather than trusting it.
- Indexes: `{ "channelPlaylist._id": 1, position: 1 }` (factory), secondaries `{ "channel._id": 1 }`,
  `{ contentHash: 1 }`, `{ "user._id": 1 }`, `{ category: 1 }`, multikey `{ tags: 1 }`,
  `{ status: 1, createdAt: -1 }`.

### 3d. Moderation & the public/free invariant

- Public UGC needs a takedown. `status: "active" | "removed"` on `channel` and `channelAudio` is the
  operator switch; **every public read filters `status:"active"`** and a removed row keeps its bytes +
  history. A creator's own delete is a **hard delete** (leaf-first: audios → playlists → channel, the
  `hardCascade` rule in AGENTS), distinct from an operator removal.
- There is **no** price, currency, entitlement gate, or paywall on any read of channel content. The
  only quota is the creator's storage allowance (§6).

---

## 4. Acts

One folder per act under `src/channels/` (new domain), registered in a `channelsSetup()` added to
`src/mod.ts`. Each act = `mod.ts` + `<name>.val.ts` (validator first) + `<name>.fn.ts`. Authenticated
creator acts use `preAct:[setTokens, setUser, requireActive]`.

### 4a. Creator acts (token, ownership enforced in-query)

| Act | Route `(schema, act)` | Purpose / invariants |
|---|---|---|
| `createChannel` | `channel/createChannel` | Insert caller's channel. Derive+dedupe `slug`; reject if `categories` empty; `status:"active"`; counts 0. |
| `updateChannel` | `channel/updateChannel` | Patch metadata (name, bio, categories ≥1, language, avatar, gallery, urls, socials, contactEmail). Never edits `slug`/`user`/counts. |
| `deleteChannel` | `channel/deleteChannel` | **Hard** delete, leaf-first: the caller's `channelAudio` → `channelPlaylist` → `channel`. Ownership by `"user._id"`. |
| `getMyChannels` | `channel/getMyChannels` | The caller's own channels (incl. any they own), paginated. |
| `createChannelPlaylist` | `channelPlaylist/createChannelPlaylist` | Add a folder to a caller-owned channel; `category` required; `sortOrder` appended. Bumps `channel.playlistCount`. |
| `updateChannelPlaylist` | `channelPlaylist/updateChannelPlaylist` | Patch folder (title, description, category, tags, sortOrder). |
| `deleteChannelPlaylist` | `channelPlaylist/deleteChannelPlaylist` | Hard delete folder + its audios (leaf-first). Bumps `channel.playlistCount`. |
| `uploadChannelMedia` | `channelAudio/uploadChannelMedia` | **Multipart act** (CH-UP2, D14): `set.formData: instance(FormData)`, streams `file` to `./uploads`, checks `storageBytes` **before** writing, returns durable `{ audioUrl, mediaPath, mimeType, fileSizeBytes }`. No DB row — pairing is `publishChannelAudio`'s job. |
| `publishChannelAudio` | `channelAudio/publishChannelAudio` | Create an audio in a caller-owned folder. **Derive** `channel` from the folder; require `contentHash` + `audioUrl` + `category`; dedupe on `contentHash` within the channel; bump `playlist.audioCount` + `channel.audioCount`. |
| `updateChannelAudio` | `channelAudio/updateChannelAudio` | Patch audio metadata (title, description, category, tags, art, author, narrator, position, language, isAudiobook). |
| `moveChannelAudio` | `channelAudio/moveChannelAudio` | Move an audio to another folder **in the same channel** (re-derives `channel`; re-derives counts). |
| `deleteChannelAudio` | `channelAudio/deleteChannelAudio` | Hard delete the row + unlink its bytes via the traversal-guarded `removeStoredBytes` (§5/D14; the deferred sweep stays the object-store path). Bumps counts. |

### 4b. Public browse acts (tokenless, like `getPlatformStatus`)

These are **anonymous reads** so a signed-out listener can discover and play channels — the same
reason `getPlatformStatus` is public. Every one filters `status:"active"` and returns
`{ rows, total, page, limit }`.

| Act | Route | Filters / sort |
|---|---|---|
| `listChannels` | `channel/listChannels` | `category?`, `q?` (name/bio, regex-escaped), `sort` (new/popular-by-count); paginated. |
| `getChannel` | `channel/getChannel` | by `slug` **or** `_id`; returns channel + its active playlists + a bounded newest-audio slice. |
| `listChannelPlaylists` | `channelPlaylist/listChannelPlaylists` | by `channelId`; active only; ordered. |
| `listChannelAudios` | `channelAudio/listChannelAudios` | by `channelId` and/or `playlistId`; `category?`, `tag?`, `q?`; active only; paginated. |
| `getChannelAudio` | `channelAudio/getChannelAudio` | by `_id` **or** `contentHash`; active only. |

Projection: every act's `get` is `selectStruct(<model>, depth)`; the creator's identity is projected
through the embedded `user` **with `user_excludes`** (password/createdAt/updatedAt never leak) and the
public surface exposes only `username`/`displayName`/`avatarUrl`.

---

## 5. Upload & media transport — **the open decision** (CH-UP)

> **RESOLVED (build phase — see prompt D14).** The §5 premise "no file route exists in `back/`" held for
> this repo, but two sibling Lesan projects prove the pinned `@hemedani/lesan@^0.2.3` already parses
> `multipart/form-data` **inside an act** (`set.formData: instance(FormData)`, merged by
> `checkWants.ts`) and serves bytes via `runServer({ staticPath: ["/uploads"] })`. So CH-UP2 is the act
> **`src/channels/uploadChannelMedia/`**, not a bespoke Deno route — same streaming/`MEDIA_STORAGE`
> semantics, native to Lesan, covered by `declarations/`. Verified live: `http/channels.hurl` uploads a
> real file and `deleteChannel` reclaims its bytes through the path-traversal-guarded
> `removeStoredBytes` in `src/channels/media.ts`. The text below is kept as the original decision record.

Lesan acts are **JSON**; there is **no** file/multipart route in `back/` today (verified). Audio files
are large. This must be resolved before any creator flow ships. Options, with a recommendation:

- **(A) Recommended — a dedicated Deno upload route beside the acts.** A single `POST /uploads/channel`
  (multipart) in the server bootstrap that authenticates the same `token` header, streams the bytes to
  object storage, and returns `{ audioUrl, contentHash?, durationSec? }`. The `publishChannelAudio` act
  then only stores metadata + the returned URL. Mirrors the Hawraa pattern of a `/uploads` mirror on
  the Lesan server. Keeps Lesan acts pure JSON.
- **(B) Object-storage presigned URLs** (S3-compatible). The act returns a short-lived PUT URL; the
  device uploads direct to the bucket; a second act confirms. Best for scale, needs bucket creds +
  lifecycle. Defer unless (A) hits a wall.
- **(C) base64 in an act body.** Rejected — a multi-megabyte episode in a JSON body is a memory/timeout
  hazard and breaks the 15 s request budget.

**Storage backend** (env, not committed): `MEDIA_STORAGE` = `local` (a `MEDIA_DIR` on disk, dev) or
`s3` (`S3_BUCKET`/`S3_*`). `MEDIA_BASE_URL` forms the durable `audioUrl` (and `artworkUrl`/`gallery`).
Artwork and gallery images upload through the same route with a `kind` discriminator.

**Retention:** a deleted audio's bytes are removed by a deferred sweep (the roadmap already wants a
scheduled sweep for expiry; reuse it) — never inline in the delete act, so a slow object store can't
hang the request. The DB row is the source of truth; the object is a cache of it.

This section is a **decision to be made in the prompt log**, not code to guess at.

---

## 6. Entitlements — creator quotas (CH-ENT)

Per "limits are data, never constants," hosting costs storage, so creation is metered like history.
Add fields to `plan.limits` (`planLimits_pure`) and resolve them through `resolveEntitlement`:

- `channels` — max channels a creator may own (`-1` = unlimited).
- `channelAudios` — max published audios per creator.
- `storageBytes` — total hosted bytes per creator (sum of `fileSizeBytes`).

Defaults (seeded in `ensureDefaultPlans`, insert-only-if-absent so a restart never overrides an admin):

| Plan | channels | channelAudios | storageBytes |
|---|---|---|---|
| `free` | 3 | 100 | 2 GiB |
| `pro`  | 10 | -1 (unlimited) | 50 GiB |

Enforcement is **skip-and-report, never destroy** (domain rule 7): over the cap, `publishChannelAudio`
refuses *the new row* with a quota object (like `historyQuota`) and leaves existing content untouched.
`createChannel` checks `channels`; the upload route (§5) checks `storageBytes` before accepting bytes.
A suspended (`status:"suspended"`) creator is read-only on their own channels (requireActive already
refuses writes) but their public content stays up — a takedown is moderation, not a billing side
effect.

---

## 7. Deferred / considered-and-not-built (explicit, so nothing is silently dropped)

- **CH-AGG — play/listen aggregates** on `channelAudio`/`channel` (rank "most played"). The data
  already exists in `playbackSession` by `contentHash`; a denormalised counter is a later optimisation.
  Discovery sorts by `createdAt` for now.
- **Follow / subscribe / notifications.** Not requested. Out of scope; revisit only if the owner asks.
- **Comments / ratings / reviews.** Out of scope.
- **Server-side audio transcoding / waveform.** The device computes `contentHash`/`durationSec`; no
  ffmpeg on the server in v1.
- **Cross-channel playlists (an audio in many folders).** Rejected for v1 — "a folder" is single
  containment (§3c). A many-to-many would need a join model and break the folder metaphor.
- **Paid / subscriber-only channels.** Explicitly forbidden by the brief. There will be **no** `isPublic`
  or price on this surface.

---

## 8. Phases & feature IDs (the progress record)

Tick the box + append a row to §9 after **every** small task. Backend lands before the client.

### Phase B1 — Models & registration
- [x] CH-M01 `models/channel.ts` (pure + relations + unique `slug` index)
- [x] CH-M02 `models/channelPlaylist.ts`
- [x] CH-M03 `models/channelAudio.ts`
- [x] CH-M04 register all three in `models/mod.ts` + instantiate in `mod.ts`
- [x] CH-M05 secondary indexes in `db/indexes.ts`; `deno check mod.ts` green
- [x] CH-M06 add `channel_excludes`/`channelAudio_excludes` to `excludes.ts` if relation reads need them

### Phase B2 — Creator acts (channels + playlists)
- [x] CH-A01 `createChannel` (+ slug derive/dedupe, categories≥1)
- [x] CH-A02 `updateChannel`
- [x] CH-A03 `deleteChannel` (leaf-first hard delete)
- [x] CH-A04 `getMyChannels`
- [x] CH-A05 `createChannelPlaylist` (+ playlistCount bump)
- [x] CH-A06 `updateChannelPlaylist`
- [x] CH-A07 `deleteChannelPlaylist` (+ cascade audios, count bumps)
- [x] CH-A08 `channelsSetup()` wired into `src/mod.ts`

### Phase B3 — Audio publish + media upload
- [x] CH-UP1 resolve the upload transport (§5) and record the decision in the prompt log
- [x] CH-UP2 upload route (`/uploads/channel`) + `MEDIA_*` env + storage backend
- [x] CH-A09 `publishChannelAudio` (derive channel from folder, contentHash dedupe, count bumps)
- [x] CH-A10 `updateChannelAudio`
- [x] CH-A11 `moveChannelAudio` (same-channel re-derive)
- [x] CH-A12 `deleteChannelAudio` (+ deferred byte sweep)

### Phase B4 — Public browse acts
- [x] CH-A13 `listChannels` (category/q/sort, active-only, paginated)
- [x] CH-A14 `getChannel` (slug or _id, + playlists + newest-audio slice)
- [x] CH-A15 `listChannelPlaylists`
- [x] CH-A16 `listChannelAudios` (channel/playlist/category/tag/q, active-only)
- [x] CH-A17 `getChannelAudio` (_id or contentHash)

### Phase B5 — Entitlements
- [x] CH-ENT1 add `channels`/`channelAudios`/`storageBytes` to `planLimits_pure` + `canonicalLimits`
- [x] CH-ENT2 seed free/pro defaults (insert-only-if-absent)
- [x] CH-ENT3 enforce in `createChannel`/`publishChannelAudio` (skip-and-report quota objects)
- [x] CH-ENT4 upload route checks `storageBytes` before accepting bytes

### Phase B6 — Moderation (consolidated — see prompt D15)
- [x] CH-ADM1 `status:"removed"` filters on every public read (`statusScope` pins anon/creator to `active`;
      an operator elevated via `optionalAuth` sees all)
- [x] CH-ADM2 **Superseded the separate-`admin*` design.** No `adminListChannels`/`adminGetChannel`/
      `adminUpdateChannel`/`adminDeleteChannel`/`adminListChannelAudios`/`adminDeleteChannelAudio` — the
      operator's powers are folded into the shared acts (`updateChannel` + `status`, `deleteChannel`/
      `deleteChannelAudio` cross-tenant via `rowScope`), gated in the `fn`, audited on operator mutations.
- [x] CH-ADM3 moderation assertions live in `http/channels.hurl` (creator denied `status`; operator takedown;
      public hidden; operator `getChannel` sees `removed`)

### Phase B7 — Tests & declarations
- [x] CH-T1 `http/channels.hurl` — creator + public + quota + ownership-denial + idempotent re-publish
- [x] CH-T2 `deno task test:all` green; `deno check`/`lint`/`fmt --check` clean
- [x] CH-T3 regenerate `declarations/` and refresh the vendored client copies byte-for-byte
      (root AGENTS: this is a breaking change for `front/` + `mobile/` — coordinate the client commit)

---

## 9. Progress log

_(tick a box + append a row after EVERY small task)_

| Task | Done | Note |
|---|---|---|
| Plan authored (design only) | ✅ | No code yet. Upload transport (§5) is the first thing to resolve. |
| CH-UP resolved (D14) | ✅ | Upload is a Lesan act (`instance(FormData)` + `staticPath`), not a Deno route. Verified live. |
| B1 Models + registration (CH-M01–M06) | ✅ | `channel`/`channelPlaylist`/`channelAudio` in `models/`, registered in `models/mod.ts` + `mod.ts`, secondary indexes in `db/indexes.ts`, excludes added. `deno check` green. |
| B2 Creator channel+folder acts (CH-A01–A08) | ✅ | create/update/delete/getMy channels + folder create/update/delete; slug derive/dedupe; leaf-first hard delete via `cascade.ts`; count bumps. |
| B3 Upload + audio acts (CH-UP2, CH-A09–A12) | ✅ | `uploadChannelMedia` multipart; publish (derive channel from folder, per-channel contentHash dedupe, quota), update, move (same-channel re-derive), delete (+ byte reclaim). |
| B4 Public browse (CH-A13–A17) | ✅ | tokenless `listChannels`/`getChannel`/`listChannelPlaylists`/`listChannelAudios`/`getChannelAudio`, all `status:"active"`, paginated. |
| B5 Entitlements (CH-ENT1–ENT4) | ✅ | `channels`/`channelAudios`/`storageBytes` limits + fallback + seeds; quota helpers; enforced skip-and-report in create/publish/upload. |
| B6 Moderation (consolidated, D15) | ✅ | `removed` filter on every public read via `statusScope`; the 6 separate `admin*Channel*` acts were **deleted** and folded into the shared acts (`authz.ts` `rowScope`/`statusScope` + `optionalAuth.ts`); operator mutations audited. `channels.hurl` (34 req) proves creator-denied-status, operator takedown, public-hidden, operator-elevated-read. |
| D17 audit of the other admin domains | ✅ | Verified the shared-act pattern only collapses *duplicates*. Collapsed the one true duplicate (`adminGetPlatformSetting` → `getPlatformStatus`). Kept operator-only acts separate (no user twin) and differently-shaped twins separate; flagged `cancelMySubscription`↔`adminRevokeSubscription` for opt-in. `check`/`lint`/`fmt` clean; `channels` 34 / `admin` 73 / `e2e` 64 all green. |
| B7 Tests & declarations (CH-T1–T3) | ✅ | `http/channels.hurl` (32 requests) green against a live Mongo; `test`/`test:admin` still green (no regression); `check`/`lint`/`fmt` clean; `declarations/` regenerated. **Out of scope for `back/`:** the byte-for-byte refresh of the vendored `front/` + `mobile/` copies is a separate client commit (root AGENTS). |
