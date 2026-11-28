# Plan 08 — Channels & Discovery UX round (Android)

Sector: `android/`. Brief: [`../prompts/08-channels-discovery-ux.md`](../prompts/08-channels-discovery-ux.md).
Precedence: code > plan > `android/AGENTS.md` > docs. Follows Plan 07 (Listener Channels).

Owner round (condensed): surface channels where listeners already are, stop losing work in
swipe-away modals, and make the language choice stick.

## Feature IDs

### Home (Library)
- [x] UX-H01 Channels shelf on the home Online view, **above** the online-resource sources.
- [x] UX-H02 Empty channels (no content for the selected language) → a CTA card "Add your first
      channel and share your audiobooks and podcasts" → opens the create-channel page.
- [x] UX-H03 Language picker = the shared `LanguagePickerSheet` (all `LANGUAGES`, searchable),
      replacing the 4-option inline list, on both the first-run prompt and the menu.
- [x] UX-H04 Persist the chosen language so the first-run prompt does not reappear (gate it on
      settings actually loaded, not the pre-load null).
- [x] UX-H05 Default the home tab to Online once a language is chosen (already coded; unblocked by H04).
- [x] UX-H06 Hide the home header sync/account button when everything is synced (UpToDate).

### Discover
- [x] UX-D01 Channel episodes listed on Discover, **above** the online resources.

### Creator entry + upload
- [x] UX-C01 Create-channel action in the header of every dock page (esp. home).
- [x] UX-C02 Convert the "add new sound" upload modal into a full-screen page (a swipe-away sheet
      lost the in-progress form).

## Decisions
- Channels stay a read-cache mirror (D2); the home/discover shelves read `ChannelRepository` and
  pull live. A channel card opens the channel detail route; an episode plays through the existing
  online launcher (D1/D7).
- "Online resources" = the `OnlineSource` directory (third-party). Channels go above it on both
  surfaces; the empty-for-language state points at creating a channel (the user's own content).
- The upload becomes a route (`channelUpload/{channelId}?playlistId={playlistId}`) so back-saves
  state and a swipe cannot discard it; the create/edit channel **sheet** stays (it is short-form),
  but nothing is lost — the owner only flagged the upload.

## Ship gate
`clean assembleDebug` zero Kotlin warnings + `testDebugUnitTest` green after every small task; tick
this box + a §progress row; update `summary.md`. On-device light/dark is the owner's.

## Progress log
| Task | Done | Note |
|---|---|---|
| Plan authored | ✅ | Owner round of 6 UX items over Plan 07. |
| UX-H01/H02/H03/H04/H05/H06 — home | ✅ | `LibraryViewModel` now combines `channelRepo.observeChannels()` and `settings.loaded`; the Online page renders a channel shelf above the source directory, or a `CreateChannelCta` when the selected language has none. First-run + menu language use the shared `LanguagePickerSheet` over all `LANGUAGES`; the prompt is gated on `settingsLoaded` so a saved language never re-asks, and the default view flips to Online once a language exists. Header hides the account/sync bubble on `AccountButtonState.UpToDate`; create-channel is always there. |
| UX-D01 — Discover episodes | ✅ | `ChannelAudioDao.observeAll` + `ChannelRepository.observeAudios/cachedChannels/refreshDiscoverAudios` pull a bounded (12 channels × 6) newest-first slice from the mirrored channels serving the saved language. `DiscoverViewModel` joins it with the channel rows and exposes `ChannelEpisodeCard`s; the Browse page shows "From creators" above the source directory, and a tap plays the channel run through `CollectionPlaybackLauncher` (same `channel:` context). |
| UX-C01/C02 — creator entry + upload page | ✅ | `startCreateChannel` is shared by Library/Discover/History/Notes/AI headers (signed-out → `AuthSheet`). `EpisodeUploadSheet` is deleted; `ChannelUploadScreen`/`ViewModel` are a full route (`channelUpload/{channelId}?playlistId=`) with SAF pick, progress, and publish, and `ChannelManageScreen` reloads on resume so the new episode appears. New channels seed the listener's saved language so the home CTA cannot loop. |
| Ship gate | ✅ | `assembleDebug` green with zero Kotlin warnings; `testDebugUnitTest` green (34 tasks). On-device light/dark is the owner's. |
| Online-source ANR (found during verification) | ✅ | Pre-existing, unrelated freeze: opening the **Shariati** source ANR'd because `OnlineCatalogService` ran `listCollections/getTracks/getCollection` on the caller's (main) thread, `ShariatiAdapter.countEpisodes` parsed every book page, and `parseEpisodes` re-parsed the whole document once **per** `<audio>` (O(audio × tags)). Adapter calls now run on `Dispatchers.Default`; `parseEpisodes` parses once and resolves holders from that list; new `countAudioEpisodes` counts without building titles. Device: Shariati list ~5 s, book ~4 s, no ANR. `ShariatiParserTest` (4 cases); full suite 525/0/0. |
| Channel playback fix (found during verification) | ✅ | A channel episode was never written to `tracks`, so the main player had no `durationSec` (channel page did), the timeline/time maths were dead, `HistoryRepository.join` dropped the session (`?: return@mapNotNull null`), auto-advance/queue resolved null, and the scrubber had no waveform. `CollectionPlaybackLauncher.playOnline` now `insertIgnore`s the ordered tracks before handing ids to the engine (aggregates are never clobbered), and `PlaybackEngine` seeds `durationSec` from the track on load/skip/advance (Media3 still overrides when it reports). Device: safir episode shows **7:48**, position/remaining advance (`0:10 / −7:38`), History shows the episode with listened time, and the `tracks` row has `source_id=channel`. `PlaybackEngineTest` +2 duration-seed cases. |
| Real waveform for channel audio | ✅ client / ✅ backend (live row needs backfill) | Streams cannot be decoded on device, so the scrubber showed the seeded sample. The client reads `channelAudio.waveform` (0..1 peaks), resamples via `wireWaveform`, and `WaveformAnalyzer.provide`s it; `rememberWaveforms` now also writes it to the contentHash-keyed disk cache, so real bars survive restart/offline (the seeded sample is never cached). Backend: `waveformPeaks` (ffmpeg, 160 peaks), `publishChannelAudio` computes, `moveChannelAudio` preserves, `updateChannelAudio` can't touch; `getChannel` returns it via the full pure projection. `adminBackfillChannelWaveforms` filled the live safir row (160 peaks, `updatedAt` untouched). `ChannelAudioParseTest` +2 wire-parse cases, `WaveformTest` +2 `wireWaveform*`. |
| Channel history audit (found during verification) | ✅ | Local sessions **were** being written (30 for one episode), so the write path was fine; the missing piece was sync. Two real defects fixed: (1) a buffer stall (`playing=false, buffering=true`) finalized the session, so a flaky stream split one listen into dozens of 0 s rows — `onPlayerProgress` now keeps the session open across a stall and finalizes only on a real pause; (2) the History tab kept its ViewModel across dock switches and never reloaded, so a session written after the first visit did not appear until a manual refresh — `HistoryViewModel.onResume()` reloads on return (skipping the first resume, which `init` covers). Verified on device: one session per play (no thrash), position/listened time accumulate. **Sync is a separate issue:** the app is signed out (the server DB was reset, the stored JWT was rejected and `restore()` cleared it), so all 323 sessions stay `pending`; signing in resumes the queue. `PlaybackEngineTest` +1 buffer-stall case; suite 532/0/0. |
