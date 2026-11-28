# Plan 09 — Channels upload crash + creator/online UX round (Android)

Sector: `android/`. Brief: [`../prompts/09-channels-upload-online-round.md`](../prompts/09-channels-upload-online-round.md).
Precedence: code > plan > `android/AGENTS.md` > docs. Follows Plan 08 (Channels & Discovery UX).

Owner round (condensed, 7 items): the upload page crashes; the home Online channel shelf does not
re-fetch when the language changes; the hub always shows "create" even when you already own a
channel; the upload form is unstructured (free-text category/language, no folder/sort control);
History/Notes are not online-first; the Discover Browse tab shows channel *episodes* instead of the
*channels*; and sign-out needs a real modal that can also clear local data.

## Feature IDs

### Crash fix
- [x] BUG-01 **Opening the upload page (`ChannelUploadScreen`) crashes the app.** Root cause is the
      documented render-node cycle (`AGENTS.md` §Frosting / `summary.md` §5g): `GlassChip(frosted=true)`
      sits **inside** the `ScreenFrame` body (the backdrop source) at the folder chips and the
      audiobook toggle, so the chip samples itself → native `SIGSEGV` in RenderThread. Make every
      in-body chip non-frosted (frosted chrome is only allowed in `header`/`subHeader`/`GlassSheet`).

### Home Online tab
- [x] UX-02 **Changing the language must pull the channel directory from the server.**
      `LibraryViewModel.setLanguage` only writes the setting; the Online channel shelf filters the
      existing mirror by `languageCode` and never re-fetches, so a language switch shows stale/empty
      data until a cold start. Trigger `refreshChannels()` on language change (the server
      `listChannels` has no language filter — the client filters the freshly pulled directory).

### Channels hub header
- [x] UX-03 **Show "manage" instead of "create" once the listener owns a channel.** The hub header
      always renders the `+` create action. Expose `hasOwnChannel` in `ChannelsViewModel` (from
      `ChannelRepository.observeMyChannels()` + a `refreshMyChannels()` on entry when signed in) and
      swap the primary action: `+` create when none, a manage action (→ My channels) when owned.

### Upload flow overhaul
- [x] UX-04a **A reusable `SelectField`** (design-system primitive): a `TextField`-shaped control with
      a trailing chevron that opens a `GlassSheet` option list. Used for every enumerated input.
- [x] UX-04b **Folder selection is explicit** in the upload page (a `SelectField` over the channel's
      folders, required), not just a strip of chips that can be missed.
- [x] UX-04c **Default sort order is defined** for the new sound: a position field that defaults to
      "append to the end of the folder" (the server already defaults `position` to the folder's
      `audioCount`), editable by the creator.
- [x] UX-04d **Category and language become select boxes** (client catalogue — the server accepts any
      string and never validates these). Add a `CHANNEL_CATEGORIES` catalogue; language uses the
      shared `LANGUAGES`.
- [x] UX-04e **Apply the same select boxes to the episode editor** (category/language) so the create
      and edit forms agree.

### Online-first History & Notes
- [x] UX-05a **History is online-first.** On entry/resume, when signed in, push pending then pull the
      server state (one non-blocking `syncAll`), then reload — so the newest server/local item shows
      without a manual refresh.
- [x] UX-05b **Notes are online-first.** On entry, when signed in, kick the same non-blocking sync;
      the live annotation observer surfaces the pulled rows with no extra refresh.

### Discover Browse
- [x] UX-06 **The Browse tab lists channels, not their episodes.** Plan 08 UX-D01 put a "From creators"
      *episode* shelf on Browse; the owner wants the *channels* there. Render the public channel
      directory (cards → channel detail, filtered to the selected language) as the primary shelf above
      the online sources, replacing the episode shelf.

### Sign out
- [x] UX-07 **A real sign-out modal with an optional local-data wipe.** Replace the bare `AlertDialog`
      with a `GlassSheet` that confirms sign-out and offers an explicit "Erase everything stored on
      this device" opt-in (off by default). On confirm: logout (token + session + cached user), cancel
      sync; when the opt-in is set, clear all Room tables (`clearAllTables`) and best-effort delete the
      downloaded channel files. The global auth surface must reflect the sign-out.

