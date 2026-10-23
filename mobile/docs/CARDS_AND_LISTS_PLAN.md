# Card & List System — Phase 0 Audit and Implementation Plan

> **Status:** Phase 0 deliverable. **Awaiting approval (D1–D12).** No code has been changed.
>
> **For agentic workers:** This is an audit plus an implementation contract. Sections 1–3 are the design; section 4 is the ordered work. Do not begin a work package until the human partner has accepted the decisions in §1.3. Work one package at a time; run the verification command named by the package before moving on.

**Goal:** Make every card and list in Pejvak obey one system — one anatomy, one set of text tiers, one action-fitting rule, one status vocabulary, one rhythm — so a library of three thousand files and a 200-episode course both read as deliberate, stay fast, and never silently drop a control or a row.

**Architecture:** Keep `Card` (opaque content surface) and `GlassSurface` (floating surface) exactly where they are. Add the missing middle layer: `RowShell` owns the *layout contract* (leading tile, copy, planned action cluster, overflow), and three archetypes compose it — `MediaCard` (shelf/identity), `ListRow` inside `ListGroup` (dense homogeneous sequences), and `RecordRow` (history/run records). Pure decisions — meta joining, pluralisation, status mapping, RTL direction, tile radius, search folding — move into `src/lib` so they are testable without rendering. Long lists move from `ScrollView` + `map` to virtualised lists.

**Tech Stack:** Expo SDK 57, React Native 0.86.3, React 19.2.3, Reanimated 4.5.1, `expo-image`, `expo-linear-gradient`, Jest + React Native Testing Library. No new dependencies.

**Spec:** `../AGENTS.md` (root, authoritative), `AGENTS.md` (mobile), `docs/MOTION_AND_ICON_PLAN.md` and `docs/INPUT_SYSTEM_PLAN.md` (the approved motion and field vocabularies this plan reuses). Where they disagree, the root `AGENTS.md` wins.

## Execution status

| WP | Result |
|---|---|
| 0 — Approval gate | **Complete.** D1–D12 approved. |
| 1 — Tokens, pure helpers, search folding | Complete |
| 2 — `RowShell`, `ListGroup`, `ListRow`, overflow | Complete |
| 3 — History, track detail, facts, stat tiles | Complete |
| 4 — Library, playlists, recent | Complete |
| 5 — Discover, online source/language/collection | Complete |
| 6 — Folder, playlist, smart, missing, import | Complete |
| 7 — States, notices, loading | Complete |
| 8 — Settings, docs, verification | Complete |

**Deviations recorded during execution**

- `state-view.tsx` was built in WP2, not WP7: WP4–WP6 consume it and a module cannot be imported before it exists. WP7 then became the screen sweep.
- A `ListGroup` is one `Card` and cannot span virtualised items. Screens with one homogeneous sequence (folder, playlist, smart, missing, a series in an online collection) keep a `ScrollView` + one group and drop per-row `Reveal`, so no entrance is scheduled for every row. The remaining cost is that one long group mounts together; a future virtualised group surface would close it.
- Playlist reorder actions are priority-0 row actions rather than a fixed trailing cluster, so the plan moves them into the overflow on a narrow phone instead of squeezing the title.
- The import preview uses one `ListGroup` per arriving file: the preview is a `FlatList` with no bounded single sequence to put in one card.

---

## Global Constraints

- **Android only.** Every `eas.json` profile and build script is `--platform android`. Expo Go is how this app is tested. `borderCurve: "continuous"` is a no-op; do not spend a build on it.
- **`Card` is for what the listener reads; `GlassSurface` is for what floats.** The dock, mini-player, sheets, modals, and action menus are the only floating surfaces. A chip row that scrolls with a list is content.
- **Three content tiers, in order:** label (`body`/`title` in `text`) → value (`numeric`/`figure` in `textSecondary`) → detail (`caption` in `textTertiary`). The current `FactList` and the Stats `DetailRow` invert this and must be reconciled (§1.3 D4).
- **Never hard-code a corner.** `radius` is the one even-numbered, strictly-increasing ramp; aliases (`badge`, `tile`, `segment`, `panel`) point into it. `12 / 13 / 16 / 18 / 28` literals in screens are defects.
- **Elevation is a decision.** `Card` is elevated by default; `elevated={false}` inside long lists. Forty-six elevated language cards is noise.
- **Nothing is silently dropped.** `planRowLayout` may reflow an action cluster or move low-priority controls into the overflow menu; it may never hide one without recording it. `cardLayout.test.ts` is the contract.
- **A chip is a filter; a segmented control is a choice.** Mode switches (History Sessions/Collections, Discover Continue/Favorites/Browse) are choices; sort order is a choice. Search facets that carry match counts remain chips.
- **Motion is bounded.** Rows use `Reveal` only for the first screenful (`limit`); no per-row animation in a recycled list; no unbounded decorative loop. `useMotionEnabled()` gates every animation.
- **Every control reaches 44 pt.** `BouncyIconButton` pads small visuals with `hitSlop`; the plan removes 34/38 pt one-offs and stops putting four untested controls in one row.
- **Persian must be folded and shaped.** Search uses `lib/search.ts` (`foldText`, `createSearchIndex`); never `.toLowerCase().includes()` over user-visible text. Text is written with per-string `writingDirection`; no global `I18nManager` flip.
- **Offline-first, integer seconds, no `any`, no new dependencies.** Run `npm run lint`, `npm run typecheck`, `npm test`. Do not start a dev server, emulator, watcher, or build unless explicitly asked.
- **Commits** only when the user says `git commit`. Never use `git reset`.
- **Baseline test failures:** `audioInfo.test.ts` (7), `embeddedArtwork.test.ts` (5), and one `audioTags.test.ts` v2.2 case fail on clean `HEAD` as well. They are media-byte parsers, untouched here; compare against that baseline and do not fix unrelated failures.

---

## Review Focus

These are the five failure modes most likely to reach a listener. Each is checked in the owning work package.

1. **A Persian title is squeezed to two letters, or a control clips.** Only `MediaCard` uses `planRowLayout`. Folder, playlist, history, smart, and online rows hand-roll up to four trailing controls at 34–40 pt and let the title absorb the loss. At 320–360 dp with a Persian title, `playlist/[id]` is the worst case.
2. **A long list drops frames or a row never appears.** `folder/[key]`, `playlist/[id]`, `online/[key]`, `smart/[rule]`, and `missing` render every row in a `ScrollView`; `Reveal` then schedules an entrance for each. A 200-part course mounts all 200 cards at once.
3. **The listener cannot find a Persian language by typing it.** Discover filters with `toLowerCase().includes()` (`discover.tsx:146-152`), so a query using an Arabic yeh/kaf, a ZWNJ, or Persian digits matches nothing — exactly the failure `lib/search.ts` exists to prevent.
4. **The same state says different things on different screens.** "Complete", "Finished", "On device", "Downloaded", "check", "play", an accent border, and a red caption are all hand-mapped in different files. A listener cannot learn one status vocabulary.
5. **A card stops being a card.** `GlassChip` uses the glass fill inside scrolling content, and Discover wraps every language row in an elevated `Card`. On Android's near-white canvas the hierarchy collapses into a flat wall — the same defect the opaque `Card` was introduced to fix.

---

# 1. Scope and decisions

## 1.1 In scope

