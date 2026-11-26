# Prompt 07 — Listener Channels (Android brief & decisions)

Append-only. Sector: `android/`. Roadmap: [`../plans/07-listener-channels.md`](../plans/07-listener-channels.md).
Backend: [`../../back/docs/plans/01-listener-channels.md`](../../back/docs/plans/01-listener-channels.md).

## Original brief (owner's words, condensed)

Users create their own **channels** and upload the **podcasts and audiobooks they made**. New audios are
**public and free**; **no private channels/audios**. Channels have **≥1 category**; audios have **one
category + several tags**; channels can have **gallery, bio, donation link, website, social media, etc.**
Channels have **several playlists**, each holding **several audios** — *"the playlist almost acts like a
folder."* Every playlist has **one category + several tags**. *"Channels are completely different from
online resources: online = free available resources; channels = user-created audios."* The native
`android/` app is the product; `mobile/` (RN) is deprecated and untouched.

## Decisions log (append-only)

**D1 — Reuse the online streaming path, not a new player.** A channel audio is a stream from a URL we
host, so it materialises as a `Track(origin = Online, streamUrl = audioUrl, contentHash = <hash>)`. The
player, session state machine, `NowPlayingSheet`, history, stats and annotations all work unchanged
because they key on `contentHash`. No second playback code path.

**D2 — Channels are read-cached, never device-owned.** The phone mirrors server channel/playlist/audio
rows in Room for offline browsing (keyed by server id, with `cachedAt`), but they are **never** in the
`syncLocalData` push queue — the listener doesn't own them. Only the listener's **own playback** of a
channel audio syncs (a normal `PlaybackSession`). Creator writes are direct act calls, not the offline
batch.

**D3 — `channelPlaylist` ≠ personal `playlist`, and channels ≠ online resources.** Three distinct
concepts; the UI keeps them in different places (Discover online shelf vs. the new Channels hub vs. the
Library's personal playlists). No shared screen state or model.

**D4 — Creator actions require a session and route through the existing auth modal.** Creating a channel
or uploading needs a signed-in user. When signed out, the action opens the round-13 non-blocking
`AuthSheet` (register/login) rather than a hard gate — the app is never interrupted.

**D5 — Design system governs every surface.** `GlassSheet` for all modals (a titled sheet always passes
`icon`); a screen's own tabs are a bounded `HorizontalPager` (the channel's playlists), never a
hand-rolled swipe; rows use `ListRow`/`ActionCluster`; chips use `GlassChip`; upload progress uses the
app's own `WaveProgressBar`, not Material's `Slider`/`ProgressBar`. All strings in `strings.xml`; all
colours from `ui/theme/`; new glyphs behind `Icon`/`ICON_GLYPHS` and pinned in `IconCatalogTest`. Light +
dark from day one; motion gated on `useMotionEnabled()`.

**D6 — Upload UX is device-first, then server.** Pick a file via SAF, compute `contentHash`/`durationSec`/
size on-device (same code as the importer), show progress, POST bytes to the backend upload route, then
`publishChannelAudio` with the returned durable `audioUrl`. An over-cap upload is a **non-blocking**
`InlineNotice`, never a blocking error or a crash.

**D7 — `ContextType.Channel` is a pending decision.** Prefer reusing `Online` with a `channel:` context
key unless history needs to attribute a run to a channel distinctly; either way, Lazy list keys stay
unique by construction (dedupe via `resumableRuns()`), or the app closes.

**D8 — Deferred / not built (explicit, so nothing is dropped):** in-app discovery personalisation
(recommendations), follow/subscribe UI, comments/ratings, in-app audio editing. None are v1.

**D9 — Backend contract is now SHIPPED; this pins the exact act surface the client codes against
(supersedes the "upload route" wording in D6).** Verified against a live Mongo (`back/http/channels.hurl`,
32 requests green). The client talks to `/lesan` with the standard `{ model, act, details:{set,get} }` body
and the `token` header; **every refusal is HTTP 501 with `{ success:false, body.message }`**, so the app
treats a non-2xx/success:false as a handled notice, never a crash.