## Decisions
- No Room schema change: `channelAudio.position` / `languageCode` already exist (v3 mirror); the
  upload form only surfaces fields that were already on the wire. So **no migration / no version bump**.
- No backend change is required for this round. `listChannels` filters client-side by language (the
  act has no `languageCode` arg) and `publishChannelAudio` already defaults `position` to the folder's
  `audioCount` (append). Verified against the live server (`http://46.245.98.207:1405`) — see prompt.
- The upload page stays a full route (Plan 08 UX-C02) so a swipe cannot discard the draft; the overhaul
  restructures the body, it does not move it back to a sheet.
- Online-first sync reuses the existing `SyncRepository.syncAll` (push+pull, best-effort, never throws)
  rather than a new transport path; it is gated on a present session token so a signed-out listener
  never fires a doomed request.
- The category catalogue is a client list (the server is unvalidated by design, prompt D5); the
  `SelectField` also allows the creator's existing free-text categories to round-trip (a saved value
  not in the catalogue still shows as the selected label).

## Ship gate
`clean assembleDebug` zero Kotlin warnings + `testDebugUnitTest` green after every small task; tick
the box + a §progress row; update `summary.md`. On-device light/dark + the live create/upload/manage
flow is the owner's.

## Progress log
| Task | Done | Note |
|---|---|---|
| Plan authored | ✅ | Owner round of 7 items over Plan 08 (upload crash + creator/online UX). |
| BUG-01 upload crash | ✅ | `ChannelUploadScreen` body had `GlassChip(frosted=true)` on the folder chips + audiobook toggle — the `ScreenFrame` backdrop-source self-sample → RenderThread `SIGSEGV` (summary §5g). Removed; the whole body is now non-frosted. |
| UX-02 home language re-fetch | ✅ | `LibraryViewModel.setLanguage` now calls `refreshChannels()` after writing the setting; the Online shelf filters the freshly pulled directory by `languageCode`. No backend change (prompt D2). |
| UX-03 manage vs create | ✅ | `ChannelsViewModel` combines `observeMyChannels()` → `hasOwnChannel`, and `refreshMyChannels()` on entry (no-op when signed out). Hub header: `+` create when none, else an `edit` "Manage channels" → My channels. |
| UX-04 upload overhaul | ✅ | New design-system primitive `ui/components/field/SelectField.kt` (TextField-shaped, opens a `GlassSheet` of `SelectOption`s). `ChannelUploadScreen` rebuilt: folder / category / language are `SelectField`s, an explicit order field (blank = server appends), file picker + progress + text fields, all non-frosted. `CHANNEL_CATEGORIES` + `categoryLabel` catalogue in `domain/channel`. `ChannelUploadViewModel` carries `positionInput`+validation and forwards `position`/`languageCode`. Episode editor uses the same selects (UX-04e). |
| UX-05 online-first | ✅ | `HistoryViewModel` + `NotesViewModel` inject `SyncRepository`+`AuthSession`; on entry/resume, when a token is present, a best-effort `syncAll` (push+pull) runs then reloads (History) / lets the live observer surface rows (Notes). Guarded against overlap; never blocks or throws. |
| UX-06 Discover channels | ✅ | `DiscoverUiState.channels` (public, language-filtered) from `observeChannels()`; Browse renders channel cards → channel detail, replacing the Plan 08 episode shelf. `onOpenChannel` wired in the nav host. |
| UX-07 sign-out modal | ✅ | `SettingsScreen` `AlertDialog` → a `SignOutSheet` (`GlassSheet`) with a default-off "Erase everything stored on this device" switch. `SettingsViewModel.logout(clearData)` + new `data/local/LocalDataStore.eraseAll()` (`clearAllTables` + best-effort delete of `files/Channels`,`files/Downloads` + token). `signedOut` flips the shared `AuthSession` so the home surface follows, and Settings pops back. |
| Tests | ✅ | +3 `ChannelModelsTest` cases (`categoryLabel`, catalogue uniqueness/slug-case, `EpisodeDraft` order/language). Suite 532 → 535, 0 failures. |
| Ship gate | ✅ | `clean :app:assembleDebug --no-build-cache` → BUILD SUCCESSFUL, **zero** Kotlin warnings; `testDebugUnitTest` 535/0/0. On-device light/dark + the live create/upload/manage/sign-out flow is the owner's. |