- One row layout contract shared by shelf cards, dense rows, and history records.
- Two list densities: **shelf** (identity, artwork, wash, progress) and **dense** (a homogeneous sequence inside one grouped card).
- Shared primitives: `RowShell`, `ListGroup`, `ListRow`, `RecordRow`, `RowActions`/`RowActionMenu`, `MetaLine`, `StatusSpec`, `UserText`, `EmptyState`, `InlineNotice`.
- Token ramps for tiles, controls, and bars; removal of screen-level literals.
- Virtualisation of the genuinely long lists; `Reveal limit` everywhere a list can exceed a screenful.
- Persian search folding in Discover; RTL shaping in card titles and headers.
- Empty/loading/offline/error states with distinct copy.
- Accessibility: one role per row, labels/hints for row actions, 44 pt targets, announced states.
- Tests for every pure rule, plus the existing palette and layout contracts.

## 1.2 Out of scope

- Palette colours. This plan uses the existing semantic palette; `tokens.test.ts` thresholds are not weakened.
- The dock, mini-player, player controls, sheets, modals, and the wavy progress bar. They already follow their own approved plans.
- The field system. `TextField` and friends are settled.
- Drag-to-reorder. Playlist reordering stays button-based; a drag gesture is stretch work and would need a new dependency.
- Backend, sync, database, and audio-engine behaviour.
- New online providers, new routes, or new data models.
- Localisation. UI copy remains English; this plan only makes Persian *content* render and search correctly.

## 1.3 Decisions requiring approval

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | **Two densities** | **Shelf card + dense list** | A library row is an identity ("what is this?"); a track inside a course is a sequence ("where am I?"). Today both are cards, so a 30-part course is 30 panels with 8 pt gaps and no grouping. A dense group is one `Card` with hairline-separated rows, which is both faster and easier to scan. |
| D2 | **Tap verb by entity** | **Track plays; container opens; record inspects** | Same-looking cards currently disagree: a Recent track plays on tap, a folder opens, a playlist opens, a history row opens a sheet. The rule becomes predictable: a track's primary verb is play, a container's is open, a recorded listen's is inspect. The accessibility hint states the verb. |
| D3 | **Dense lists for homogeneous sequences** | **Migrate folder, playlist, online collection, smart picks, missing, import, addable tracks** | These are one repeated row shape, often long. Shelf cards remain in Library (tracks/folders), Discover (Continue/Favorites), Playlists (saved + smart), and source listings, where identity and artwork carry the decision. |
| D4 | **Text tiers in readouts** | **Fix `FactList` and Stats `DetailRow` to label-first; document `StatCell` as the one value-first "readout tile"** | Root `AGENTS.md` says the tiers are label → value → detail and "never invert". `FactList` currently puts a `caption`/`textTertiary` label above a `body` value. Stats tiles are not rows: the figure is the reason the tile exists, so `StatCell` keeps its figure-first layout and the exception is written down. |
| D5 | **Chips are opaque filters; modes are segmented** | **`GlassChip` renders `surfaceSunken`/`surface` with `outlineStrong`; use `SegmentedControl` for History and Discover mode switches and for sort** | Glass is for floating surfaces. A chip row scrolls inside content. Mode switches and sort are single-choice, not filters; the segmented thumb says "exactly one of these is true". Library's Tracks/Folders/Recent stays a chip row because it is a search facet that reports counts. |
| D6 | **RTL content policy** | **Add `UserText` + `lib/textDirection.ts`; per-string `writingDirection`, right alignment for title/meta blocks whose own text is RTL; fixed alignment for single-word columns** | `OnlineTrackRow` already flips; `MediaCard`, folder/playlist rows, and `ScreenHeader` do not. The result is Persian titles left-aligned in an LTR shell. `LanguageRow`'s argument against alternating alignment still holds for its one-word column, so alignment is a property of the *block*, not of every string. |
| D7 | **One status vocabulary** | **`StatusSpec { kind, label, tone? }`; each domain maps its own states in `src/lib`; `StatusLine` owns the glyph** | A completed stretch, a downloaded track, a failed download, a missing file, and the current track are five visual languages today. One type plus per-domain mappings keeps the words honest while making the drawing consistent. `describeDownloadState` remains the single owner of download words. |
| D8 | **Virtualise every unbounded list** | **Convert ScrollView maps to `FlatList`/`SectionList`; use `ListHeaderComponent` for the header; keep ScrollView only for bounded screens (Settings, Stats, language sources, Import choose/done phases)** | A course can hold hundreds of rows. `ScrollView` mounts them all and gives each a `Reveal`. `ListGroup` makes the conversion mechanical: the group is a header or a single row wrapper, not a layout rewrite. |
| D9 | **Tokenise geometry** | **Add `tile`, `control`, `list`, and `bar` ramps; one `tileRadius(size)` function** | Current sizes: tiles 30/40/44/46/56/58/76; radii 12/13/14/16/18/28/30; controls 34/36/38/40/42/52; bar heights 4/5/6/8. None of these is a system. A ramp plus a pure radius function removes the drift and makes `tokens.test.ts` assert it. |
| D10 | **Fold Discover's language search** | **Add `languageSearchFields` and build a folded index; never compare `.toLowerCase()`** | Same spelling variants as every other search: Arabic/Persian yeh and kaf, ZWNJ, Arabic-Indic digits. A listener typing the language name in their own spelling must find it. |
| D11 | **One state language** | **`EmptyState` (empty / no results / offline / error) and `InlineNotice` (neutral / accent / danger); a static `SkeletonRows` for loading** | Screens currently return `null` while loading, render a centred caption for every empty case, or print a bare red caption for a failed fetch. These are four different situations and must not look the same. |
| D12 | **Keep public row APIs stable during the refactor** | **`MediaCard` and `MediaCardAction` keep their names and props; `RowShell` is additive; `MediaCardAction` becomes an alias of `RowAction`** | Six screens import `MediaCard` and its action type. Changing the shape while migrating would produce a large, hard-to-review diff. Internals move; call sites migrate screen by screen. |

**Approval gate:** reply with the decision numbers you accept or change. WPs 1–8 assume the recommendations above.

---

# 2. Current-state audit

## 2.1 What already exists and should be kept

| Area | File | State |
|---|---|---|
| Content surface | `src/components/ui/card/card.tsx` | Opaque `Card`, `surface` fill, `outline` hairline, `elevation.card`, low-alpha `wash`, `inset` variant. The material rule is correct. |
| Settings rows | `src/components/ui/card/card-row.tsx`, `card-section.tsx` | Label/value/detail hierarchy, glyph badge, group heading + footer, section-owned reveal index. The pattern to copy. |
| Responsive contract | `src/lib/cardLayout.ts` + `__tests__/cardLayout.test.ts` | `planRowLayout` (inline → reflow → overflow, priority-preserving) and `cardWidthFor` (no measurement). Tested at 250–430 pt. |
| Shelf card | `src/components/ui/media-card.tsx` | Tile, halo, aurora wash, three lines, search highlight, full-bleed progress, action cluster, overflow menu. Uses the plan; `elevated={false}`. |
| Choice control | `src/components/ui/card/segmented-control.tsx` | One shared thumb, no first-frame jump, reduced-motion aware. |
| Tiles | `src/components/motion/PaletteTile.tsx` | Deterministic gradient + initial fallback, cheap enough for recycled rows. |
| Filter chip | `src/components/ui/glass/GlassChip.tsx` | Count replaces icon, zero is rendered, `99+` cap. Behaviour is right; material is wrong for content (D5). |
| Screen scaffold | `src/components/motion/Screen.tsx` | Canvas, ambient wash, safe area, max-width column, header rhythm. |
| Motion | `src/components/motion/Reveal.tsx` | Staggered entrance with `limit`; already the right tool once rows are virtualised. |
| Long-list primitives | `src/components/ui/keyboard-scroll-view.tsx` | `KeyboardAwareFlatList` / `KeyboardScrollView`; the only keyboard avoidance in the tree. |
| Pure domain wording | `src/lib/online/index.ts`, `history.ts`, `playbackContext.ts`, `folderPlay.ts` | `describeTrackCount`, `describeKnownTrackCount`, `describeDownloadState`, `describeRunOutcome`, `describeStretchOutcome`, `describeFolderProgress`. The words already live in `lib`; the drawing does not. |
| Palette contract | `src/theme/__tests__/tokens.test.ts` | Text/surface pairs, tier separation ≥ 1.30:1, card-to-canvas step, hairline, shape ramp. Keep and extend. |

