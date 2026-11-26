# Prompt 08 — Channels & Discovery UX round (Android brief & decisions)

Append-only. Sector: `android/`. Roadmap: [`../plans/08-channels-discovery-ux.md`](../plans/08-channels-discovery-ux.md).
Follows Plan 07 (Listener Channels).

## Original brief (owner's words, condensed)
1. Channels should show on the home page, above online resources. If there is no channel content
   for the user's selected language, show "Add your first channel and share your audiobooks and
   podcasts," which opens the create-channel page.
2. The "add new sound" modal should become a page — a swipe-down dismisses the modal and the typed
   content is lost.
3. The first-page language box should be exactly the Discover language picker (all 46 languages),
   and the selected language must be saved to the local DB (it asks several times now).
4. The default home tab should be Online once the user has selected and saved a language.
5. Channel audio should be listed on the Discover page, above online resources.
6. Create/Edit channel should appear in the page header on all pages (especially home); we can hide
   the sync button in the home header when everything is already synced.

## Decisions log (append-only)
**D1 — Channels are a first-class discovery surface, not just a hub.** A Channels shelf sits above
the online-resource directory on both the home Online view and Discover, reading `ChannelRepository`
(the read-cache mirror, D2 of Plan 07). Empty-for-language → a create-channel CTA.

**D2 — The upload is a page, not a sheet.** The multi-field, long-running upload flow must survive
navigation; a `GlassSheet` swipes away and discards the draft. It becomes a route. Short-form
create/edit channel stays a sheet (the owner only flagged the upload).

**D3 — One language picker.** The Library first-run + menu language UI reuses the shared
`LanguagePickerSheet` over the full `LANGUAGES` list (searchable), matching Discover. The chosen
language persists (it already writes Room via `setLanguage`); the first-run prompt is gated on
settings being *loaded*, not the pre-load null, so it stops re-asking.

**D4 — Create-channel in the header of every dock page; hide the home sync button when clean.** A
single `onCreateChannel` callback (signed-out → `AuthSheet`, D4 of Plan 07) is passed to each dock
screen header. The home account/sync bubble is hidden when `AccountButtonState.UpToDate`.

**D5 — Non-negotiables carried:** offline-first; channel content never in `syncLocalData`; integer
seconds; `contentHash` identity; design system governs every surface; zero Kotlin warnings + JVM
tests are the ship gate; on-device light/dark is the owner's.