## Follow-up — online-first round 2 (notes still empty)
Owner report: entering Notes still showed nothing despite notes "presumably on the server"; wants a
server check on page entry (Notes/History) while online, an elegant loading indicator in the design
language, and server→local merge.

- [x] UX-05c **Diagnosed the empty Notes.** Read the on-device Room DB (`run-as`): `auth.cachedUser`
      is empty and `annotations` = 0 → the install is **signed out**, so no pull runs (and the
      periodic `SyncWorker` exits quietly without a token). Verified the server pull shape is correct
      via a live `register→registerTrack→syncLocalData→getMyAnnotations` probe: `track.contentHash`
      returns, so a signed-in pull merges notes. The defect was visibility + the silent sign-out, not
      the transport.
- [x] UX-05d **`SyncWaveLoader`** — a design-language loading mark (drifting `Wave.kt` crest + caption,
      motion-gated) shown while the entry/resume server check runs on Notes and History.
- [x] UX-05e **Sign-in affordance on the empty signed-out state** for Notes and History (explains the
      empty list and opens the account sheet), plus a non-blocking failure notice with retry.
- [x] UX-05f **Reactive session** — both VMs observe `AuthSession.token` and pull the moment a sign-in
      lands, so notes/history appear without leaving the tab.

| Task | Done | Note |
|---|---|---|
| Online-first round 2 | ✅ | `SyncWaveLoader` in `ui/components/States.kt`; `NotesUiState`/`HistoryUiState` gained `syncing`/`signedIn`/`syncNotice`; `onlineSync`/`syncThenReload` drive them and observe the token; Notes/History screens render the loader, a retry notice, and a sign-in prompt. New strings + nav-host `onOpenAccount` wiring. `clean assembleDebug --no-build-cache` zero warnings; 535 tests green. On-device signed-in pull + both states are the owner's. |

## Follow-up — round 3 (owner device pass)
- [x] BUG-02 **Hub still shows "+" for an owner.** A signed-out `refreshChannels()` re-marked every
      public channel `isMine=false`, clobbering ownership learned while signed in. Now a signed-out
      pull **preserves** the mirror's prior `isMine` (only recomputes when a session id is present).
      Verified on-device: after a signed-out launch the owned `ProbeChan9` keeps `is_mine=1` → hub shows Manage.
- [x] BUG-03 **Home sync button always visible; a phantom "1 pending" never clears.** The badge counted
      `context_plays` rows with `ended_at IS NULL` (the run you are listening to right now), which the
      engine never pushes. `ContextPlayDao.getPendingSync()` now requires `ended_at IS NOT NULL`, so an
      open run no longer inflates the count; a settled, synced device reaches `UpToDate` → button hides.
- [x] UX-08 **Discover tab chips left the pager half-turned** (a sliver of the old page on one side). The
      chips routed through `setPage` + a `LaunchedEffect(state.page)` that animated back from the VM,
      which raced the `snapshotFlow { currentPage }` feedback and cancelled the scroll mid-way. The chips
      now `animateScrollToPage` directly; the VM only mirrors `currentPage` for persistence.
- [x] UX-09 **Channel/folder editors were still free-text.** `ChannelEditorSheet` language is now a
      `SelectField` and categories a toggleable `CategoryMultiSelect` over `CHANNEL_CATEGORIES`; the
      folder `category` in `PlaylistEditorSheet` is a `SelectField`. (The upload page already used them.)
- [x] UX-10 **No way to add audio from an owned channel page.** `ChannelDetailScreen` gained an
      "Add audio" chip beside the folder tabs (owner only) → the upload route, filing into the folder
      currently shown (or the first on the "All" tab).

| Task | Done | Note |
|---|---|---|
| Round 3 fixes | ✅ | `ChannelRepository.refreshChannels` isMine-preserve; `ContextPlayDao.getPendingSync` ended_at gate; `DiscoverScreen` pager race; `ChannelEditorSheet`/`PlaylistEditorSheet` selects; `ChannelDetailScreen` add-audio chip + nav-host `onUpload` + `channel_add_audio` string. `clean assembleDebug --no-build-cache` zero warnings; 535 tests green. On-device light/dark + signed-in flows are the owner's. |