## 2.2 Inventory — every list and card surface

Legend: **S** = shelf card, **D** = dense list, **R** = record row, **G** = grouped settings/rows. "Hand-rolled" means the screen or component re-implements tile + copy + actions instead of using a shared row.

| # | Screen | Container | Row / card | Contents | Verdict |
|---|---|---|---|---|---|
| 1 | Library — Tracks (`(tabs)/index.tsx:588`) | `KeyboardAwareFlatList` | `MediaCard` **S** | tile, title, plays · notes, last played / match, add + details | Keep; add missing/stream status and share action presets. |
| 2 | Library — Folders (`index.tsx:707`) | `KeyboardAwareFlatList` | `MediaCard` **S** | progress bar, name, progress · duration · plays · when, play + add + history | Keep; action presets. |
| 3 | Library — Recent (`index.tsx:863`) | `KeyboardAwareFlatList` | folder/playlist `MediaCard`, track `MediaCard` **S** | three entity kinds in one list | Keep; playlist card differs from the Playlists tab; unify. |
| 4 | Library — Continue card (`index.tsx:485`) | header | `Card` + `PaletteTile` + accent button **hand-rolled** | overline, title, play count, play | Keep as a **spotlight** variant; tokenise tile/radius. |
| 5 | Library — Missing banner (`index.tsx:529`) | header | `Card` + `ElasticPressable` **hand-rolled** | alert, count, explanation, chevron | Convert to `InlineNotice` (D11). |
| 6 | Playlists — Create (`playlists.tsx:95`) | `KeyboardAwareFlatList` header | `TextField` + `PrimaryButton` | name, create | Keep. |
| 7 | Playlists — Smart (`playlists.tsx:123`) | header | `SmartPlaylistRow` **hand-rolled** | 44 tile, rule title, summary/reason, chevron | Migrate to `RowShell`/`ListRow`; empty state. |
| 8 | Playlists — Saved (`playlists.tsx:155`) | list | `Card` + `PaletteTile` **hand-rolled** | title, track count, history, delete | Migrate to `MediaCard` or shared `ListRow`; add play (D2). |
| 9 | Discover — Continue / Favorites (`discover.tsx:177-222`) | `KeyboardAwareFlatList` | `CollectionCard` → `MediaCard` **S** | title, meta, progress, favorite | Keep. |
| 10 | Discover — Browse (`discover.tsx:228`) | list | `Card` wrapping `LanguageRow` **hand-rolled** | native name, English name, source count/chevron | Make a dense group; remove per-row elevation; fold search. |
| 11 | History — Sessions (`history.tsx`) | `SectionList` | `StretchCard` **R** | title, time range, position/context, duration/speed/outcome, add + delete | Migrate to `RowShell`; status spec. |
| 12 | History — Collections (`history.tsx`) | `SectionList` | `ContextPlayCard` **R** | title, type/time, scope, duration/outcome, open + delete | Same. |
| 13 | Stats (`stats.tsx`) | `ScrollView` | `StatCell` **readout** + `Card` rows **hand-rolled** + day bars | figure/label, leader rows, longest, 7-day bars + sessions | Keep tiles; move leader/longest to `ListGroup`; tokenise bar geometry; `DetailRow` → `FactList`. |
| 14 | Settings (`settings.tsx`) | `ScrollView` | `CardSection` + `CardRow` **G** | account, playback, appearance, motion, storage/sync, sign out | Reference implementation. Fix section indices, divider inset, sync meta. |
| 15 | Track detail (`track/[id].tsx`) | `ScrollView` | `StatCell` ×4, `FactList`, `SessionCard`, `AnnotationList` | artwork hero, stats, facts, sessions, notes | Keep structure; `FactList` tiers; `SessionCard` → `RowShell`; art radius token; sticky play? (no). |
| 16 | Folder detail (`folder/[key].tsx:163`) | `ScrollView` + `map` | `Card` + `PaletteTile` **hand-rolled D** | title, state line, duration, history, add | Migrate to `ListGroup` + `ListRow` in `FlatList`; missing/status. |
| 17 | Playlist detail (`playlist/[id].tsx:94`) | `KeyboardScrollView` + `map` | `Card` + tile + 4 controls **hand-rolled D** | title, history, up/down/remove | Worst squeeze case; `RowShell` plan; reorder via overflow on narrow. |
| 18 | Playlist detail — addable (`playlist/[id].tsx:305`) | map | `Card` + tile + add **hand-rolled D** | title, add | `ListRow`. |
| 19 | Online collection (`online/[key].tsx:280`) | `ScrollView` + `map` | hero `Card`, `OnlineTrackRow` **D**, series headers | cover, progress, play/shuffle/unfinished/queue/download, numbered rows | Dense group + `FlatList`; RTL helper; responsive download control. |
| 20 | Online source (`online/source/[id].tsx`) | `FlatList` | `CollectionCard` **S** | title, size/download, favorite, download | Keep; download status spec. |
| 21 | Online language (`online/language/[code].tsx`) | `ScrollView` | `SourceCard` **hand-rolled S** | gradient mark, name/native/description, chevron | `MediaCard` or `ListRow`; few rows, bounded. |
| 22 | Smart playlist (`smart/[rule].tsx:94`) | `ScrollView` + `map` | `Card` + tile **hand-rolled D** | title, reason, duration, add | `ListGroup` in `FlatList`. |
| 23 | Missing (`missing.tsx:52`) | `ScrollView` + `map` | `Card` + tile **hand-rolled D** | title, stake, chevron | `ListGroup` in `FlatList`; empty state card keep. |
| 24 | Import (`import.tsx:337`) | `FlatList` | `Card` + two text lines **hand-rolled** | filename, folder, status | `ListRow`; literal bottom inset. |
| 25 | Annotation list (`annotation-list.tsx`) | `View` + map | `Card` per note **hand-rolled** | colour dot, time, text | Keep card-per-note; add tag/colour metadata and selected/status spec. |
| 26 | Fact list (`fact-list.tsx`) | `Card` + map | label/value rows **G** | facts | Fix tiers (D4), inset dividers. |

## 2.3 Findings

**F1 (high) — Fifteen row implementations, no shared anatomy.** `MediaCard`, `SessionCard`, `StretchCard`, `ContextPlayCard`, `SmartPlaylistRow`, the Playlists saved row, folder row, playlist row, addable row, missing row, import row, `SourceCard`, `LanguageRow`, and `OnlineTrackRow` each choose their own tile size (30–58), radius (12–28), padding (`spacing.sm`/`md`/`lg`), control size (34–52), and gap. The same object (a playlist) is drawn three ways: Recent card (`index.tsx:863`) has play/add/history; Playlists saved row (`playlists.tsx:155`) has history/delete; playlist detail header has history/add/rename. This is the root cause of the inconsistency.

**F2 (high) — Long lists are not virtualised.** `folder/[key].tsx:163`, `playlist/[id].tsx:94`, `online/[key].tsx:280`, `smart/[rule].tsx:94`, and `missing.tsx:52` are `ScrollView`s over `.map()`. `online/[key]` can hold hundreds of episodes. Every child also mounts a `Reveal`, so the entrance stagger is scheduled for every row, not the first screenful. Import (`import.tsx:337`) is already a `FlatList`; that is the shape the others need.

