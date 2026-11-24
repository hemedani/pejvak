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
