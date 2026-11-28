# Prompt 09 — Channels upload crash + creator/online UX round (Android brief & decisions)

Append-only. Sector: `android/`. Roadmap: [`../plans/09-channels-upload-online-round.md`](../plans/09-channels-upload-online-round.md).
Follows Plan 08 (Channels & Discovery UX).

## Original brief (owner's words, condensed)
1. The "add new audio for channels" page crashes the app the moment it opens.
2. On the home Online tab, changing the language does not fetch the channel resources from the server.
3. The hub always shows the "+" create button even when a channel already exists; when we have a
   channel we should see a "manage" button instead of create.
4. Adding a sound to a folder is not ideal: we must pick which folder it goes into and define a
   default sort order; many inputs (e.g. the language for the new sound) should be select boxes;
   the whole upload flow needs an overhaul. (Backend is live — give an enhanced prompt if needed.)
5. When online, check the server for online things: the History page should sync the last item from
   the server immediately, and the Notes page should show the first page from the server on entry
   without an extra refresh.
6. The Discover Browse tab does not show the channels; instead it shows the new audio from the channels.
7. The Sign-out button in Settings does not work properly; open a modal that asks about clearing
   local data when signing out.

## Decisions log (append-only)
**D1 — The upload crash is the frosted-in-body render-node cycle, not a logic bug.** `ScreenFrame`
marks its `content` as the backdrop source; a `GlassChip(frosted=true)` placed there samples the
Backdrop whose source is itself → infinite `prepareTreeImpl` recursion → native `SIGSEGV` (no Kotlin
crash report). This is the same class that closed the channel detail + manage screens (Plan 07 §5g).
The upload route reintroduced it. Fix = non-frosted in-body chips; frosted chrome stays legal only in
`header`/`subHeader`/`GlassSheet` (separate windows). No device is needed to know the cause; the
on-device confirmation is the owner's.

**D2 — Language change re-fetches, it does not server-filter.** `back/src/channels/listChannels`
filters by `category`/`q`/`status`/`sort` only — there is no `languageCode` argument, and channels are
public across languages. The home shelf already filters the mirror by `languageCode` client-side. The
defect is purely that `setLanguage` never re-pulls, so the mirror can be stale for the new language.
Fix: `setLanguage` → `refreshChannels()`. No backend change (verified against the live server).

**D3 — "Manage instead of create" is a header affordance, not a new route.** The hub keeps one primary
action that reflects ownership: `+` create when the listener owns nothing, else a manage action that
opens My channels (where each owned channel exposes folders/episodes/delete and a further `+`).
Ownership is read from the mirror's `isMine` rows (`observeMyChannels`), refreshed on entry when signed
in, so creating a channel flips the button without a restart.

**D4 — The upload form becomes structured via a shared `SelectField`, not bespoke dropdowns.** Enumerated
inputs (folder, category, language) use one design-system primitive that opens a `GlassSheet` option
list (the same shape as `LanguagePickerSheet`), so the create page, the episode editor and the channel
editor stay visually identical. Categories are a client catalogue (`CHANNEL_CATEGORIES`) because the
server stores `category`/`categories` as unvalidated strings by design (Plan 07 D5); a saved value
outside the catalogue still round-trips as the selected label.

**D5 — Default sort order already exists server-side; the client only surfaces it.** `publishChannelAudio`
sets `position = set.position ?? folder.audioCount`, i.e. append to the end when omitted. The overhaul
exposes an editable position field pre-filled with "after the last episode" so the creator can pin an
order; no schema or act change is needed.

**D6 — Online-first reuses the existing push+pull, gated on a session.** History and Notes call
`SyncRepository.syncAll` (push pending, then pull) on entry/resume when a token is present, then reload.
It is best-effort and never throws, so an offline or refused sync leaves the local view intact. Notes
already observe annotations live, so the pull surfaces without a manual reload; History reloads after
the sync completes. No second transport path, no new act.

**D7 — Discover Browse shows channels, not episodes.** The owner's mental model of "Browse" is the
channel directory; the Plan 08 UX-D01 episode shelf read as unrelated audio. The primary Browse shelf
becomes the public channel list (cards → channel detail, filtered to the selected language), above the
online sources. Episode playback still lives on the channel detail screen (D1/D7 of Plan 07).

**D8 — Sign-out is a sheet with an explicit, default-off local wipe.** A bare confirm dialog gave no
feedback and no way to clear the device. The new `GlassSheet` confirms sign-out and offers
"Erase everything stored on this device" (off by default). Clearing uses `PejvakDatabase.clearAllTables`
plus a best-effort delete of the downloaded channel files; sign-out always clears token + session +
cached user and cancels sync. The wipe is destructive and opt-in, never implied by a plain sign-out.