**F3 (high) — Discover language search is not folded.** `discover.tsx:146-152`:

```ts
language.name.toLowerCase().includes(query) ||
language.nativeName.toLowerCase().includes(query) ||
language.code === query
```

A listener typing `فارسی` with an Arabic yeh (ي) or a ZWNJ will not match the catalogue's `فارسی`; Arabic-Indic digits will not match either. `lib/search.ts` already solves this for the library and must be used here (D10).

**F4 (high) — Four-control rows are not planned.** The playlist row (`playlist/[id].tsx:197-271`) carries a 40 pt tile, a title, a history button (34), and three reorder/remove buttons (34 each). The comment admits the title gets roughly 100 pt on a 360 dp phone. Folder rows carry history + add (34 each); history rows carry add-to-playlist + delete (36 each). Only `MediaCard` asks `planRowLayout`; everything else lets the title absorb the shortfall. This is exactly the failure the layout contract was written to prevent.

**F5 (medium-high) — The tier contract is inverted in readouts.** `fact-list.tsx:50-63` renders the label as `caption`/`textTertiary` and the value as `body` or `numeric`/`text`. The Stats `DetailRow` (`stats.tsx:368-378`) does the same. Root `AGENTS.md` says label → value → detail, "never invert", with label `body`/`title` in `text` and value `numeric`/`figure` in `textSecondary`. Either the code or the rule must change; D4 recommends changing the code and writing down the `StatCell` exception.

**F6 (medium) — RTL is applied to one row and nowhere else.** `OnlineTrackRow` uses `isRtlText` to set `textAlign: "right"` and `writingDirection: "rtl"` (`online-track-row.tsx`), and series headers do the same (`online/[key].tsx`). `MediaCard`, folder rows, playlist rows, `ScreenHeader`, `SessionCard`, and `CollectionCard` do not. Persian titles therefore render left-aligned in an LTR shell, and punctuation at the end of a mixed string can land on the wrong side. `LanguageRow` deliberately does not mirror a one-word column; that distinction is correct and should be codified, not abandoned.

**F7 (medium) — Glass is used inside scrolling content.** `GlassChip` (`GlassChip.tsx`) uses `theme.glass` and `theme.glassBorder`; it appears in the Library header, History filters, Discover filters, folder/online/smart action rows, and `DownloadControl`. `Discover` also wraps every language row in a default-elevated `Card` (`discover.tsx:228`). Glass is defined as the material for things that float; a filter row scrolls with the page, and forty-six elevated cards stop reading as cards.

**F8 (medium) — Status is five visual languages.** A complete stretch gets an accent border, an accent wash, and a "Complete" chip (`stretch-card.tsx`); a finished session gets a check glyph and "Finished"; an interrupted one gets `cloudOffline`; a downloaded track gets `checkCircle`; a running download gets `cloudDownload`; a failed one gets `alert`; a missing file gets danger text; the current online track gets a tinted square with a play glyph. Some of these are domain-accurate, but the tone/icon/label mapping is duplicated per file, so the same state can drift. `describeDownloadState` is the one already-correct precedent.

**F9 (medium) — Empty, loading, offline, and error look the same.** Many list screens return `null` while loading and then render a centred `caption` for every empty case (Library, Discover, History, Playlists, Folder, Online). Failed fetches are bare red `caption`s (`online/[key].tsx`). An offline cache notice is a tertiary caption. A "Nothing yet" and a "Could not reach the source" need different shapes and different actions.

**F10 (medium) — The same playlist has three presentations.** See F1. A listener who sees a playlist in Recent, then in Playlists, then in its detail cannot rely on the same action being in the same place. D2 fixes the verb; the plan also unifies the row.

**F11 (medium) — Geometry is hard-coded in screens.** Examples: `radius={12}` (playlist, folder, smart, missing), `radius={13}` (playlists saved, smart row), `radius={16}` (continue tile), `radius={18}` (online hero), `radius={28}` (track artwork), `borderRadius: 3/4/5` (stats bars, annotation dots), `height: 8` (stats split), `width: 84/54` (day labels), `elevation: 14` (artwork), `paddingBottom: spacing.giant + 96` (`import.tsx:413`). Root `AGENTS.md` forbids hard-coded corners; the rest is the same class of drift.

**F12 (low-medium) — Reveal indices are hand-bookkept and `limit` is often missing.** `index.tsx` uses `FIRST_ROW_REVEAL_INDEX`; `track/[id].tsx` uses `FACTS_START_INDEX`/`FACTS_INDEX_STRIDE`; `playlists.tsx` uses `FIRST_SAVED_ROW_REVEAL_INDEX`; folder/playlist/online/smart/missing pass a raw `index` with no `limit`. A single section inserted anywhere renumbers entrances, and a long list animates every row.

**F13 (low) — Meta strings are assembled ad hoc.** Screens join parts with `" · "` and filter `null`s by hand; pluralisation is written inline in a dozen places (`track${n === 1 ? "" : "s"}`, `play${...}`). `describeTrackCount` and `describeKnownTrackCount` already exist but are not used everywhere. A `joinMeta` + `plural` pair removes the repeated bug class.

**F14 (low) — Dividers are full-bleed despite the docs.** `CardRow` (`card-row.tsx:127`) and `FactList` draw `borderTopWidth` across the entire row, while their file headers (and `cardTokens.dividerInset`, `tokens.ts:420`) describe a hairline inset to the start of the text. `dividerInset` is unused. The grouped-list primitive must implement the inset correctly.

**F15 (low) — Accessibility is mostly right but uneven.** `MediaCard` and its overflow menu label every action; `CardRow` labels pressable rows. But: text-only pressables ("Add tracks", "Delete playlist") rely on their child text for a name, notices are not announced, stats day bars expose no `accessibilityValue`, and `OnlineTrackRow`'s trailing glyph is decorative without a spoken equivalent (the row hint covers playback, not download). The new primitives should make the correct pattern the default and add a live region to `InlineNotice`.

**F16 (low) — Library track cards do not show a missing file.** `index.tsx:588` builds the track card from play count and notes; `availability` is ignored, so a track whose bytes are gone looks normal in the Library and only reveals the problem on tap. The folder card already filters missing tracks out of batch actions; the track card should carry the status.

---

# 3. The target system

## 3.1 Archetypes

| Archetype | Use | Container | Anatomy | Tap |
|---|---|---|---|---|
| **Shelf card** (`MediaCard`) | Identity: a track/folder/playlist/collection where artwork, wash, and progress help the choice. Library, Discover, source listings, saved playlists. | One `Card` per item, `elevated={false}`, wash. | tile (shelf) + title + meta + optional detail + progress bar + planned actions. | Track plays; container opens. |
| **Dense row** (`ListRow` inside `ListGroup`) | Homogeneous sequences: tracks in a folder/playlist/course, smart picks, import preview, missing files, addable tracks. | One `Card padded={false}`; rows separated by inset hairlines. | leading (tile, number, or status marker) + title + meta/detail + optional trailing value + planned actions. | Track plays; a "find/relink" row opens its detail. |
| **Record row** (`RecordRow`) | A recorded listen or run: History, track detail sessions. | `elevated={false}` card (History) or dense group (track detail). | title + time range + position/context + duration/speed/status + planned actions. | Inspect (opens the session sheet). |
| **Readout tile** (`StatCell`) | A single figure with no list behind it, or a navigation tile. | `Card` in a 2-column grid, elevated (focal). | badge/caret + figure + label. | Expand or navigate, stated by affordance. |
| **Settings group** (`CardSection` + `CardRow`) | Account, playback, appearance, motion, storage/sync. | One card per topic, heading + footer. | badge + label + detail + value/trailing + chevron. | Change/open. |
| **Notice / state** (`EmptyState`, `InlineNotice`) | Empty list, no results, offline cache, error, one-off confirmation. | Not a row. Centred state or a single card/banner. | icon + title + message + optional action. | The action in the notice. |

