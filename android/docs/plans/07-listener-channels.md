# Plan 07 — Listener Channels (Android)

Sector: `android/`. Brief: [`../prompts/07-listener-channels.md`](../prompts/07-listener-channels.md).
Backend counterpart: [`../../back/docs/plans/01-listener-channels.md`](../../back/docs/plans/01-listener-channels.md)
(models `channel` / `channelPlaylist` / `channelAudio`; the acts and the **multipart upload act** — not a
route — all landed there first).
Precedence: code > plan > `android/AGENTS.md` > docs.

> **Status: backend DEPLOYED + live; Android build can start now.** The backend (Plan 01) is implemented and
> now running at **`http://46.245.98.207:1405/`**, verified by read-only probes (the `channel`/`channelAudio`/
> `channelPlaylist` acts and `uploadChannelMedia` are live; `listChannels` returns the `{rows,total,page,limit}`
> envelope; `/uploads/` is served). The upload transport is the `channelAudio.uploadChannelMedia` multipart
> **act** (backend prompt D14). See the prompt's "Enhanced implementation prompt — backend is LIVE" section for
> the client config, `audioUrl` resolution rule, and build order. This is the native feature inventory; every
> `CHAN-` ID ends up implemented or explicitly retired.

---

## 1. What lands on the phone

Two audiences on one surface:

1. **Listeners (anyone, even signed out)** browse public channels, open a channel, see its playlists
   (folders) and audios, and **play** them — exactly like the existing online sources, except the audio
   is streamed from **our** server via a durable `audioUrl`.
2. **Creators (a signed-in listener)** open their own channel, edit its identity/gallery/links,
   organise playlists, and **upload** the podcasts/audiobooks they made.

The channel concept is **not** the Discover "online resources" shelf (third-party free catalogues) and
**not** the personal `playlist` model. It is a distinct, first-party, public, user-created library.

---

## 2. What we reuse (do not re-invent)