- **Public (tokenless) reads** — `channel/listChannels`, `channel/getChannel` (by `slug` **or** `channelId`;
  returns the channel plus computed `playlists[]` and a bounded `audios[]` slice), `channelPlaylist/listChannelPlaylists`,
  `channelAudio/listChannelAudios` (scoped by `channelId` and/or `playlistId`, filterable `category`/`tag`/`q`),
  `channelAudio/getChannelAudio` (by `audioId` **or** `contentHash`). List acts return
  `{ rows, total, page, limit }`; a single read returns the row. All filter `status:"active"`.
- **Creator writes** (token) — `channel/createChannel|updateChannel|deleteChannel|getMyChannels`,
  `channelPlaylist/createChannelPlaylist|updateChannelPlaylist|deleteChannelPlaylist`,
  `channelAudio/publishChannelAudio|updateChannelAudio|moveChannelAudio|deleteChannelAudio`.
  `createChannel` rejects empty `categories`; `deleteChannel`/`deleteChannelPlaylist` are leaf-first hard deletes.
- **Upload (replaces D6's "route")** — `channelAudio/uploadChannelMedia` is a **multipart act**: POST
  `multipart/form-data` to `/lesan` with a text part `lesan-body` = the JSON `{model,act,details}` and a
  file part named `file`. It checks `storageBytes` before writing and returns
  `{ audioUrl, mediaPath, mimeType, fileSizeBytes }`. The client then calls `publishChannelAudio` with those
  **plus** the device-computed `contentHash` + `durationSec` (and folder `playlistId`, `category`, `tags`).
  `audioUrl` is the durable stream URL (→ `Track.streamUrl`); `mediaPath` is **server-internal** — do not
  cache or display it. Files are served from `/uploads/...`, so `MEDIA_BASE_URL` makes `audioUrl` absolute
  in prod and root-relative in dev; the client must resolve a root-relative `audioUrl` against its base
  server origin before streaming.
- **Quotas** (free tier: 3 channels / 100 audios / 2 GiB) are skip-and-report — an over-cap create/publish
  is a 501 refusal of the *new* row; existing content is never touched. Surface as a non-blocking upgrade
  notice (D6).
- **Moderation** — an operator can set a channel `status:"removed"`; it then disappears from every public
  read but stays in the creator's `getMyChannels`. The client should render a "taken down" state there.

**D10 — Backend consolidated the operator surface into the shared acts (supersedes any separate
`admin*Channel` endpoints; backend prompt D15/D16).** There are **no** `adminListChannels`/`adminGetChannel`/
`adminUpdateChannel`/`adminDeleteChannel`/`adminListChannelAudios`/`adminDeleteChannelAudio` acts to call.
The operator uses the *same* acts as everyone else:

- **Takedown/restore** = `channel/updateChannel` with `status:"active"|"removed"` (+ optional `reason`) sent
  with an **admin token**. A creator sending `status` is refused (501) — so the app must only offer the status
  control to operators, never to owners.
- **Operator reads** = the same `getChannel`/`listChannels`/`listChannelAudios`/`getChannelAudio`/
  `listChannelPlaylists`, now with `optionalAuth`: present an operator `token` and add `status` to `set` to see
  `removed` rows; without a token (or as a normal user) you only ever get `active`. The public surfaces are
  unchanged for the listener.
- **Operator delete** = `channel/deleteChannel` (cross-tenant, needs `confirmName` = the channel name) and
  `channelAudio/deleteChannelAudio`, audited server-side.

Net for the client: the signed-out / signed-in-listener experience is identical to D9; only the (future)
operator panel adds the `status` field and an admin token to the existing act calls. Backend suite is now
34 requests green (`channels.hurl`), with `e2e.hurl` (64) and `admin.hurl` (73) still passing.

## Non-negotiables carried from android AGENTS

- Offline-first; sync never blocks or errors the UI; integer seconds; `contentHash` identity; JWT in the
  `token` header (no Bearer); device-only prefs never sync.
- **Zero Kotlin warnings** + JVM tests green is the ship gate; on-device light/dark/gesture verification
  is **always the owner's**, never claimed here.
- Never touch `mobile/`. Backend lands before the client.

---

## Enhanced implementation prompt — backend is LIVE (start building)

> **Status change:** the backend is deployed and reachable at **`http://46.245.98.207:1405/`**. The
> "backend lands before the client" gate is satisfied — Android work is **unblocked now**. Everything below
> was verified against that live server with read-only probes on 2026-11-24; no data was written to it.

**D11 — Live server verified; this pins the deployed surface and the client config (supersedes any
"backend not ready yet" assumption).** Probed live:
- `channel` schema exposes exactly `createChannel, updateChannel, deleteChannel, getMyChannels, listChannels,
  getChannel` — **no `admin*Channel`** (the D15 consolidation is deployed).
- `channelAudio` exposes `uploadChannelMedia, publishChannelAudio, updateChannelAudio, moveChannelAudio,
  deleteChannelAudio, listChannelAudios, getChannelAudio`.
- `channelPlaylist` exposes `createChannelPlaylist, updateChannelPlaylist, deleteChannelPlaylist,
  listChannelPlaylists`.
- `channel/listChannels` (tokenless) returns the envelope `{"body":{"rows":[],"total":0,"page":1,"limit":2},
  "success":true}` — empty now because no channels exist yet, but the shape is confirmed.
- `/uploads/...` is served (a missing file 404s, i.e. the static route is mounted). **First upload must
  confirm the returned `audioUrl` is actually fetchable** (see the resolution rule below).

### Client configuration
- Point `LesanClient` base URL at `http://46.245.98.207:1405/lesan` (env/build-config it; do not hardcode in
  source — keep a debug/release slot). All acts are `POST /lesan` with body
  `{ "model": <schema>, "act": <name>, "details": { "set": {...}, "get": {...} } }` and the JWT in the
  **`token` header (no `Bearer`)**.
- Envelope: every response is `{ success, body }`. **A refusal is HTTP 501 with `{ success:false,
  body.message }`** — treat non-2xx / `success:false` as a handled inline notice, never a crash or a blocking
  dialog. Reuse the existing `LesanClient` error path.
- **`audioUrl` resolution rule (critical for playback):** the backend returns either an absolute URL (when
  server `MEDIA_BASE_URL` is set) or a root-relative `/uploads/channel/audio/<file>`. The app MUST do:
  `if (audioUrl.startsWith("http")) streamUrl = audioUrl else streamUrl = serverOrigin + audioUrl`. Verify
  which form this deployment returns on the first real upload and pin it.

### Build order (do A1 against the live reads first — it is the fastest proof the wiring works)
1. **A1 — transport + cache (CHAN-D01..D04):** add the three Room entities/DAOs + migration; wrap the
   **public reads** (`listChannels`, `getChannel`, `listChannelPlaylists`, `listChannelAudios`,
   `getChannelAudio`) in `data/remote`; the read-cache repo with `isMine` from the session; the multipart
   upload client. **Acceptance for this step: the Channels hub renders live data from the server.**
   - Kotlin upload = OkHttp `MultipartBody` to `POST /lesan` with two parts: a text part named **`lesan-body`**
     whose value is the JSON `{model:"channelAudio", act:"uploadChannelMedia", details:{set:{kind:"audio"},
     get:{audioUrl:1,mediaPath:1,fileSizeBytes:1,mimeType:1}}}`, and a file part named **`file`** (the picked
     audio). (The `[MultipartFormData]` keyword is hurl-only — irrelevant to the app.) It returns
     `{ audioUrl, mediaPath, mimeType, fileSizeBytes }`; then call `publishChannelAudio` with those **plus**
     the device-computed `contentHash` + `durationSec`.
2. **A2 — listening surfaces (CHAN-U01..U05):** Channels hub (category chips, search, cards, pagination) →
   channel detail (identity, bio, gallery, link actions, playlist `HorizontalPager`) → audio rows that
   **materialise to `Track(origin=Online, streamUrl=audioUrl, contentHash, collectionKey="channel:<id>",
   collectionTitle=name)`** and start a run via the existing engine. Resolve D7 (`ContextType.Channel` vs
   reuse `Online` + `channel:` key) here. Add download-for-offline.
3. **A3 — creator surfaces (CHAN-C01..C06):** "My channels" + New channel; create/edit `GlassSheet`
   (categories ≥1 inline validation — the server refuses empty with 501); manage folders (add/rename/reorder/
   delete); the upload flow (pick → hash/duration → `WaveProgressBar` progress → publish → folder/category/
   tags); edit/move/delete episode; delete channel (leaf-first) with confirm. Over-cap (3 channels /
   100 audios / 2 GiB) → non-blocking `InlineNotice` upgrade prompt, never a blocking error.

### Invariants to honour (from D1–D10, restated for the live build)
- Public reads are tokenless; pass no token for the signed-out browse, and the server pins `status:"active"`.
- Creator writes need a session; signed-out → route through `AuthSheet` (D4), never a hard gate.
- `contentHash` is the identity — compute it on-device (same SHA-256(first 1 MB + size) as the importer) and
  send it on `publishChannelAudio`; a listener's history/notes then follow the episode with no new code path.
- All durations/positions are **integer seconds**.
- Channel content is **never** in `syncLocalData` (D2); only the listener's own playback session syncs.
- `mediaPath` is server-internal — do not cache or display it; stream `audioUrl`.
- Design system governs every surface (D5): `GlassSheet`/`GlassCard`/`GlassChip`/`ListRow`/`ActionCluster`/
  `WaveProgressBar`; new glyphs behind `Icon`/`ICON_GLYPHS` pinned in `IconCatalogTest`; strings in
  `strings.xml`; colours from `ui/theme/`; light + dark from the first commit; motion on `useMotionEnabled()`.

### Open items to verify during integration (flag, don't guess)
- **`audioUrl` form on this deployment** (absolute vs root-relative) — confirm on first upload (see rule above).
- **CORS / cleartext:** the server is `http://` (not https). Confirm the app's network security config allows
  cleartext to this host for testing, and that the production build points at an https origin.
- **Empty state:** the server currently has 0 channels. Seed one (or register a creator) to exercise the
  happy path; do not assume a populated directory.
- On-device light/dark/gesture checks remain **the owner's** — never claimed here.

### Ship gate (unchanged)
`./gradlew assembleDebug` with **zero Kotlin warnings** + JVM unit tests green (`testDebugUnitTest`,
`IconCatalogTest`, contrast contract). Tick each `CHAN-` box + add a `../plans/07-listener-channels.md` §8
row after EVERY small task; update `android/docs/summary.md`.

**D12 — Live server re-run on port 1400 (supersedes the `:1405` base URL in D11; backend D18 redeploy).**
The owner redeployed the backend at **`http://46.245.98.207:1400/`** after shipping D18 (atomic uploads +
deferred byte sweep). The client moves with it: `BuildConfig.LESAN_BASE_URL` is now
`http://46.245.98.207:1400/lesan`. Everything that derives the endpoint from that constant follows
automatically — `LesanClient`, `ChannelUploadClient`, and `ChannelRepository.serverOrigin` (so the D11
`audioUrl` resolution rule now joins `/uploads/...` to `:1400`). **Endpoint-move handling:** bumping the URL
is exactly the trigger for the one-time re-queue (`SyncRepository.ensureEndpointMigrated`, keyed on the
stored `syncEndpoint` vs `BuildConfig.LESAN_BASE_URL`) — it flips `synced`→`pending` once so every row
re-pushes to the new endpoint; safe because `syncLocalData` is idempotent on `clientId`. Cleartext is already
permitted (`network_security_config`); production should still be https. No contract change — the act surface
and `{success, body}` / 501-refusal semantics are unchanged.

**D13 — RETRACT D12's endpoint move: the live server is unchanged at `:1405` (owner correction).** The owner
first reported the redeploy (backend D18) as moving to port 1400, then corrected it — the server is still
**`http://46.245.98.207:1405/`**. `BuildConfig.LESAN_BASE_URL` is therefore `…:1405/lesan` (the 1400 edit was
reverted). D12's mechanics (base-URL-as-migration-key, idempotent re-queue, `/uploads` origin derivation) are
correct in general but described a move that did not happen; this entry supersedes its specifics. **Net mobile
action for backend D18: none** — D18 (atomic `.part`+rename uploads, deferred byte sweep, early size guard) is
purely server-side; the `uploadChannelMedia` act's request/response contract and the 501-refusal shape are
byte-for-byte unchanged, so the client codes against the same surface as D11 pinned.