**Rule:** the archetype is chosen by the *question the listener is asking*, not by the screen. "What is this?" → shelf. "Where am I in this sequence?" → dense. "What happened in this listen?" → record. "How much?" → readout.

## 3.2 Anatomy and numbers

**Tile ramp** (`tile`): `sm 32` (language/leading marker), `md 40` (dense row), `lg 48` (shelf card), `xl 56` (collection/continue), `hero 76` (online hero). `tileRadius(size)` returns a member of the existing `radius` ramp: `≤48 → radius.tile (12)`, `49–60 → radius.md (16)`, `61–80 → radius.lg (20)`, `>80 → radius.card (28)`. The function is pure and tested for "even", "non-decreasing", and "always a member of the ramp". This replaces `Math.round(size * 0.3)` and every literal.

**Control ramp** (`control`): `sm 36`, `md 40`, `lg 44`, `xl 52`. Visual size may be 36 in a dense row; `BouncyIconButton` pads to 44. Remove 34, 38, and 42. Header actions become 44; continue/play become 52.

**Row geometry** (`list`): `rowMinHeight 56`, `rowPadding spacing.sm (8)` with a 40 tile (40 + 16 = 56), `groupGap spacing.sm`. Shelf cards keep `card.padding 16` and `MediaCard`'s `spacing.md` content padding. Dense text uses `bodyStrong` title (1–2 lines), `caption` meta (`textSecondary`), `caption` detail (`textTertiary`). A trailing duration/count uses `numeric` in `textSecondary`.

**Meta grammar:** `joinMeta(parts)` filters `null`, `undefined`, and `""`, trims, and joins with `" · "`. It never leaves a leading, trailing, or doubled separator. `plural(count, singular, plural?)` owns every count phrase. The existing `describe*` helpers keep ownership of domain wording; `joinMeta` only assembles.

**Action planning:** every row that can have actions passes `RowAction[]` through `RowShell`, which calls `planRowLayout` with the actual card width (`cardWidthFor`), padding, tile width, `copyMinWidth: 132`, `actionGap: spacing.sm`, and `overflowWidth: control.md`. Inline actions render in declaration order; overflow actions open `RowActionMenu` (a `Modal` + `GlassSurface`, the one permitted floating use). Nothing is dropped. On narrow widths the cluster reflows to its own line before anything moves to the menu; when even that line cannot hold them, the lowest-priority actions move to the menu. **A dense row carries at most two inline actions plus overflow**; a shelf card may hold three when the plan says they fit. Anything else is a menu entry with words.

**Status:** `StatusKind` is a small string union (`complete`, `finished`, `interrupted`, `continued`, `stopped`, `downloaded`, `downloading`, `failed`, `paused`, `missing`, `streamed`, `favorite`, `current`, `warning`, `info`). `StatusSpec = { kind: StatusKind; label: string; tone?: StatusTone }`, where `StatusTone = "accent" | "danger" | "secondary" | "tertiary"`; `StatusLine` owns the glyph and the default tone. Domains map their own states:
- `history.ts` → `complete`, `finished`, `interrupted`.
- `playbackContext.ts` → `continued`, `stopped` (the words already exist in `describeRunOutcome`).
- `online` → `downloaded`, `downloading`, `failed`, `paused`; keep `describeDownloadState` as the owner of the words.
- `folderPlay.ts` → `finished`, `resume`, `notStarted`, `missing`.
- `trackFacts` → `streamed`, `missing`.
A domain mapping returns `{ kind, label, tone? }`; `StatusLine` resolves the glyph from `kind` and the tone from the spec. `src/lib` never imports an icon component; the icon name stays in the component layer. A row may have at most one status line; the meta line carries the rest.

**Progress:** one `bar.thin 4` for shelf-card bottom bars and one `bar.thick 6` for stat/day bars. `GlassProgress` remains for the shelf bottom bar (it is a track, not a glass surface). Dense rows show progress as a line of text ("12 of 29") or a 2 pt inset bar, not a full-bleed bar.

**RTL:** `UserText` reads `directionFor(text)` and applies `writingDirection` always; `align="content"` additionally right-aligns when the text is RTL. Use `align="content"` for card titles, descriptions, and record titles; use the default (left) for a column of one-word language names, for code/hash values, and for numeric readouts. Never set `textAlign` from a *container's* direction; it is a property of the string's block.

**Search:** every searchable entity gets a `*SearchFields` function in `lib/librarySearch.ts` (or `lib/online` for languages) returning `string | null` fields; the screen builds `createSearchIndex` in a `useMemo` keyed on the data and `searchIndex` in another keyed on terms. Discover's language search uses the folded index and keeps the ISO code as an exact-match field.

## 3.3 New and changed tokens

```ts
// src/theme/tokens.ts
export const tile = { sm: 32, md: 40, lg: 48, xl: 56, hero: 76 } as const;
export const control = { sm: 36, md: 40, lg: 44, xl: 52 } as const;
export const list = { rowMinHeight: 56, rowPadding: spacing.sm, groupGap: spacing.sm } as const;
export const bar = { thin: 4, thick: 6 } as const;

/** A member of `radius`, chosen from the tile's size. Pure. */
export function tileRadius(size: number): number;

/** The one inset divider: starts at the text, not the card edge. */
export const listDividerInset = (leading: number): number =>
  list.rowPadding + leading + spacing.md;
```

`radius` itself does not change. `card.dividerInset` is removed if unused after migration, or repurposed as the settings-row inset (badge 36 + padding 16 + gap 12).

## 3.4 New modules and interfaces

```
src/components/ui/row/
  row-shell.tsx        RowShell: leading, copy, planned actions, progress, overflow
  row-actions.tsx      RowAction, RowActionButton, RowActionMenu, action presets
  list-group.tsx       ListGroup: one Card, inset hairlines, first/middle/last
  list-row.tsx         ListRow: dense composition of RowShell
  record-row.tsx       RecordRow: history composition of RowShell
  status-line.tsx      StatusLine: StatusSpec -> icon + caption
  user-text.tsx        UserText: RTL-aware ThemedText
  state-view.tsx       EmptyState, InlineNotice, SkeletonRows
  index.ts
```

`RowShell` (the contract; `MediaCard` and `ListRow` both compose it):

```ts
export type RowDensity = "shelf" | "dense";

export type RowShellProps = {
  density: RowDensity;
  leading?: ReactNode;
  /** Drives `planRowLayout`; must match the rendered tile width. */
  leadingWidth?: number;
  title: string;
  titleRanges?: readonly Range[];
  meta?: string | null;
  detail?: string | null;
  status?: StatusSpec | null;
  trailing?: ReactNode;
  actions?: readonly RowAction[];
  progressRatio?: number | null;
  progressTint?: string;
  wash?: string | null;
  accent?: string;
  marked?: boolean;
  elevated?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  position?: "only" | "first" | "middle" | "last";
};
```

`RowAction` is the existing `MediaCardAction` renamed (`key`, `width`, `priority`, `node`, `icon`, `label`, `onPress`, `danger?`). `MediaCardAction` is re-exported as an alias (D12). The action presets in `row-actions.tsx` remove duplicated clusters:

```ts
playFolderAction({ title, onPress }): RowAction
playPlaylistAction({ title, onPress }): RowAction
addToPlaylistAction({ title, ramp, artwork, trackIds, resolveTrackIds? }): RowAction
historyAction({ type, key, title, artwork }): RowAction
detailsAction({ title, onPress }): RowAction
deleteAction({ title, onPress }): RowAction
```

Each preset owns its width (`control.md`), priority, inline node, overflow icon/label, and accessibility label, so the same control has the same rank on every screen.

`ListGroup` renders one `Card padded={false}` and injects `position` into each child's divider; `ListRow` draws the inset hairline as an absolutely positioned line that starts at `listDividerInset(leadingWidth)`, not as a full-width border. `ListRow` uses `rowMinHeight 56` and `rowPadding 8`.

`RecordRow` composes `RowShell` with the record copy rules: title (`bodyStrong`), time range (`caption`/`textSecondary`), position + context (`caption`/`textTertiary`), a right column with duration (`numeric`/accent), speed, and one status. Trailing add/delete actions are planned, not fixed-width siblings.

## 3.5 Screen mapping

| Screen | Archetype after this plan | Container |
|---|---|---|
| Library Tracks/Folders/Recent | Shelf (`MediaCard`) | `KeyboardAwareFlatList` (unchanged) |
| Library Continue | Shelf spotlight (`MediaCard` variant or `SpotlightCard`) | Header |
| Playlists Smart/Saved | Dense group + shelf for saved? **D3 says shelf** for saved playlists; smart recipes are dense | `KeyboardAwareFlatList` |
| Discover Continue/Favorites | Shelf | `KeyboardAwareFlatList` |
| Discover Browse | Dense group of `ListRow` inside one card | same |
| History | Record | `SectionList` |
| Stats leaders/longest | Dense group | `ScrollView` (bounded) |
| Track detail sessions/notes | Record / note cards | `ScrollView` (bounded by the track's history; see WP3 note) |
| Folder detail | Dense | `FlatList` |
| Playlist detail | Dense | `KeyboardAwareFlatList` |
| Online collection | Dense | `FlatList` |
| Online source | Shelf | `FlatList` |
| Online language | Dense/shelf, bounded | `ScrollView` |
| Smart playlist | Dense | `FlatList` |
| Missing | Dense | `FlatList` |
| Import preview | Dense | `FlatList` (already) |
| Settings | Settings group | `ScrollView` |

---

# 4. Work packages

Each package is atomic, independently verifiable, and leaves the app green. Do not start a package before the previous one's verification passes.

## WP0 — Approval gate

**Action:** wait for a reply accepting or amending D1–D12. If a decision changes, update §1.3 and the affected package before writing code.

**Verification:** none.

---

## WP1 — Tokens, pure helpers, and folded language search

**Files:**
- `src/theme/tokens.ts` — add `tile`, `control`, `list`, `bar`, `tileRadius`, `listDividerInset`.
- `src/theme/__tests__/tokens.test.ts` — add assertions: every control/tile is positive; the ramps are strictly increasing; `tileRadius` always returns a member of `radius`, is even, and is non-decreasing.
- `src/lib/cardMeta.ts` (new) — `joinMeta`, `plural`.
- `src/lib/rowStatus.ts` (new) — `StatusSpec`, `StatusTone`.
- `src/lib/textDirection.ts` (new) — move `isRtlText`, add `directionFor`, `textAlignFor`.
- `src/lib/online/index.ts` — re-export `isRtlText` from `textDirection` for compatibility; add `languageSearchFields(language)` beside the language catalogue (languages are not library entities).
- `src/lib/librarySearch.ts` — unchanged field functions; this is the precedent for the new language fields.
- `src/lib/__tests__/cardMeta.test.ts`, `rowStatus.test.ts`, `textDirection.test.ts`, and `online.test.ts` — new/extended.

**Rules:**
- `joinMeta([])` returns `null`; whitespace-only parts are dropped; no doubled separators; a part that already ends in `" ·"` is a bug, not a special case.
- `plural(1, "track")` → `"1 track"`; `plural(0, "track")` → `"0 tracks"`; an optional irregular plural is allowed.
- `StatusSpec` has no domain strings; the domain modules own them.
- `languageSearchFields` returns `nativeName`, `name`, `code`, and aliases; `null` for a missing field, never `""`. It lives in `lib/online`, not `lib/librarySearch`.

**Verification:** `npm test -- src/lib/__tests__/cardMeta.test.ts src/lib/__tests__/rowStatus.test.ts src/lib/__tests__/textDirection.test.ts src/lib/online src/theme/__tests__/tokens.test.ts`.

---

## WP2 — `RowShell`, `ListGroup`, `ListRow`, overflow menu

**Files:**
- `src/components/ui/row/*` (new; see §3.4).
- `src/components/ui/media-card.tsx` — refactor onto `RowShell`; keep public props/types; `MediaCardAction` becomes an alias of `RowAction`; move `ActionMenu` to `row-actions.tsx`; replace `Math.round(tileSize * 0.3)` with `tileRadius`; pass `density="shelf"`; use `UserText` for the title and `joinMeta` for meta/detail.
- `src/components/ui/row/__tests__/row-shell.test.tsx` — render at 320/360/430; assert every action is either inline or in the overflow; assert `accessibilityLabel` on the row and the overflow; assert no nested pressable (the body and actions are siblings).
- `src/lib/__tests__/cardLayout.test.ts` — add cases: a four-action dense row at 320/360 reflows before overflowing; a row with a 40 tile and a 52 primary action; a zero-width guard.
- `src/components/ui/card/__tests__/*` — if `CardRow` is touched, assert the inset divider.

**Rules:**
- `RowShell` never renders an action that is neither inline nor in the overflow. The overflow button is reserved before choosing inline actions (existing `planRowLayout` behaviour).
- Actions are siblings of the pressable body, never children. This is the rule that prevents a card tap firing while a control is pressed.
- `ListGroup` is one `Card padded={false}`; `ListRow` draws the divider itself, inset to the text; the first visible row has no divider; a `ListGroup` with one item still looks like a card, not a stray line.
- `MediaCard` keeps its props and structure. The only visual change is tile radii moving onto the ramp (a 46 pt tile goes from 14 to 12); name that in the commit. If any other pixel moves, it is intentional and named.
- `RowShell` computes card width once per list render via a `RowWidthContext` (or a `cardWidth` prop) rather than calling `useWindowDimensions` in every row. Provide a fallback for a standalone card.

**Verification:** `npm test -- src/components/ui/row src/lib/__tests__/cardLayout.test.ts src/components/ui/__tests__` plus `npm run typecheck`.

---

## WP3 — History, track detail, facts, and stat tiles

**Files:**
- `src/components/session-card.tsx`, `stretch-card.tsx`, `context-play-card.tsx`, `smart-playlist-row.tsx` — migrate to `RecordRow`/`ListRow`; preserve props and wording; remove local `OUTCOMES` mappings in favour of `StatusSpec`.
- `src/components/fact-list.tsx` — label `body`/`text`, value `numeric`/`textSecondary`, detail `caption`/`textTertiary`; stacked technical values keep `numeric` but move the label up a tier; inset dividers.
- `src/app/(tabs)/stats.tsx` — replace `DetailRow` with `FactList`; move the leader and longest rows into a `ListGroup`; use `bar.thick` and `list` tokens; `accessibilityValue` on the day bars.
- `src/app/(tabs)/history.tsx` — `SegmentedControl` for Sessions/Collections; sort as a `SegmentedControl` or a compact menu (3 options) in the header; keep the export action; `EmptyState`.
- `src/app/track/[id].tsx` — `radius={tileRadius(?) / radius.card}` for artwork; `SessionCard` now planned; `AnnotationList` unchanged structurally but uses `StatusSpec` for selection; keep the four `StatCell`s.
- New/extended tests: `src/lib/__tests__/history.test.ts` (status mapping), `stats` day-bar shape if pure, `src/components/ui/row/__tests__/record-row.test.tsx`.

**Rules:**
- A record row's tap is **inspect**, never resume. Resume stays inside the session sheet; the hint says where it lands. This preserves the current approved behaviour.
- A record row shows exactly one status (`Complete`, `Finished`, `Interrupted`, or none). The duration is a `numeric` value in the accent colour; the speed is `caption`/`textSecondary`.
- `FactList` follows the row tier contract. The `StatCell` exception is documented in `AGENTS.md` (WP8): a tile's figure is the primary read, a row's label is.
- Stats remains bounded; it does not need virtualisation. The day chart uses `bar.thick` and `list` tokens, not literals.

**Verification:** `npm test -- src/components src/lib/__tests__/history.test.ts` plus `npm run typecheck`.

---

## WP4 — Library, playlists, and Recent

**Files:**
- `src/app/(tabs)/index.tsx` — use action presets; show `File missing` / `Streams` status on track cards; keep the three-list structure; continue card uses `tile.xl` and `tileRadius`; missing banner becomes `InlineNotice`; ensure every list passes `Reveal limit`.
- `src/app/(tabs)/playlists.tsx` — saved row becomes `MediaCard` (shelf) with play/add/history and delete in the menu, or a shared `ListRow` if D3 changes; smart rows become `ListRow`; create row unchanged; `EmptyState`; section reveal indices derived from the number of smart rows.
- `src/components/smart-playlist-row.tsx` — migrated in WP3; adjust if the playlists screen passes new props.
- New/extended tests: `src/lib/__tests__/rowActions` or `src/components/ui/row/__tests__/presets.test.tsx` — each preset has a label, icon, priority, width, and an inline node that calls the same handler as its menu entry.

**Rules:**
- A track card's tap plays; a folder/playlist card's tap opens. The play control on a folder/playlist card is always visible (or in the overflow at extreme widths) so the fast path is discoverable.
- A saved playlist in Playlists and the same playlist in Recent render the same primary row. The difference is only contextual meta ("saved", "last played").
- The missing banner appears only when something is missing; the stream state appears only on online rows. No "0 missing" furniture.
- Library's Tracks/Folders/Recent remains a chip row (search facet with counts), but the chips are opaque (D5).

**Verification:** `npm test` and `npm run typecheck` after the package. Manual: Library at 320/360/430 with a long Persian title and a missing file.

---

## WP5 — Discover and online

**Files:**
- `src/app/(tabs)/discover.tsx` — mode switch to `SegmentedControl`; Browse uses a folded `createSearchIndex` over `languageSearchFields`; language rows become a `ListGroup` of `ListRow` (or a dense `ListRow` list) with no per-row elevation; `EmptyState` for no results / no favorites; keep Continue/Favorites as shelf cards.
- `src/app/online/source/[id].tsx` — download status via `StatusSpec`; favorite/download actions via presets; keep shelf cards.
- `src/app/online/language/[code].tsx` — `SourceCard` becomes `MediaCard` or `ListRow`; bounded, remains a `ScrollView`.
- `src/app/online/[key].tsx` — `FlatList` over a flattened block list (series header rows + track rows) with `ListHeaderComponent` for the hero/actions; dense `ListGroup` for tracks; `RowShell` for the download control's responsive row; `UserText` for the hero title and series headers; preserve `isRtlText` behaviour; `EmptyState` and `InlineNotice` for error/cache.
- `src/components/online/online-track-row.tsx` — dense row using `ListRow`; status spec for job/downloaded; keep the numbered leading marker.
- `src/components/online/collection-card.tsx`, `language-row.tsx`, `download-progress.tsx` — adapt to the new primitives; `DownloadControl` uses one row that wraps its chips instead of squeezing the headline.
- Tests: `src/lib/__tests__/online.test.ts` — `languageSearchFields` + folded search for `فارسی` with Arabic yeh, Persian yeh, ZWNJ, and Persian digits; `describeDownloadState` still owns words.

**Rules:**
- Browse must not read the network; only a chosen language/source does. The plan does not change that.
- A language with zero sources is inert and still rendered; `ListRow` must support a disabled row with a spoken reason.
- The collection's `fromCache` notice is an `InlineNotice` (neutral), not a bare caption; an error is danger with an action ("Try again" or "Open source").
- The series header's play action is a control, not a card tap; the standalone bucket remains without one.

**Verification:** `npm test -- src/lib/__tests__/online.test.ts src/lib/__tests__/librarySearch.test.ts src/components` and manual Discover search with all four Persian spellings.

---

## WP6 — Folder, playlist, smart, missing, import, and addable tracks

**Files:**
- `src/app/folder/[key].tsx` — `FlatList` (or `SectionList`) with `ListHeaderComponent`; dense `ListGroup` of tracks; `trackStateLabel` becomes a `StatusSpec`; row actions use presets (`history`, `add`); `File missing` is danger and disables play; keep the folder-level actions and notice.
- `src/app/playlist/[id].tsx` — `KeyboardAwareFlatList` with the rename group and header in `ListHeaderComponent` (an element, not an inline function); dense `ListGroup`; row overflow carries Move up / Move down / Remove on narrow widths; play and history inline; delete playlist as a danger `ListRow`/notice; addable tracks as a dense group.
- `src/app/smart/[rule].tsx` — `FlatList`; dense group of picks; the commute budget is a single choice, so it becomes a `SegmentedControl`; chips remain only for the non-exclusive actions ("Add to playlist", "Save as playlist").
- `src/app/missing.tsx` — `FlatList` with grouped headers; dense rows; `InlineNotice` for the "nothing lost" explanation; `EmptyState` when the list is empty.
- `src/app/import.tsx` — preview rows become dense `ListRow`s; replace `spacing.giant + 96` with `spacing.giant` (root screen, no dock) or `dockInset` if the dock actually overlaps; keep `FlatList` and `Reveal limit`.
- Tests: `src/lib/__tests__/folderPlay.test.ts` or the screen's pure helpers for status mapping; `src/components/ui/row/__tests__/list-group.test.tsx` for divider positions.

**Rules:**
- A row with four actions must use the plan. On a narrow card, "Move up/down/remove" move to the overflow menu, and the visible row keeps play + history. Nothing is dropped.
- `KeyboardAwareFlatList` is used where a field exists (playlist rename); never pair it with `KeyboardAvoidingView`.
- A `ListHeaderComponent` that holds a `TextField` is an element, not a component function (the existing rule).
- Reordering remains button-based; the menu rows are named "Move up", "Move down", "Remove".
- The folder/playlist/online detail screens have no dock (they are root stack screens), so their bottom padding is `spacing.giant`, not `dockInset`; tab screens keep `dockInset`.

**Verification:** `npm test` and `npm run typecheck`; manual scroll of a 200-row course and a 4-control playlist row at 320 dp.

---

## WP7 — States, notices, and loading

**Files:**
- `src/components/ui/row/state-view.tsx` — `EmptyState`, `InlineNotice`, `SkeletonRows`.
- Every screen in §2.2 — replace bare empty/loading/error captions.
- `src/components/ui/row/__tests__/state-view.test.tsx` — variants, roles, live region for notices.

**Rules:**
- `EmptyState` distinguishes: **empty** ("No tracks yet. Add audio…"), **no results** ("No track matches “…”"), **offline/unavailable** ("Showing what is on this device — the source could not be reached."), and **error** ("Could not load this. Try again."). Each gets the right action, or none.
- `InlineNotice` is a `Card` (not glass) with a tone icon, title, and optional detail/action. It uses `accessibilityLiveRegion="polite"` for a one-off confirmation. It is not a modal/toast.
- `SkeletonRows` is **static**: `surfaceSunken` blocks with an accessibility label "Loading", no shimmer and no loop (the motion rules forbid a decorative loop). A loading screen renders 3–5 skeletons, not a single caption.
- A list's `ListEmptyComponent` renders `null` only while loading **and** the skeleton is shown elsewhere; never leave a blank screen.

**Verification:** `npm test -- src/components/ui/row/__tests__/state-view.test.tsx` and a manual pass over each screen's empty/offline/error path.

---

## WP8 — Settings, documentation, and full verification

**Files:**
- `src/app/settings.tsx` — derive `CardSection` indices from the section order (a constant array or an incrementing counter), fix the sign-out index, use `InlineNotice` for sync state if needed; `Switch` row stays.
- `src/components/ui/card/card-row.tsx` — implement the inset divider it documents, or update the doc to match the full-bleed line; the plan recommends the inset (F14).
- `AGENTS.md` (mobile) — add a short "Card and list system" section: the archetypes, the two densities, the tier exception for `StatCell`, chip vs segmented, status ownership, tokens, and the "no per-row glass" rule.
- `docs/CARDS_AND_LISTS_PLAN.md` — mark the execution table complete and record any deviations.

**Verification:** the full suite:

```bash
npm run lint
npm run typecheck
npm test
```

Then the manual Expo Go matrix (see §5.3). Do not start a dev server/emulator/build on your own; the human partner runs the device pass.

---

# 5. Verification, risks, and acceptance

## 5.1 Automated matrix

| Contract | Test | Package |
|---|---|---|
| Action clusters never drop a control | `cardLayout.test.ts` (extended) | WP2 |
| A four-action dense row reflows before overflowing | `cardLayout.test.ts` | WP2 |
| `MediaCard`/`RowShell` render every action inline or in overflow | `row-shell.test.tsx` | WP2 |
| Tile radii are even and from the `radius` ramp | `tokens.test.ts` | WP1 |
| Meta joins never leave an empty/doubled separator | `cardMeta.test.ts` | WP1 |
| Pluralisation is correct at 0/1/2 | `cardMeta.test.ts` | WP1 |
| Status mappings are total and words are stable | `rowStatus`/domain tests | WP1/3/5 |
| Persian search matches Arabic/Persian yeh, kaf, ZWNJ, digits | `librarySearch.test.ts`/`online.test.ts` | WP1/5 |
| RTL detection and alignment policy | `textDirection.test.ts` | WP1 |
| Dividers start at the text, first row has none | `list-group.test.tsx` | WP2/6 |
| Empty/no-results/offline/error are distinct | `state-view.test.tsx` | WP7 |
| Palette and tier contrast unchanged | `tokens.test.ts` (existing) | WP1 |
| Dock geometry unchanged | `dockGeometry.test.ts` (existing) | all |

## 5.2 Risks and mitigations

1. **Visual churn on screens that already work.** Mitigation: WP2 refactors `MediaCard` without changing props or layout; screens migrate one package at a time; a diff that moves a pixel is named. The palette and motion layers are untouched.
2. **`ScrollView` → `FlatList` changes header layout, keyboard behaviour, or refresh.** Mitigation: use `ListHeaderComponent` exactly as the existing Library/Discover lists do; use `KeyboardAwareFlatList` where a field exists; keep `keyboardShouldPersistTaps="handled"` and `keyboardDismissMode="on-drag"`; verify pull-to-refresh per screen.
3. **Dense rows hide actions.** Mitigation: the overflow menu lists actions with words, not bare glyphs; the primary action (play/open) is always visible; the accessibility hint names the menu.
4. **A generic `RowShell` becomes a god-component.** Mitigation: it owns layout and overflow only. Wording stays in `lib`; tiles/status/actions are props; `MediaCard`/`ListRow`/`RecordRow` own their density and spacing. If a prop is only used by one archetype, it belongs there, not in the shell.
5. **RTL alignment fights the LTR shell.** Mitigation: `UserText` only sets `writingDirection` by default; `align="content"` is opt-in for blocks whose text is entirely RTL. Single-word columns and numeric readouts stay aligned. Manual check with Persian/English mixed titles.
6. **Large font sizes clip a dense row.** Mitigation: `rowMinHeight` is a minimum, not a fixed height; titles use 2 lines in dense rows; actions use the overflow before the title is squeezed; manual font-scale pass at 1.3.
7. **Search changes break existing highlights.** Mitigation: keep `createSearchIndex`/`searchIndex` and `Range`; add language fields without touching the track/folder/playlist field functions; the Discover result still renders `ListRow` text (no highlight is promised there).
8. **Existing test failures are mistaken for regressions.** Mitigation: the baseline is recorded in the header; run the same suites before and after a package.
9. **A new `LocalDBService` method is mocked incompletely.** This plan does not add DB methods; if one becomes necessary, add it to every `jest.mock` factory (AGENTS rule).

## 5.3 Manual Expo Go matrix (human-run)

- **Widths:** 320, 360, 412 dp (or the narrowest available device + font scale 1.3). Check Library, Playlists, Discover Browse, History, folder detail, playlist detail, online collection, Track detail.
- **Persian content:** a title with Persian yeh and ZWNJ; a mixed Persian/Latin title; a Persian language search typed with an Arabic yeh, a Persian yeh, a ZWNJ, and Persian digits.
- **Long lists:** a course with 100+ rows and a folder with 50+ rows. Scroll to the bottom and back; confirm no blank frames and that the last row clears the dock on tab screens.
- **States:** empty Library, no search results, offline Discover collection (cache notice), failed download (retry), downloaded collection (delete confirmation), missing file in Library/folder/track detail.
- **Actions:** a narrow playlist row (four actions) — play and history are visible, move/remove are in the menu; a folder card's play and open; a history record's inspect and resume-from-sheet.
- **Motion:** reduced-motion setting — reveals settle instantly; the segmented thumb lands without a spring; no row loops.
- **TalkBack:** one announcement per row, controls named, selected/disabled/expanded states spoken, notice announced.

## 5.4 Definition of done

- Every screen in §2.2 uses one of the archetypes; no hand-rolled tile + copy + actions row remains outside the primitives.
- No `ScrollView` + `map` over an unbounded row list.
- No hard-coded corner radius, tile size, control size, or bar height in a screen.
- Every multi-action row goes through `planRowLayout`; the tests prove nothing is dropped.
- `FactList`/`DetailRow` follow the tier contract; the `StatCell` exception is documented.
- Discover language search folds Persian and matches all four spellings.
- Long lists virtualise, and every `Reveal` has a `limit`.
- Empty, no-results, offline, and error states are distinct and actionable.
- `npm run lint`, `npm run typecheck`, and `npm test` pass against the recorded baseline; the Expo Go matrix is signed off by the human partner.

---

# 6. Approval gate

Reply with the decision numbers you accept or change:

- **D1** two densities (shelf + dense)
- **D2** tap verb by entity
- **D3** dense lists for homogeneous sequences
- **D4** fix fact tiers; document the stat-tile exception
- **D5** opaque chips; segmented for modes/sort
- **D6** RTL `UserText` policy
- **D7** one status vocabulary
- **D8** virtualise unbounded lists
- **D9** tile/control/list/bar token ramps
- **D10** folded language search
- **D11** empty/offline/error state language
- **D12** keep row public APIs stable during migration

Tasks 1–8 assume the recommendations above. Nothing will be edited until this gate is answered.
