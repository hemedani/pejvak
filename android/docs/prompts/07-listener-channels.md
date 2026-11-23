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

## Non-negotiables carried from android AGENTS

- Offline-first; sync never blocks or errors the UI; integer seconds; `contentHash` identity; JWT in the
  `token` header (no Bearer); device-only prefs never sync.
- **Zero Kotlin warnings** + JVM tests green is the ship gate; on-device light/dark/gesture verification
  is **always the owner's**, never claimed here.
- Never touch `mobile/`. Backend lands before the client.