| Need | Reuse | Why |
|---|---|---|
| Streaming playback | `Origin.Online` + `Track.streamUrl` path, `PlaybackService`, `NowPlayingSheet`, `WaveSlider` | A channel audio is a stream from a URL we host; the player already streams online tracks. |
| History / stats / annotations | the existing session state machine keyed by `contentHash` | Channel audio carries `contentHash`, so every play records a normal `PlaybackSession` — history, stretches, stats, notes all work with **no new code path**. |
| Read-through cache | the `online_collections`/`OnlineDao` caching pattern (Room) | Server content is mirrored locally for offline browsing, keyed by server id, with a `cachedAt`; it is **never** in `syncLocalData` (the phone doesn't own it). |
| File picking + hashing | the importer's SAF picker + `ContentHash` (SHA-256 first 1 MB + size) + duration probe | An upload is a picked file; identity/duration come from the same device-side computation. |
| Sheets / rows / chips / detail | `GlassSheet`, `GlassCard`, `GlassChip`, `DetailBlock`, `ListRow`, `ActionCluster`, `BubbleButton`, `Icon` | Design-system rule: upgrade shared parts once, don't per-screen-patch. |
| Auth gate for creators | the round-13 non-blocking `AuthGate` + `AuthSheet` | Creating/uploading needs a session; if signed out, the action routes through the existing register/login modal — never a hard takeover. |
| Download (optional) | `DownloadRepository` / download jobs | A channel audio can be cached for offline like an online episode. |

---

## 3. Local data model (Room)

New **read-cache** tables (mirrors of server state; source of truth is the server; no `sync_status`):

- `channels` — `serverId`, `slug`, `name`, `bio`, `categories` (JSON), `languageCode`, `avatarUrl`,
  `gallery` (JSON), `donationUrl`, `websiteUrl`, `socials` (JSON), `contactEmail`, `status`,
  `audioCount`, `playlistCount`, `creatorUsername`, `creatorDisplayName`, `creatorAvatarUrl`,
  `isMine` (bool), `cachedAt`.
- `channel_playlists` — `serverId`, `channelServerId`, `title`, `description`, `category`, `tags`
  (JSON), `sortOrder`, `audioCount`, `isMine`, `cachedAt`.
- `channel_audios` — `serverId`, `channelServerId`, `playlistServerId`, `contentHash`, `title`,
  `description`, `category`, `tags` (JSON), `audioUrl`, `durationSec`, `fileSizeBytes`, `mimeType`,
  `isAudiobook`, `author`, `narrator`, `artworkUrl`, `position`, `languageCode`, `status`,
  `downloadState`, `isMine`, `cachedAt`.
  (The server's `channelAudio` also carries an internal `mediaPath` for byte cleanup — the client never
  reads or caches it; it streams `audioUrl`.)

**Materialising a channel audio into the player** produces a `Track(origin = Online, contentHash =
<the channel audio's hash>, streamUrl = audioUrl, collectionKey = "channel:<channelServerId>",
collectionTitle = channel name)`, so the run/queue/history machinery treats it as a streamed collection
member — the same trick the online sources already use. Add `ContextType.Channel` **only if** the
history attribution needs to distinguish a channel run from a generic online run; otherwise reuse
`Online` with a `channel:` key. (Decision recorded in the prompt log; a Lazy `key` for channel runs must
stay unique by construction — dedupe via `resumableRuns()` like every other context.)

A Room migration bumps the DB version; the schema mirrors the server fields 1:1 so the Lesan acts map
cleanly.

---

## 4. UI surfaces (design-system rules apply to every one)

- **Channels hub** — browse public channels: category filter chips (`GlassChip`), a search field, and
  channel cards (`GlassCard` + `PaletteTile` keyed on `contentHash`/slug). Paginated list.
- **Channel detail** (`ScreenFrame` + `GlassHeader`) — creator identity row, bio, category chips,
  gallery strip, action bubbles for donation/website/socials (open in-app browser), then a
  **`HorizontalPager`** of the channel's playlists (folders) with each folder's audios as rows. Tabs are
  **pages of a pager**, never a hand-rolled swipe (AGENTS rule).
- **Audio row** — `ListRow` with artwork, title, duration, category; tap to play; trailing
  `ActionCluster` (download, notes/AI) exactly like online rows.
- **Creator: my channels** — the signed-in listener's own channels + a **New channel** action.
- **Create / edit channel sheet** — `GlassSheet` form: name, bio, **categories (≥1, required)**, language,
  avatar, gallery (multi-image), donation/website URLs, socials (dynamic platform+url rows), contact
  email. Field chaining via IME actions; inline error line; reuse `TextField`/`PasswordField` primitives.
- **Upload flow** — pick file (SAF) → compute `contentHash`/`durationSec`/size on device → show upload
  progress (the app's own wave/`WaveProgressBar`, not a Material bar) → multipart POST to the
  `channelAudio.uploadChannelMedia` **act** (a `lesan-body` JSON part + a `file` part) → it returns
  `{ audioUrl, mediaPath, mimeType, fileSizeBytes }` → `publishChannelAudio` with those **plus** the device
  `contentHash`/`durationSec` → pick the target folder + category + tags. Over the storage quota → a
  non-blocking inline notice (reuse `InlineNotice`), never a blocking error.
- **Manage channel** — reorder playlists (`sortOrder`), add/rename/delete folders, edit/move/delete
  episodes. Destructive actions confirm (the existing `AlertDialog` pattern).

Every string lives in `res/values/strings.xml`; every colour comes from `ui/theme/`; new semantic icons
(`channel`, `podcast`, `upload`, `tag`, `folder_plus`, …) go behind `Icon`/`ICON_GLYPHS` and get pinned in
`IconCatalogTest`. Light **and** dark from the first commit; motion gated on `useMotionEnabled()`.

---

## 5. Offline / sync posture

- Browsing reads from the Room cache; a pull refreshes it in the background (reuse the `SyncScheduler`
  trigger set: foreground/connectivity). A cold, never-synced device shows channels once it has network.
- **Channel content is never pushed** by `syncLocalData` — the phone is a consumer, not the owner. Only
  the **creator's** writes go to the server, and those are direct act calls (create/update/publish), not
  the offline batch queue.
- **The listener's own playback of a channel audio** still writes a local `PlaybackSession` (pending →
  synced) exactly as any other track — that is the listener's data and it syncs normally.
- Playing a non-downloaded channel audio needs network; a stream failure surfaces as the existing
  online re-resolve/notice path, never a crash.

---

## 6. Feature IDs & phases

Phases build **after** the matching backend phase. Tick + log after every small task.

### Phase A1 — Data cache & transport
- [x] CHAN-D01 Room entities + DAOs + `PejvakDatabase` migration for channels/playlists/audios
- [x] CHAN-D02 Lesan act wrappers in `data/remote` (`listChannels`, `getChannel`, `listChannelAudios`,
      `getChannelAudio`, `listChannelPlaylists`) — reuse `LesanClient`
- [x] CHAN-D03 read-cache repository + pull (mirror online-collection caching); `isMine` from session
- [x] CHAN-D04 upload client (multipart → the `channelAudio.uploadChannelMedia` **act** on `/lesan`,
      bytes served back from `/uploads/...`) + progress callback

### Phase A2 — Listening surfaces
- [x] CHAN-U01 Channels hub screen (category chips, search, cards, pagination) + route + dock/entry
- [x] CHAN-U02 Channel detail (identity, bio, gallery, link actions, playlist pager)
- [x] CHAN-U03 Audio rows + play wiring (materialise to an `Online`-origin `Track`, start a run)
- [x] CHAN-U04 `ContextType.Channel` decision + history attribution (dedupe for Lazy keys)
- [x] CHAN-U05 download-for-offline for a channel audio (reuse `DownloadRepository`)

### Phase A3 — Creator surfaces (require a session; else route to `AuthSheet`)
- [x] CHAN-C01 "My channels" list + New channel
- [x] CHAN-C02 Create/edit channel `GlassSheet` (categories ≥1 validation, gallery, links, socials)
- [x] CHAN-C03 Manage channel: add/rename/reorder/delete playlists (folders)
- [x] CHAN-C04 Upload flow: pick → hash/duration → progress → publish → folder/category/tags
- [x] CHAN-C05 Edit/move/delete an episode; delete a channel (leaf-first) with confirm
- [x] CHAN-C06 Quota/over-cap + moderation-status notices (non-blocking)

### Phase A4 — Design-system & a11y pass
- [x] CHAN-X01 new icons in `ICON_GLYPHS` + `IconCatalogTest` pin
- [x] CHAN-X02 strings.xml (all copy), no colour literals outside theme, RTL-safe per-text content
- [ ] CHAN-X03 light/dark + reduced-motion verified **by the owner on device** (never claimed here)

### Phase A5 — Tests & ship gate
- [x] CHAN-T01 JVM tests for pure logic (cache→domain mappers, `isMine`/status filters, upload
      validation, contextKey derivation) — the existing `domain/` test style
- [x] CHAN-T02 `./gradlew assembleDebug` → **zero Kotlin warnings**; `testDebugUnitTest` green
- [x] CHAN-T03 contrast contract + `IconCatalogTest` pass

---

## 7. Done criteria (per android AGENTS)

A channel feature is done only when: `assembleDebug` passes with **zero Kotlin warnings**, JVM unit
tests for touched pure logic pass, it works offline (browse from cache; stream when online), a creator
upload survives app-kill and retry, and it has been looked at in **both themes** — the last of which is
**always the owner's on-device check**, never signed off here.

---

## 8. Progress log

| Task | Done | Note |
|---|---|---|
| Plan authored (design only) | ✅ | Was blocked on backend B1–B4 and the §5 upload decision. |
| Backend landed → Android unblocked | ✅ | back/ Plan 01 B1–B7 implemented + verified (`channels.hurl` green on live Mongo). Upload is the `channelAudio.uploadChannelMedia` multipart **act**, not a route (backend D14); it returns `{ audioUrl, mediaPath, mimeType, fileSizeBytes }` for `publishChannelAudio`. Docs synced; no Android code yet. |
| Backend DEPLOYED + live-verified | ✅ | Server up at `http://46.245.98.207:1405/`. Read-only probes confirmed the deployed act surface (channel 6 / channelAudio 7 incl upload / channelPlaylist 4; no `admin*Channel`), the `{rows,total,page,limit}` envelope, and `/uploads/` static routing. Prompt gained D11 + an "Enhanced implementation prompt" (client base URL, `audioUrl` resolution rule, Kotlin OkHttp multipart shape, A1→A3 build order, open items). No Android code written yet — A1 is the next step. |
| CHAN-D01 — Room mirror + migration | ✅ | `domain/channel/ChannelModels.kt` (pure: `Channel`/`ChannelPlaylist`/`ChannelAudio` + `ChannelStatus`/`ChannelSocial`, `channelContextKey`, `resolveAudioUrl`, `serverOriginFromBaseUrl`, `channelAudioToTrack`, `channelIsPublic`, `channelSubtitle`) + `ChannelModelsTest` (10 cases). `data/local/ChannelEntities.kt` (3 read-cache entities, no `sync_status`, JSON list columns), `ChannelDao.kt` (3 DAOs), entity↔domain mappers in `Mappers.kt`. `PejvakDatabase` → version 3 + `MIGRATION_2_3`; schema `3.json` exported; DAOs provided in `AppModule` (+ a plain `OkHttpClient` for D04). `compileDebugKotlin` green. |
| CHAN-D02/D03/D04 — transport + cache + upload | ✅ | `data/remote/channels/ChannelRemoteDataSource.kt` wraps the 5 public reads (`listChannels`/`getChannel`/`listChannelPlaylists`/`listChannelAudios`/`getChannelAudio`) through `LesanClient`, parsing the `{rows,total,page,limit}` envelope, the `getChannel` merged `playlists`/`audios`, and the single-row `getChannelAudio`; camelCase flat projections + nested `user` (the shape `channels.hurl` proved live). `data/repository/ChannelRepository.kt`: Room-first `observeChannels`, background pull with `isMine` from the cached session user (inherited by folders/episodes), `loadChannel` with offline cache fallback, `refreshPlaylistAudios`, `toTrack` (D1 materialisation) and `streamUrl` (D11 origin resolution). `data/remote/channels/ChannelUploadClient.kt`: OkHttp `MultipartBody` to `POST /lesan` with `lesan-body` + streamed `file` part + progress, returns `{audioUrl,mediaPath,mimeType,fileSizeBytes}`; a 501 refusal surfaces the server `body.message`. `compileDebugKotlin` green. No UI yet. |
| CHAN-U01..U04 + X01/X02 + T01..T03 — listening surfaces against the live server | ✅ | Hub `ui/screens/channels/ChannelsScreen.kt` + `ChannelsViewModel.kt` (CHAN-U01): `GlassHeader` inline search + `GlassChip` category filters + `ListGroup`/`ListRow`/`PaletteTile` channel cards, Room-first render + live pull on entry/filter/refresh, offline/error → non-blocking `InlineNotice`/`EmptyState`/`SkeletonRows`. Detail `ChannelDetailScreen.kt` + `ChannelDetailViewModel.kt` (U02/U03): identity card (avatar, creator, categories, bio, donation/website/contact via `LocalUriHandler`), folders as **`HorizontalPager` pages** with a chip row (AGENTS pager-not-hand-rolled), episode `ListRow`s that **play** via `CollectionPlaybackLauncher.playOnline` (U04 = reuse `Online` origin + `channel:` context key, D1/D7 — no second playback path). Route `channels` + `channel/{slug}` + a Discover "Channels" entry chip. New glyphs `channel`/`podcast` (`Icons.Rounded.Podcasts`) pinned in `IconCatalogTest` (X01); ~30 `channels_*`/`channel_*` strings, colours only from `ui/theme/` (X02). `ChannelModelsTest` (10 cases) covers contextKey, `audioUrl`/origin resolution, `channelAudioToTrack` identity/run, status filter, subtitle (T01). **Ship gate: `clean assembleDebug` → zero Kotlin warnings; `testDebugUnitTest` → 513 tests, 0 failures** (T02/T03). Deferred: U05 download-for-offline (repo `setAudioDownloadState` hook exists, UI not wired); the gallery **image strip** on the detail (avatar shown, multi-image strip not yet); all creator surfaces C01–C06 (upload **client** built in D04, but no creator UI/`AuthSheet` routing yet); X03 owner on-device light/dark/motion pass. |
| CHAN-C01..C06 — creator surfaces (manage channels from the app) | ✅ | **Writes** added: `ChannelRemoteDataSource` gained `createChannel/updateChannel/deleteChannel/getMyChannels` + the `channelPlaylist` create/update/delete + `publishChannelAudio/updateChannelAudio/moveChannelAudio/deleteChannelAudio` (field shapes pinned to `back/…/channels/*.val.ts`, `getMyChannels` = bare array); `ChannelUploadClient` generalised to `uploadImage` (kind:image). `ChannelRepository` gained a creator layer returning `ChannelOp<T>` (Ok/Failed with the server's `body.message` extracted from the 501 `details`, so quota/validation is a non-blocking notice — D6/D9): `refreshMyChannels`/`createChannel`/`updateChannel`/`deleteChannel` (leaf-first + mirror cleanup), folder CRUD + reorder (`sortOrder` swap), `uploadAndPublish` (device `ContentHashService`+`AudioInspectionService` → multipart upload → `publishChannelAudio`, `durationSec` rounded to integer seconds), `uploadImage`, episode edit/move/delete; `isMine`/`cachedAt` maintained, **never** in `syncLocalData` (D2). Pure `ChannelDraft`/`PlaylistDraft`/`EpisodeDraft` + `parseTagList` (validation mirrors the act rules) + 5 new `ChannelModelsTest` cases. **UI**: `ChannelEditorSheet` (create/edit `GlassSheet`: name/bio/categories `TagInput`/language/avatar+gallery image pickers/donation/website/contact/dynamic social rows, inline validation, `InlineNotice`), `ChannelCreatorViewModel`; `MyChannelsScreen`+VM (owned list, taken-down `StatusSpec`, New); `ChannelManageScreen`+VM (folders add/rename/move/delete + reorder, `EpisodeUploadSheet` with `WaveProgressBar` progress → publish, `EpisodeEditorSheet`, `EpisodeMoveSheet`, leaf-first delete-channel `AlertDialog` confirm); hub header gained My-channels/Create bubbles; detail shows Edit/Manage when `isMine`. Routes `mychannels` + `channelManage/{channelId}`; editor hosted as a shell sibling with one activity-scoped VM; **signed-out create/edit routes to `AuthSheet` (D4)**. ~60 new strings; new glyphs reused (`person`/`add`/`edit`/`folder`/`cloud_upload`/`check`/`delete`/`list`/`chevronUp`/`chevronDown`). **Ship gate: clean `assembleDebug` zero warnings; `testDebugUnitTest` → 518 tests, 0 failures.** Still deferred: U05 download-for-offline UI; the detail gallery **image strip** render (uploads store URLs); X03 owner on-device pass. |
| Crash fix — opening a channel SIGSEGV (RenderThread) | ✅ | **On-device repro (emulator, logged in as owner):** creating a channel worked, but tapping into its detail crashed with a native `SIGSEGV` in RenderThread — a 512-frame `RenderNode::prepareTreeImpl ↔ SkiaDisplayList::prepareListAndChildren` recursion = a **render-node cycle**. Root cause: `GlassChip(frosted = true)` → `FrostedSurface` → `BackdropBlur` samples the `Backdrop`, whose *source* is the `ScreenFrame` body; a frosted chip rendered **inside** that body samples itself. The hub was safe (its frosted chips are in `subHeader`, outside the source); the detail's `ChannelIdentity` category + link chips and the manage screen's "Add folder" chip were frosted **inside** the body. Fix: make those in-body chips non-frosted (sheet chips are a separate window, subHeader/header chips are outside the source — both safe). Verified on the emulator: detail + manage + delete-channel all stable, no crash. Rule added to `summary.md` §5g. |
| Bug fixes — "add folder" no-op + upload refused (D11 pinned), + gallery strip | ✅ | **Add folder (C03):** `ChannelManageScreen.folderEditor` was a `Pair` initialised to `null to null` and gated on `first != null || second != null`, so "Add folder" (which sets `null to null`) never opened the sheet. Made it a nullable holder (`Pair<...>?`, null=closed) — add now opens it. **Upload (C04):** on-device repro (emulator, logged in as owner) showed the upload sheet surfacing the server's **`Invalid JSON in lesan-body field`** — `ChannelUploadClient` built `lesan-body` by string concatenation and the `details` key was malformed (`"details:` missing its closing quote). Rebuilt it with `buildJsonObject` + `json.encodeToString`. **D11 pinned:** the live `uploadChannelMedia` act returns a **root-relative** `/uploads/...` `audioUrl`, while the read acts return the **absolute** `http://…/uploads/...`; `resolveAudioUrl` handles both. **Verified end-to-end on the emulator** (throwaway channel, since deleted): create → add folder → upload a real MP3 → publish → listChannelAudios shows it (absolute URL, HTTP 200 fetch, device contentHash, integer duration) → **play reaches `PLAYING` (state=3, position advancing, completes)**. Added the **gallery image strip** to the detail identity card (U02 completion — renders the stored `gallery[]` URLs via Coil). Cleaned 3 pre-existing Kotlin warnings surfaced by the fuller recompile (redundant `Short.toShort()` in `WaveformTest`; `response.body?.`/`bio!!`/`error ?:` redundant null ops in the channel files). **Ship gate: clean `assembleDebug` zero warnings; `testDebugUnitTest` 518 green.** Remaining in plan: **CHAN-U05 download-for-offline** (the existing `DownloadService` is collection/scope-keyed; a clean single-channel-audio download is a larger follow-on, deliberately not rushed here) + **CHAN-X03 owner on-device pass**. |
| Upload "timeout" fix (client) + backend hardening prompt (D18) | ✅ | Owner reported a non-blocking **"timeout"** notice on uploading real audio. Diagnosed against the live server: a 30 MB `uploadChannelMedia` returned **HTTP 200 / success** in ~72 s (bandwidth-bound; `storeUploadFile` streams, no server cap/timeout) — so the server is fine. The string `timeout` is OkHttp's `SocketTimeoutException`: the app's upload `OkHttpClient` ran with OkHttp's default **10 s** connect/read/write timeouts and aborted the body mid-transfer. **Fix (android):** `AppModule.provideOkHttpClient()` now keeps a 30 s connect timeout but disables read/write/call timeouts for the long upload; pinned by a new JVM `UploadClientTimeoutTest` (deterministic — no flaky UI needed). **Backend:** the aborted-mid-stream case leaves a partial `./uploads` file with no row (orphan bytes, no cleanup) — documented as **D18** in `back/docs/prompts/01-listener-channels.md` (atomic `.part`+rename on size match, unlink on stream error, sweep strays, optional early size guard); no act/contract change. Repro side-effects cleaned (throwaway probe channels deleted; account back to just `safir`). **Ship gate: clean `assembleDebug` zero warnings; `testDebugUnitTest` → 519 tests, 0 failures.** CHAN-U05 download-for-offline still open. |
| Backend D18 shipped → mobile action | ✅ | Owner redeployed the backend implementing D18 (atomic `.part`+rename uploads, deferred byte sweep `deno task sweep:uploads`, early size guard). **No mobile change required** — the `uploadChannelMedia` act's request/response contract and the 501-refusal shape are byte-for-byte unchanged, so the client codes against the same surface (prompt D13). The only edit was reverting a brief, mistaken `:1400` base-URL bump back to the real `:1405` (owner correction). **Verified on the emulator against the live `:1405` server:** Channels hub pulls live (shows the real `safir`, no load error); sync re-push succeeded. **Ship gate: clean `assembleDebug` zero warnings; `testDebugUnitTest` 519 green.** Known minor gap noted (not fixed here, not a reported bug): the channel read-cache mirror does not prune server-deleted rows on a paginated pull (a deleted channel lingers in cache until a full unfiltered page-1 refresh could safely prune). CHAN-U05 download-for-offline still open. |
| CHAN-U05 — download-for-offline for channel audio | ✅ | A focused single-episode download (the online `DownloadService` is collection/source-keyed and would violate D3 by treating channels as online resources). **Data:** `channel_audios` gains `local_path` (migration `MIGRATION_3_4`, schema `4.json`); `ChannelAudio.localPath`; `ChannelAudioDao.setDownloadState/getDownloading`. **Domain:** `channelAudioToTrack(…, localFileUri)` plays the downloaded file (`fileUri`/`downloadPath` = local, `availability=Present`) while keeping the stream URL for fallback; pure `channelDownloadFileName(contentHash, mimeType)` keys the leaf on the identity. **Repo (`ChannelRepository`):** `downloadEpisode` (HttpURLConnection GET on the resolved `audioUrl` → atomic `.part`+size-verify+rename under `filesDir/Channels/`, progress, cancel via disconnect, `downloading→complete/failed/cancelled` on the mirror, duration re-probe), `cancelEpisodeDownload`, `deleteEpisodeDownload`, `interruptedDownloads`; `toTrack` prefers the local file when present. **UI:** each episode row in `ChannelDetailScreen` gained a Download/Cancel/Delete action + a `StatusSpec` (Downloading %/Downloaded/Failed/Paused) via `ChannelDetailViewModel` (`downloads` map, `downloadUiFor`, `download/cancelDownload/deleteDownload`); reuses existing `download_*` strings + `pause`/`download`/`trash` glyphs. **Verified live on the emulator against `:1405`** (throwaway channel, since deleted): download → file landed `files/Channels/<hash>.mp3` (1,440,540 B), row showed **Downloaded**, then **airplane-mode ON → Play reached `state=PLAYING`, position advancing** (offline from disk). +2 `ChannelModelsTest` cases. **Ship gate: clean `assembleDebug` zero warnings; `testDebugUnitTest` → 521 tests, 0 failures.** Remaining: CHAN-X03 owner on-device pass only. |