**D9 — No backend prompt this round.** Every requested behaviour is achievable against the live
backend as-is (verified: `listChannels` returns `languageCode`/`categories`; `publishChannelAudio`
defaults `position`). If the owner later wants a server-side language filter on `listChannels` for
large directories, that is a separate, optional enhancement — not required by any item here.

## Follow-up brief (owner's words)
"Notes still show nothing even though I created several (presumably on the server). I want the app to
check the server whenever we enter a page (Notes/History) while online, with an elegant loading
indicator consistent with our design language, and to sync whatever the server has into local."

## Decisions log (append-only, continued)
**D10 — The empty Notes is a silent sign-out, not a broken pull.** Reading the on-device Room DB
(`run-as … settings` + counts) showed `auth.cachedUser` empty and 0 local annotations: the install is
signed out, so `onlineSync` correctly no-ops and the periodic `SyncWorker` exits without a token. The
server pull itself is sound — a live `register → registerTrack → syncLocalData(annotation) →
getMyAnnotations` probe returned `track.contentHash`, the exact field `SyncRepository.pullFromServer`
matches on. So notes created under the account DO come down once signed in.

**D11 — Make the check visible and the dead-end actionable.** Added `SyncWaveLoader` (a `Wave.kt`
drifting crest + caption, motion-gated) shown while a page's entry/resume server check runs, a
non-blocking failure notice with retry, and — when signed out and the list is empty — a sign-in prompt
that opens the account sheet, instead of an unexplained blank. Both `NotesViewModel` and
`HistoryViewModel` now expose `syncing`/`signedIn`/`syncNotice` and observe `AuthSession.token`, so a
sign-in that lands while the tab is open pulls immediately (the live observers surface the rows). The
loading indicator reuses the app's one home for the curve rather than a Material spinner.

## Follow-up brief (owner's words, round 3)
"Still see '+' though I own a channel — should be Manage. The home sync button is always visible; show
it only when there is something to sync — it says 1 pending and never clears, even after a full
reinstall. Tapping a Discover tab (not swiping) sometimes leaves a sliver of the old screen. The
channel editing modal still uses old inputs — select boxes aren't selects. Add an 'add audio' button
next to the tabs when viewing my own channel."

## Decisions log (append-only, continued)
**D12 — The '+' was a signed-out clobber, not a missing feature.** `refreshChannels()` set
`isMine = (creatorId == myId)` unconditionally; with no session `myId` is null, so every public pull
flipped owned channels back to `isMine=false`. The hub's `hasOwnChannel` then read false. Fix: a
signed-out pull preserves the mirror's existing `isMine`; ownership is only recomputed when a session
id exists. (The owner's install is signed out — the same root cause as the empty Notes — so this also
re-arms the manage button the moment a session is present.)

**D13 — The phantom "1 pending" was an open run.** The badge counted `context_plays` rows with
`ended_at IS NULL`, but `runSync` only pushes runs that have ended (`run.endedAt ?: continue`), so the
run you are currently listening to sat in the count forever and the home button never reached
`UpToDate`. The count query now requires `ended_at IS NOT NULL`, matching the engine. Sessions already
gated on `ended_at`; this closes the same gap for runs.

**D14 — The pager is the single source of truth for the tab.** The Discover chips wrote `setPage` and a
second `LaunchedEffect(state.page)` animated the pager back from the VM; while `animateScrollToPage`
was in flight, `snapshotFlow { currentPage }` emitted the intermediate page, re-set the VM, and
re-triggered the animation — cancelling it mid-scroll (the "sliver"). The chips now animate the pager
directly and the VM only mirrors `currentPage` for persistence — the same discipline AGENTS documents
for a screen's own tabs.

**D15 — Select boxes everywhere an input is enumerated.** The upload page used `SelectField`, but the
channel editor still had a free-text language box and a `TagInput` category field, and the folder
editor a free-text category. Channel language → `SelectField`; channel categories → a toggleable
`CategoryMultiSelect` over `CHANNEL_CATEGORIES` (keeps any saved off-catalogue value); folder category
→ `SelectField`. Consistent with D4.

**D16 — Add-audio belongs on the owned channel page, beside the tabs.** The manage hub had upload, but
the owner wants it one tap from the channel itself. `ChannelDetailScreen` shows an "Add audio" chip in
the folder-tab row only when the channel `isMine`, filing into the folder currently shown (or the first
on the "All" tab) via the existing upload route.
