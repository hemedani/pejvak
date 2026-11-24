# Prompt 01 — Listener Channels (backend brief & decisions)

Append-only. Sector: `back/`. Roadmap: [`../plans/01-listener-channels.md`](../plans/01-listener-channels.md).
Android: [`../../android/docs/prompts/07-listener-channels.md`](../../android/docs/prompts/07-listener-channels.md).

## Original brief (owner's words, condensed)

> Add a huge new feature — the most advanced in the project. Users can create their own **channels**
> and upload the **podcasts and audiobooks they have created**. The new audios are **public and
> free**; there are **no private channels or audios at all**. Channels have **at least one category**.
> Audios have **one category and several tags**. Channels can have **gallery, bio, donation link,
> website, social media addresses, etc.** Channels can have **several playlists**, and each playlist
> can have **several audios** — *"the playlist almost acts like a folder for us."* Every playlist has
> **one category and several tags**. *"The channels concept is completely different from online
> resources: online resources are free available resources, but channels are for user-created audios."*
> Respect `back/AGENTS.md`, the Lesan data models, and the relationship definitions.

## Decisions log (append-only; never rewrite history, add the missing condition)

**D1 — Channels are first-party, hosted, public, free.** The server stores and serves the uploaded
bytes. This is the single fact that separates `channel`/`channelAudio` from `onlineCollection` (which
stores only addresses because a third party signs expiring URLs). Therefore `channelAudio.audioUrl` is
**required and durable**, not a re-resolved cache. *(owner: "channels are for user created audios")*

**D2 — No privacy, no price, anywhere on this surface.** There is deliberately **no `isPublic` field**
on channel/playlist/audio and **no** checkout path. A boolean that can only be `true` is a placeholder
that invites a bug; the absence encodes the rule. Donation links point out to the creator's own page —
Pejvak never handles that money. *(owner: "public and free … we don't want private channels/audios")*

