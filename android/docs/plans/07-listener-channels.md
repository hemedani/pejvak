# Plan 07 — Listener Channels (Android)

Sector: `android/`. Brief: [`../prompts/07-listener-channels.md`](../prompts/07-listener-channels.md).
Backend counterpart: [`../../back/docs/plans/01-listener-channels.md`](../../back/docs/plans/01-listener-channels.md)
(models `channel` / `channelPlaylist` / `channelAudio`; the acts and the **multipart upload act** — not a
route — all landed there first).
Precedence: code > plan > `android/AGENTS.md` > docs.

> **Status: design only — no Android code yet, but UNBLOCKED.** The backend (Plan 01) is implemented and
> verified against a live MongoDB, including the upload transport (resolved as the
> `channelAudio.uploadChannelMedia` multipart act, not a `/uploads/channel` route — see backend prompt D14).
> This is the native feature inventory; every `CHAN-` ID ends up implemented or explicitly retired.

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
- [ ] CHAN-D01 Room entities + DAOs + `PejvakDatabase` migration for channels/playlists/audios
- [ ] CHAN-D02 Lesan act wrappers in `data/remote` (`listChannels`, `getChannel`, `listChannelAudios`,
      `getChannelAudio`, `listChannelPlaylists`) — reuse `LesanClient`
- [ ] CHAN-D03 read-cache repository + pull (mirror online-collection caching); `isMine` from session
- [ ] CHAN-D04 upload client (multipart → the `channelAudio.uploadChannelMedia` **act** on `/lesan`,
      bytes served back from `/uploads/...`) + progress callback

### Phase A2 — Listening surfaces
- [ ] CHAN-U01 Channels hub screen (category chips, search, cards, pagination) + route + dock/entry
- [ ] CHAN-U02 Channel detail (identity, bio, gallery, link actions, playlist pager)
- [ ] CHAN-U03 Audio rows + play wiring (materialise to an `Online`-origin `Track`, start a run)
- [ ] CHAN-U04 `ContextType.Channel` decision + history attribution (dedupe for Lazy keys)
- [ ] CHAN-U05 download-for-offline for a channel audio (reuse `DownloadRepository`)

### Phase A3 — Creator surfaces (require a session; else route to `AuthSheet`)
- [ ] CHAN-C01 "My channels" list + New channel
- [ ] CHAN-C02 Create/edit channel `GlassSheet` (categories ≥1 validation, gallery, links, socials)
- [ ] CHAN-C03 Manage channel: add/rename/reorder/delete playlists (folders)
- [ ] CHAN-C04 Upload flow: pick → hash/duration → progress → publish → folder/category/tags
- [ ] CHAN-C05 Edit/move/delete an episode; delete a channel (leaf-first) with confirm
- [ ] CHAN-C06 Quota/over-cap + moderation-status notices (non-blocking)

### Phase A4 — Design-system & a11y pass
- [ ] CHAN-X01 new icons in `ICON_GLYPHS` + `IconCatalogTest` pin
- [ ] CHAN-X02 strings.xml (all copy), no colour literals outside theme, RTL-safe per-text content
- [ ] CHAN-X03 light/dark + reduced-motion verified **by the owner on device** (never claimed here)

### Phase A5 — Tests & ship gate
- [ ] CHAN-T01 JVM tests for pure logic (cache→domain mappers, `isMine`/status filters, upload
      validation, contextKey derivation) — the existing `domain/` test style
- [ ] CHAN-T02 `./gradlew assembleDebug` → **zero Kotlin warnings**; `testDebugUnitTest` green
- [ ] CHAN-T03 contrast contract + `IconCatalogTest` pass

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