**D3 — Channel → playlist → audio, single containment.** A `channelPlaylist` is a **folder** (the
owner's word), so an audio lives in exactly one folder and a folder in exactly one channel. Many-to-many
curation was considered and **rejected for v1** because it breaks the folder metaphor and needs a join
model. *(owner: "playlist almost acts like a folder")*

**D4 — `channelPlaylist` ≠ the existing `playlist`.** The personal `playlist` is private, device-synced,
and references the listener's own `track` ids. The new `channelPlaylist` is a public folder grouping
`channelAudio` rows. They share a word and **must not** share a model, an act, or a table.

**D5 — Categories and tags are client-catalogue slugs, not server enums.** Following
`User.setting.languageCode`, we store the slug the client sends and never validate it against a
server-side list, so a new category needs no backend deploy and an unknown code never fails a read.
Channel = `categories: string[]` (**min 1**, enforced in the act); playlist & audio = `category: string`
(exactly one) + `tags: string[]` (several). *(owner: "channels ≥1 category; audios one category +
several tags; playlists one category + several tags")*

**D6 — Channel metadata is embedded arrays/objects, not new models.** `gallery: string[]`,
`socials: array({platform,url})`, `donationUrl`, `websiteUrl`, `bio`, `contactEmail` live inline on
`channel` — the same embedded-array style as `playlist.items` and `plan.features`. A new social
platform is a new `platform` value, not a schema change.

**D7 — `contentHash` stays the audio identity.** A `channelAudio` carries the device-computed
SHA-256(first 1 MB + size). Dedup is per channel; and because history/annotations already key on
`contentHash`, a listener's sessions and notes follow a channel episode with **no new sync path**.

**D8 — Denormalise `channel` onto `channelAudio`, derived from the folder.** The audio links to its
`channelPlaylist` (its folder) *and* carries `channel` + `user` so a public channel page and an
ownership check are each one indexed filter — the same reason `playbackSession` carries both `track`
and `user`. The `publishChannelAudio` act **derives** `channel` from the folder and refuses a folder the
caller doesn't own; the client never chooses the channel. (Mirrors `saveOnlineCollection` deriving
`clientId`.)

**D9 — Public browse is tokenless.** `listChannels`/`getChannel`/`listChannelAudios`/`getChannelAudio`/
`listChannelPlaylists` are anonymous reads (like `getPlatformStatus`) so a signed-out listener can
discover and play. Every public read filters `status:"active"`.

**D10 — Moderation via `status:"active"|"removed"`.** Operator takedown hides content from public reads
without destroying bytes or history; a creator's own delete is a **hard, leaf-first** delete
(audios → playlists → channel), per the `hardCascade` rule. Admin mutations call `recordAudit()`.

**D11 — Creation is metered as a plan limit, not a constant.** New `plan.limits`: `channels`,
`channelAudios`, `storageBytes`. Free = 3 / 100 / 2 GiB; Pro = 10 / unlimited / 50 GiB. Over the cap:
**skip-and-report** (a quota object like `historyQuota`), never destroy existing content. *(domain rule:
limits are data; a quota never deletes.)*

**D12 — Upload transport is an OPEN decision (CH-UP).** No file route exists in `back/` today.
Recommended: a dedicated Deno multipart route `/uploads/channel` that authenticates via the same
`token` header, streams to `MEDIA_STORAGE` (`local` dir for dev, `s3` for prod), returns a durable
`audioUrl`; `publishChannelAudio` then stores metadata only. Presigned-URL (B) is the scale fallback;
base64-in-act (C) is rejected. **Resolve this before building CH-UP2.** Byte cleanup on delete is a
deferred sweep, not inline.

**D13 — Deferred, listed so nothing is silently dropped:** play/listen aggregates (CH-AGG), follow/
subscribe, comments/ratings, server-side transcoding. None are v1; each is an explicit future item.

**D14 — CH-UP RESOLVED (build phase): the upload transport is a Lesan act, not a separate Deno route.**
The §5/D12 assumption "no file route exists in `back/`" was true of *this repo*, but two sibling Lesan
projects (`katiraei/ziwound`, `madani/nejat/lesan`) prove Lesan `@hemedani/lesan@^0.2.3` — the exact
version `back/` pins — already parses `multipart/form-data` **inside an act**: the validator declares
`set.formData: instance(FormData)`, the framework merges the request's `FormData` into `details.set`
(see `src/core/utils/checkWants.ts`), and `runServer({ staticPath: ["/uploads"] })` serves the bytes
back for streaming. So `uploadChannelMedia` is **one more act** (`src/channels/uploadChannelMedia/`),
authed by the same `preAct:[setTokens,setUser,requireActive]`, covered by `declarations/` type-gen, and
requiring no bespoke HTTP plumbing. The client POSTs multipart to `/lesan` with a `lesan-body` JSON
field (`{model,act,details}`) plus the `file` part. This supersedes D12's option-(A) "dedicated Deno
route" — same streaming/`MEDIA_STORAGE` semantics, but native to Lesan. Option (C) base64 stays
rejected for audio (a multi-MB episode in a JSON body blows the request budget); note `nejat` uses
base64 only for small images, which is not our case. Durable URL is formed from `MEDIA_BASE_URL`
(absolute in prod, root-relative `/uploads/...` in dev) so it never bakes a host into stored rows.
Byte cleanup on delete reuses the `nejat` `storedFiles.ts` idea: a path-traversal-guarded
`removeStoredBytes` in `src/channels/media.ts`, run by the delete acts (and available to the deferred
sweep), never unlinking outside `./uploads`.

**D15 — Creator and operator share one act per operation; no parallel `admin*` acts (owner directive,
build phase).** The first build shipped six separate `admin*Channel*` acts (mirroring the panel's
`admin*User` convention). The owner rejected that: Lesan's act pipeline (`preValidation → validator →
preAct → fn`) already gives each concern its place — the **validator** carries data validity, and the
**tenant boundary + business rules** live in `preAct`/`fn`. So one act can serve both roles. The 6 admin
acts were deleted; their capability folded into the shared acts via `src/channels/authz.ts`:

- `rowScope(who, id, {write})` → `{_id, "user._id": userId}` for a creator, `{_id}` for an admin. The
  boundary is the *query*, so it cannot be forgotten the way a missing `requireAdmin` on a twin could.
- `statusScope(who, requested)` → `{status:"active"}` for anon/creator, unconstrained/filterable for an
  operator. `optionalAuth` (`utils/optionalAuth.ts`) lets the public reads elevate an operator who presents
  a token.
- `updateChannel` now accepts `status`/`reason` but **refuses them for a non-admin** (a creator must not undo
  moderation); `deleteChannel`/`deleteChannelAudio` allow cross-tenant for an admin, require `confirmName`
  on a cross-tenant delete, and `recordAudit()` on operator mutations.

This supersedes the §4/§8 "admin acts under real schemas" design for *this* feature. It is deliberately NOT
`if (isAdmin) skip all checks`: the admin branch only widens query scope + unlocks `status`; validation,
audit and the destructive-confirm still apply. (The genuinely-different-shape panel reads like
`adminListUsers` remain separate — this is the same-resource CRUD case only.)

**D16 — Lesson: Lesan's request context is a process-wide singleton, so an optional-auth act MUST scrub
`user` on the no-token path.** `context.ts` keeps `let context` module-level and never resets it per
request. The first `optionalAuth` "skipped" when no token was present — which left the *previous* request's
`context.user` in place, so an anonymous `getChannel` inherited an admin identity and saw `removed` rows.
Caught by `channels.hurl`. Fix: on the missing-token branch, `setContext({ user: undefined })`. Acts that
always run `setTokens` are immune (it throws on a missing token). Documented in `back/AGENTS.md`.

## Non-negotiables carried from AGENTS (restated for this feature)

- Strict TypeScript, no `any`; one model per file; validator before implementation; `get` is a closed
  allow-list.
- One-directional relations only — never define the reverse on the parent.
- Integer seconds for durations; `contentHash` identity; JWT in the `token` header (no Bearer).
- Regenerating `declarations/` is a **breaking change for `front/` and `mobile/`** — refresh the
  vendored copies byte-for-byte in their own commits.
- Backend work is done only when `deno check mod.ts`, `deno lint`, `deno fmt --check` pass and the act's
  hurl steps are green.
