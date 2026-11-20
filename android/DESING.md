# DESING.md — Pejvak Native Visual Design

> **Source of truth for the native app's look.** Based on the owner's reference mockup
> `ignoreAssets/sample.jpg` (a glassmorphism audio-player concept). Every screen in the native rewrite
> is built to this spec. Companion: [`docs/plans/01-native-rewrite.md`](docs/plans/01-native-rewrite.md)
> (feature parity) and [`AGENTS.md`](AGENTS.md) (rules).
>
> **Language decision (owner, 2026-11-14): English LTR UI.** The mockup is RTL/Russian, but its _visual
> language_ — not its text direction — is what we adopt. Persian remains first-class for **content**
> (titles, notes, tags): per-text RTL detection + a bundled Persian font. See §13.
>
> Filename is `DESING.md` exactly as the owner requested.

---

## 1. Design intent

The mockup is **glassmorphism**: frosted, translucent panels with a bright hairline edge, floating
over a soft, colorful ambient background. The mood is _ethereal, calm, fluid_ — a listening space, not
a control panel. Three rules carry the whole language:

1. **Everything floats on glass.** Cards, the dock, sheets, the mini-player, buttons — all are
   translucent panes that catch light on their top edge. There are no opaque "paper" cards and no hard
   drop shadows. Depth comes from **blur + border + fill**, not elevation shadows.
2. **The background is the color.** The UI itself is near-monochrome (white on glass); vibrancy comes
   from the ambient canvas behind it, which shifts with the content (artwork palette). This is what
   makes white text legible and the glass read as glass.
3. **Controls are bubbles.** Interactive icons live in circular glass "bubbles" (outlined or filled).
   The play button is the one filled, larger bubble; everything else is outlined. Corners are generous
   and consistent.

This **supersedes** the old `mobile/AGENTS.md` rule "opaque Card for content, glass only for floating
things." The owner explicitly asked to build on the mockup, so content cards are glass too. The old
rule existed because glass over a _near-white_ canvas measured 1.04:1 and vanished — we solve that
here by **never letting the canvas go near-white** (§2) and by enforcing a contrast contract (§11).
The old discipline (one radius ramp, tabular numerals, tier separation, one icon family, motion
governed by a preference) is kept — it is good engineering, independent of the surface style.

**Reference projects** (patterns, not code — they are GPL): Voice (calm audiobook focus, resume/sleep
UX), Auxio (rational playback), Gramophone (Material You glass), InnerTune (Compose streaming UI).

## 2. The ambient canvas (why glass works here)

Glassmorphism lives or dies by its backdrop. A frosted pane over flat white is invisible; over a
colorful, slightly dark field it glows. So the app **always** renders an ambient canvas behind every
screen:

- **DynamicCanvas** — a full-bleed, slowly drifting mesh of 2–3 large radial blooms drawn from the
  **current content's aurora ramp** (§3.5). On the Library it uses the most-recent track's palette; on
  the Player, the playing track's; on Discover/History/Notes/AI, a calm default ramp.
- The blooms are **low-frequency and low-contrast** (no hard edges, no noise), blurred heavily, and
  animated only as a very slow ambient wash (the one permitted decorative loop, and it is static under
  reduced motion).
- A **base tint** sits under the blooms so the canvas never approaches white (light theme) or pure
  black (dark theme). See §3.1 for the exact base values.
- Content scrolls **over** the canvas; the canvas is fixed (parallax-free) so glass panes always have
  something to refract.

**Fallback (API 29–30, no `RenderEffect` blur):** the canvas still renders; glass fills raise their
opacity (§3.2) so panes stay distinct without real blur. Legibility never depends on blur.

## 3. Color system

All colors live in `ui/theme/`. No color literal outside the theme. Values below are the contract;
the contrast test (§11) pins the relationships.

### 3.1 Base canvas

| Token              | Light                                     | Dark                                      | Role                                     |
| ------------------ | ----------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| `canvasBase`       | `#33505F` (deep slate-teal)               | `#0A0F16` (near-black blue)               | field under the blooms; never near-white |
| `canvasBloomA/B/C` | from content ramp **mid** stop, 20% alpha | from content ramp **mid** stop, 22% alpha | the drifting radial blooms               |
| `scrim`            | `rgba(10,16,22,0.34)`                     | `rgba(0,0,0,0.40)`                        | over artwork / behind modals             |

The light canvas is deliberately a **deep mid-tone cool color**, not white — this is the single most
important decision for readable glass in light mode. These exact values are **pinned by
`ContrastContractTest`**: white text on glass over the worst-case bloom clears 4.5:1. Blooms use the
ramp **mid** stop (not the light stop) so the field stays colorful without blowing out white text.

### 3.2 Glass recipe

| Token               | Light                                           | Dark                     | Notes                                                   |
| ------------------- | ----------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| `glassFill`         | `rgba(255,255,255,0.16)`                        | `rgba(255,255,255,0.08)` | pane body                                               |
| `glassFillStrong`   | `rgba(255,255,255,0.26)`                        | `rgba(255,255,255,0.14)` | dock, mini-player, sheets (must read over busy content) |
| `glassFillFallback` | `rgba(255,255,255,0.30)`                        | `rgba(20,28,38,0.72)`    | API 29–30 (no blur)                                     |
| `glassBorder`       | `rgba(255,255,255,0.60)`                        | `rgba(255,255,255,0.40)` | the bright hairline edge, 1–1.5 dp                      |
| `glassHighlight`    | `rgba(255,255,255,0.75)`                        | `rgba(255,255,255,0.55)` | contour rim catchlight on the top edge                  |
| `glassBlur`         | 22 dp (`frost.blur`) / 18 dp (`frost.backdrop`) | same                     | `RenderEffect` sigma (pane frost vs modal backdrop)     |

The **double-border effect** from the mockup = `glassFill` + a distinct brighter `glassBorder` stroke

- a subtle top `glassHighlight`. That trio is what makes a pane read as a glass edge catching light.

**Shell frost (`GlassHeader`, floating `subHeader` tab chips, `AppDock`, `StandaloneMiniPlayer`).**
The shell chrome samples live background layers (`AmbientCanvas` + scrolling content) via
`Backdrop.kt`, downscaled `0.5×` into a padded `CompositingStrategy.Offscreen` `GraphicsLayer` and
blurred **22 dp** with a chained `1.22×` saturation vibrancy `RenderEffect` (API 31+). Combined tint
stays near ~48–49% opacity so ~51–52% of the blurred aurora and artwork glow through.

| Token           | Light                    | Dark                     | Role                                |
| --------------- | ------------------------ | ------------------------ | ----------------------------------- |
| `frostBase`     | `rgba(40,68,82,0.22)`    | `rgba(8,18,26,0.24)`     | base slate pane behind sampled blur |
| `frostScrim`    | `rgba(30,71,82,0.22)`    | `rgba(11,40,48,0.24)`    | cool crystalline teal tint          |
| `frostSheen`    | `rgba(230,249,255,0.14)` | `rgba(223,246,255,0.12)` | pale ice surface highlight          |
| `frostFallback` | `rgba(51,80,95,0.82)`    | `rgba(6,9,15,0.86)`      | API 29–30, no blur                  |

Grain `0.12` (deterministic `64×64` tileable shader brush), soft curved top inner catchlight, and a
contour-following vertical-gradient bevel border. The material lives once in `ui/components/FrostedSurface.kt`
with `ui/components/Backdrop.kt`; content cards never use it.

### 3.3 Text on glass

| Token           | Light                    | Dark                     | Contrast target                         |
| --------------- | ------------------------ | ------------------------ | --------------------------------------- |
| `text`          | `#FFFFFF`                | `#F2F6F7`                | ≥ 4.5:1 over worst-case canvas          |
| `textSecondary` | `rgba(255,255,255,0.74)` | `rgba(240,245,246,0.72)` | ≥ 3:1                                   |
| `textTertiary`  | `rgba(255,255,255,0.52)` | `rgba(240,245,246,0.50)` | ≥ 1.30:1 vs secondary (tier separation) |

`textSecondary` and `textTertiary` **must stay measurably different** (≥ 1.30:1 between them) — the
old app shipped them at 1.07:1 and rows read as one flat block. The contrast test enforces this.

### 3.4 Accent & semantic

The mockup is monochrome white; we keep **white as the primary on-glass accent** (filled play bubble,
active nav circle, progress fill) and retain Pejvak's semantic colors for meaning:

| Token        | Light                | Dark      | Use                                                        |
| ------------ | -------------------- | --------- | ---------------------------------------------------------- |
| `accent`     | `#FFFFFF`            | `#FFFFFF` | filled play bubble, selected nav circle, seeker fill/thumb |
| `accentTeal` | `#0A635C`            | `#5FD9C6` | links, "synced", positive state, brand moments             |
| `danger`     | `#FFD7DD` (on glass) | `#FF8296` | delete/destructive, missing-file alert                     |
| `warning`    | `#FFE9C7`            | `#FFD08A` | stale cache, quota                                         |
| `onAccent`   | `#0E1720`            | `#0E1720` | glyph knocked out of a filled white bubble                 |

### 3.5 Aurora ramps (content identity)

Eight deterministic ramps `[deep, mid, light]`, assigned per track by `paletteFor(contentHash)`. Used
for the canvas blooms, identity tiles when there is no artwork, annotation-marker hues, and AI glyphs.

| Ramp   | deep      | mid       | light     |
| ------ | --------- | --------- | --------- |
| teal   | `#0A635C` | `#159A8C` | `#5FD9C6` |
| blue   | `#123A6B` | `#2D6CB5` | `#7FB6F0` |
| purple | `#3A2A6B` | `#6C4FC1` | `#B79CF0` |
| coral  | `#7A2E3A` | `#C75B6B` | `#FF9FAE` |
| amber  | `#7A4A12` | `#C78A2D` | `#FFD08A` |
| green  | `#1E5A34` | `#3E9A5F` | `#8FD9A8` |
| pink   | `#6B2A5A` | `#B54F9A` | `#F09FD9` |
| cyan   | `#0E4A5A` | `#2D8FA8` | `#7FD9E8` |

Annotation markers use the note's chosen color (a subset of these ramps); the color picker offers them.

## 4. Typography

English UI uses the **system sans** (Roboto on Android) with tabular figures for anything that counts.
Persian **content** uses bundled **Vazirmatn** (OFL) via `UserText` (§13). Weights and sizes follow the
mockup's calm hierarchy: bold titles, regular body, light metadata.

| Token        | Size / line | Weight             | Use                                      |
| ------------ | ----------- | ------------------ | ---------------------------------------- |
| `hero`       | 40 / 44     | 700                | splash / empty-state hero                |
| `display`    | 34 / 40     | 700                | large screen title                       |
| `title`      | 28 / 34     | 700                | Now Playing track title                  |
| `figure`     | 26 / 32     | 600, **tabular**   | big stat numbers                         |
| `heading`    | 20 / 26     | 600                | section headers                          |
| `body`       | 16 / 23     | 400–500            | primary copy, artist name                |
| `bodyStrong` | 16 / 23     | 700                | emphasized copy, card title              |
| `label`      | 14 / 20     | 500                | labels, buttons                          |
| `caption`    | 13 / 18     | 400                | detail line, timestamps                  |
| `overline`   | 11 / 15     | 600, +1.3 tracking | "YOUR LISTENING SPACE", section eyebrows |
| `numeric`    | 13 / 18     | 500, **tabular**   | inline counts, durations                 |

**Rules:** anything that counts (durations, play counts, stats, the seeker clock) uses tabular figures
so digits don't jitter. The three content tiers read **label → value → detail**, never inverted.
Persian content text may be larger line-height (Vazirmatn needs room for diacritics).

## 5. Shape, spacing & sizing

One strictly-increasing, even-numbered **radius ramp** with semantic aliases — never hard-code a corner.

| Token         | dp  | Alias                               |
| ------------- | --- | ----------------------------------- |
| `radius.xs`   | 8   | —                                   |
| `radius.sm`   | 12  | `badge`, `tile`                     |
| `radius.md`   | 16  | artwork (small)                     |
| `radius.lg`   | 20  | `segment`, cards, artwork (hero)    |
| `radius.card` | 28  | `panel`, glass cards                |
| `radius.xl`   | 32  | dock, sheets, Now Playing container |
| `radius.xxl`  | 40  | full-screen modal top               |
| `radius.pill` | 999 | chips, search field, mini-player    |

`tileRadius(size)` scales a tile's corner with its size. Spacing is a **4 dp rhythm**:
`0, 2, 4, 8, 12, 16, 20, 24, 32, 44, 64`. Screen padding 24; card gap 16; card inner padding 16.

| Group                       | Tokens (dp)                                  |
| --------------------------- | -------------------------------------------- |
| Tiles                       | `sm 32, md 40, lg 48, xl 56, hero 76`        |
| Controls (circular bubbles) | `sm 36, md 40, lg 44, xl 52, play 64`        |
| List                        | `rowMinHeight 56, rowPadding 8`              |
| Bars                        | `thin 4, thick 6` (seeker track 2, thumb 12) |
| Icon sizes                  | `13, 15, 18, 22, 26, 44`                     |
| Layout                      | `maxContentWidth 760`                        |

**Dock geometry:** `playerHeight == navHeight == 58`, indicator circle 40, icon 22 (active 20), touch
target 44, margin 10, inset 12. The dock's frosted backdrop blurs `AmbientCanvas` + scrolling screen
content at 22 dp (`frost.blur`), so content under it reads as luminous depth rather than a flat tint.
When the full player or a modal sheet opens, the entire underlying shell (canvas, header, sub-header
chips, dock, and mini-player) blurs uniformly at 18 dp (`frost.backdrop`). Screens read
`LocalShellInsets.bottom` (measured clearance, never a literal).

**Header geometry:** `margin 10`, `minHeight 72`, `contentPadding 20`. `GlassHeader` owns the status
bar inset and the morphing search capsule; screens mount it (plus optional floating `subHeader`
tab chips) through `ScreenFrame`, which places them outside `backdropSource(zIndex = 1f)` and
reports the combined top inset so full-bleed lists scroll smoothly behind both.

## 6. Depth: blur, borders & elevation

The mockup has **no harsh drop shadows**. Depth is a three-part recipe, in order of importance:

1. **Background blur** (custom `Backdrop` coordinator, API 31+): shell chrome (`GlassHeader`,
   floating `subHeader` `GlassChip`s, `AppDock`, `StandaloneMiniPlayer`) blurs 22 dp at `0.5×` sample
   scale with a `1.22×` saturation boost. One `Backdrop` per shell: `AmbientCanvas` (`zIndex = 0f`)
   and each screen's scroll body (`zIndex = 1f`) record sharp `GraphicsLayer`s while header, tab
   chips, and dock are crisp sibling consumers. Draw-only invalidation is driven by
   `Snapshot.registerApplyObserver`, and paused (drawing cached `effectLayer`s) while a modal blurs
   the shell at 18 dp.
2. **Bright hairline border** (`glassBorder` + contour bevel gradient, 1–1.5 dp) — the pane's edge
   catching light cleanly around rounded corners.
3. **Top rim catchlight** (`glassHighlight`, subtle curved top-edge highlight) — never a highlight
   spread over the upper half (it blows out).

A very soft ambient shadow may sit under the **dock and sheets only** (`elevation.dock`), to lift them
off busy content — but it is subtle, never the deep drop the old app used on every card. Content cards
get **no shadow**; their fill + border draw the edge.

| Elevation token | Use                                |
| --------------- | ---------------------------------- |
| `none`          | content cards, rows                |
| `dock`          | the dock + mini-player (soft, low) |
| `float`         | sheets, modals, menus (soft)       |

**API 29–30 fallback:** no blur; content glass raises to `glassFillFallback`, shell chrome paints
`frostFallback`, and border + rim stay. The pane still reads as a distinct surface; legibility never
depends on blur.

## 7. Iconography

**One family:** Material Icons (Rounded for friendly glyphs, Outlined for the bubble controls), behind
a single semantic `Icon` wrapper. Screens ask for `"play"`, `"history"`, `"trash"` — never import an
icon set directly. Stroke ~1.5–2 dp, white (`text`), sized from the icon ramp.

- Interactive icons sit in **circular glass bubbles**: outlined by default, filled white for the
  primary action (play) and the selected nav destination.
- Directional icons (back, next/prev) are **auto-mirrored** so they stay correct if content direction
  ever flips; the UI itself is LTR (§13).
- A glyph that changes meaning (play↔pause, download states) **cross-fades** (`SwapIcon`), never swaps
  in place.

## 8. Motion

Governed by `useMotionEnabled()` = OS reduced-motion × in-app `motionPreference` (system/full/reduced).
When false, substitute the final value — never rely on the platform flag alone.

- **Springs** for press/sheet/dock (bouncy press scale 1 → 0.92 → 1.05; sheet settle; dock press).
- **Now Playing morph:** the full player expands from the mini-player's measured root rect
  (shared-element style with floating artwork hand-off, corner-radius morph, and `PlayerContent`
  ↔ `MiniPlayerRow` cross-dissolve), not a generic fade/slide. Close, back, and downward swipe
  (from the header or top-of-scroll body, velocity-aware) reverse it smoothly back onto the dock
  while unblurring the underlying shell in lockstep.
- **Page transitions (ocean current & wake):** dock tab switches glide laterally along the tab
  order with `OceanSwellEasing` (`CubicBezierEasing(0.22f, 1.0f, 0.36f, 1.0f)`), detail pushes
  rise buoyantly while the parent recedes, and pops reverse cleanly. Each transition triggers a
  bounded `AmbientCanvas` aurora surge and a directional `WaveSweep` (translucent aqua crest +
  dual sine waves + pearl swimmer trailing twin `drawWaveWake` strands), both static/disabled under
  reduced motion.
- **Reveal stagger** for list entrance (index-derived, arithmetic — never hand-numbered).
- **The only unbounded animation** is `WavyProgress` (the player's ambient wave). Everything else
  (including the navigation canvas surge) is bounded; decorative loops are static under reduced motion.
- **No travel motion on the dock indicator itself** (tab switches happen hundreds of times a day) —
  the pressed spring is the whole dock-item interaction.
- Haptics via `triggerHaptic(intent)` (tap/select/press/success/warning/error/scrub), master switch,
  fires once on press.

## 9. Component specifications

Every component is a glass pane unless noted. Compose names in parentheses.

### 9.1 Surfaces

- **GlassSurface** (`GlassSurface`): the base pane — `glassFill` + `glassBorder` + top `glassHighlight`
  - blur. Variants: `content` (24 dp blur), `strong` (dock/sheets, 40 dp, `glassFillStrong`).
- **Card** (`GlassCard`): a `GlassSurface` with `radius.card`, padding 16. Content cards are glass now
  (§1). A card in a long list may drop the rim light to reduce noise, but keeps fill + border.
- **CardSection / CardRow** (`GlassSection`, `GlassRow`): settings-style grouped rows — one section per
  topic, rows with a leading glyph bubble, hairline dividers **inset to the text**, optional footer.
- **GlassSheet / Modal** (`GlassSheet`): bottom sheet or full modal on `glassFillStrong`, `radius.xl`
  top, drag handle, scrim behind. Owns its insets.

### 9.2 Rows & cards

- **RowShell** (`RowShell`): the shared anatomy — leading tile, copy (label/value/detail), action
  cluster, overflow, alignment. Never a surface itself; composes into the three archetypes:
  - **MediaCard** (`MediaCard`): shelf/identity card — artwork or `PaletteTile`, title, meta, status.
  - **ListRow** (`ListRow` in `ListGroup`): dense homogeneous sequence; the group is one card.
  - **RecordRow** (`RecordRow`): history/run record.
- **planRowLayout**: actions move inline → reflow → overflow, priority-preserving; the primary action
  never disappears; destructive actions are `menuOnly` (deliberate second tap).
- **StatusLine** (`StatusLine`): one vocabulary (`StatusSpec{kind,label,tone}`); a row carries at most
  one status line; the meta line carries the rest.
- **PaletteTile** (`PaletteTile`): artwork-less identity tile filled from the track's aurora ramp.
- **OriginBadge** (`OriginBadge`): small pill marking local vs online.

### 9.3 Controls

- **BubbleButton** (`BubbleButton`): circular glass icon button — outlined (`glassBorder`) or filled
  (`accent` white, `onAccent` glyph). Sizes from the control ramp; 44 dp min touch via padding.
- **PrimaryButton** (`PrimaryButton`): filled white pill, `onAccent` label, for the one main action.
- **GlassChip** (`GlassChip`): filter pill (a chip is a _filter_; a segmented control is a _choice_).
  Optional count badge replaces the icon. Floating tab chips rendered in `ScreenFrame.subHeader` pass
  `frosted = true` so unselected pills share the `FrostedSurface` crystalline blur of the header and
  dock; inline list/sheet chips stay unfrosted (`frosted = false`) to avoid self-sampling.
- **SegmentedControl** (`SegmentedControl`): single-choice pill group, `radius.segment`.
- **LevelSliderRow** (`LevelSliderRow`): the shared slider for volume AND tone (one control by
  construction) — glass track, white fill, glowing thumb, label that can open a picker.
- **Fields** (`TextField` + wrappers): an **inset track** (one step below its card), opaque enough to
  stay legible, `outlineStrong` border, 2 dp accent focus ring, danger ring when invalid. Visible label
  above (search is the exception — a pill with leading glyph). TextArea/Password/Search/Time/Number/
  Tag/Color/Date wrap it.

### 9.4 Player parts

- **Scrubber** (`Scrubber`): thin 2 dp track (`rgba(255,255,255,0.3)`), white fill, 12 dp glowing white
  thumb; **annotation markers** as colored dots on the track (tap = seek + show note); remaining-time
  caption (`-m:ss`) in `caption`. While waiting, sweeps an indeterminate band instead of a playhead.
- **WavyProgress** (`WavyProgress`): the ambient wave under the player (≤180 samples), the only
  unbounded animation; indeterminate sweep while waiting.
- **TransportControls** (`TransportControls`): prev / −30 / play-pause / +30 / next. Play is the 64 dp
  filled bubble (becomes a `SpinnerRing` while waiting); others 48 dp outlined bubbles.
- **SpinnerRing** (`SpinnerRing`): waiting glyph on the play bubble ("stop waiting").
- **MiniPlayerRow** (`MiniPlayerRow`): the dock's now-playing half — artwork tile, title/artist,
  play bubble + trailing controls; 1 Hz position ticks isolated to leaf composables.
- **AnnotationMarker / Composer / List**: colored marker; composer (text/tags/color at position);
  in-player note list.

### 9.5 The dock

- **AppDock** (`AppDock`): **mini-player + 5-icon nav in ONE frosted panel** — `radius.xl` with the
  mini half, `radius.pill` when nav-only, animated between them. The halves are separated by
  `HairlineWave`.
  One panel makes overlap structurally impossible. Both halves equal height (58). Nav is **icon-only**
  (five peers, no raised centre action); selected = **solid white accent circle** with the glyph
  knocked out + filled-vs-outlined swap + contour catchlight border. During normal browsing the dock is
  a sibling _after_ `backdropSource` nodes (so it blurs content without self-sampling); when a modal
  sheet or `NowPlayingSheet` opens, it sits inside the shell's 18 dp `Modifier.blur` wrapper so the
  entire background — including dock and mini-player — blurs behind the modal. Soft `elevation.dock`.

### 9.6 States

- **EmptyState / InlineNotice / SkeletonRows**: four distinct states (empty/loading/failed/offline).
  Skeleton is static (no shimmer loop); an error is a danger `InlineNotice` with retry, never a bare
  caption. Never leave a blank list.

## 10. Screen specifications

All screens render over the ambient canvas (§2) and owe the dock `dockInset`. English LTR.

### 10.1 Now Playing (full-screen modal) — the mockup's left screen

The signature screen, built closest to the reference:

- **Header:** back bubble (start), "Now Playing" centered (`heading`), options/queue bubble (end).
  Owns top insets.
- **Hero artwork:** large square, `radius.lg` (20), **double-border** (outer hairline + rounded image),
  centered upper-middle. Skip "kick" animation on track change.
- **Track info:** title (`title`, bold, white) + artist (`body`, secondary), centered. "Listened"
  readout + context chip ("4 of 12" → open collection).
- **Scrubber** with annotation markers + remaining time (§9.4).
- **Transport row** (§9.4): prev 48 / play 64 filled / next 48, plus −30/+30.
- **Speed** cycle bubble + **chip row**: Queue, Sleep, Jump-to-time, Enhancer, AI, Add-note,
  Add-to-playlist.
- **Volume + Room tone** sliders (`LevelSliderRow`), **notes list**, **status line**.
- Sheets: Queue, Sleep (5/15/30/45/60), Jump-to-time, Enhancer (boost/bass/treble), Tone picker
  (7 tones + credits), Annotation composer.
- Expands from the mini-player rect (morph); dismiss reverses.

### 10.2 Home / Library — the mockup's right screen

Adapts the mockup's browse layout to Pejvak's five views:

- **Header:** menu/settings bubble (start), "Library" title + "YOUR LISTENING SPACE" overline,
  search bubble (end) → expands the global **SearchField**.
- **Continue listening** spotlight: large featured `MediaCard` (the mockup's "Interesting" card) —
  artwork background, scrim, title + resume, bottom-start aligned.
- **Segmented control + pager** over: **Tracks** (Local/Online sub-segment), **Folders**, **Playlists**
  (+ SMART section), **Recent**, **Online shelf**. The mockup's horizontal playlist carousel maps to
  the Playlists/Recent shelves (horizontal `MediaCard` rows); lists of tracks/folders are vertical
  `ListGroup`s.
- Language pill + first-run language prompt; missing-files alert; "Add audio" → import.
- Global search shows per-view match-count badges + "Also N under X".

### 10.3 Discover

Three swipeable pages — **Continue** (online runs, resume + download state), **Favorites** (saved
collections), **Browse** (46 languages, searchable). Collection cards are glass `MediaCard`s with
favorite toggle + download action + status line. No network on mount.

### 10.4 History

Segmented **History / Stats**. History = day-sectioned stretch cards + a Collections (runs) view;
search, date-range chip, sort, pull-to-refresh, Markdown export. Row tap → SessionDetailSheet
(timeline, facts, Resume, Delete). Stats = local aggregates in a tabular-figure grid.

### 10.5 Notes

All annotations joined with track; search (highlighted) by text/tags/track/folder; date-range chip;
rows → SessionDetailSheet (note mode); delete w/ confirm. Virtualized glass list.

### 10.6 AI

Hero + 2×2 grid of four coming-soon tools (glass cards, aurora ramp, `AiGlyph` tinted disc, "SOON"
pill). Tool screen: glyph in concentric rings, "Coming soon." headline + pinned body. No service.

### 10.7 Detail screens

Track / Folder / Playlist / Smart / Online-collection — glass header (artwork, title, primary action),
stat grid, fact sections, per-track rows, context-history + add-to-playlist. Online collection adds
DownloadControl + series sections.

### 10.8 Auth / Settings / Import

- **Auth:** centered brand mark, glass form card (email/password or register fields), primary button,
  keyboard-aware. Login ↔ Register link.
- **Settings:** grouped `CardSection`s (Account, Playback, Appearance, Motion, Storage & Sync, Library,
  Developer, Sign out) — glass rows with glyph bubbles, inset dividers.
- **Import wizard:** phase stepper (choose → scanning → preview → importing → done), scan plan rows
  with status chips, "new only" toggle, outcome summary.

## 11. Accessibility & the contrast contract

Glassmorphism's failure mode is invisible hierarchy. We prevent it with a **tested contract**
(`ui/theme` test, mirrors the old `tokens.test.ts`):

- Every **text/surface pair** clears its target: `text` ≥ 4.5:1, `textSecondary` ≥ 3:1 over the
  _worst-case_ canvas (the lightest bloom under the thinnest glass).
- **Tier separation:** `textSecondary` vs `textTertiary` ≥ 1.30:1 (never the same grey twice).
- **Card-to-canvas step:** a glass pane must be distinguishable from the canvas (fill + border delta).
- **Filled-bubble glyph:** `onAccent` on `accent` ≥ 4.5:1.
- **A palette edit that breaks legibility fails the suite. Never weaken a threshold to make it pass.**

Because glass sits over a _variable_ canvas, the test computes contrast against the worst-case
backdrop, not a fixed surface. The mid-tone light canvas (§3.1) is what makes white text pass.

Also: 44 dp minimum touch targets (bubbles pad to it), tabular figures for counts, content descriptions
on every icon button, focus order follows reading order, and reduced-motion substitutes final values.

## 12. Light & dark themes

Both are first-class, switched by `themePreference` (System/Light/Dark). The difference is the
**canvas base** and **glass opacity**, not the structure:

- **Light:** mid-tone cool canvas (`#5E7F92` + blooms), white glass at 16%/26%, white text. Feels like
  frosted glass over a colored sky.
- **Dark:** near-black canvas (`#0A0F16` + dimmer blooms), white glass at 8%/14%, near-white text.
  Feels like glass over deep water.

The aurora ramps, accent, and semantic colors are shared; only canvas/glass/text alphas differ. The
Now Playing artwork scrim is constant. Theme tokens are the single source; no screen hard-codes a mode.

## 13. Persian / RTL content handling

The **UI is English LTR** (owner decision). Persian is **content**, handled per-text:

- **UserText** detects the first strong directional character of a string; if RTL (Persian/Arabic),
  it renders that text with `LayoutDirection.Rtl` and the bundled **Vazirmatn** font, regardless of the
  surrounding LTR layout. Mixed strings use the platform's bidi algorithm.
- **Search folding** (`core/search`): normalize ي/ى→ی, ك→ک, hamza carriers→ا, ة/ۀ→ه, ؤ→و, Persian/
  Arabic digits→ASCII, drop ZWNJ/ZWJ/tatweel — fold once per data load, never per keystroke. A raw
  `contains()` over user-visible text is a bug.
- **Tags** fold before de-duplication (كتاب and کتاب are one tag).
- Layout direction is never hard-coded; use start/end so the shell could flip if a future locale needs
  it, but the shipped UI is LTR.

## 14. Assets

- **App icon / adaptive / splash:** reuse the existing Pejvak art (`ignoreAssets/AppIcon*`,
  `mobile/assets/images/*`), adaptive background `#2F2690`. Splash holds until fonts + auth + settings.
- **Persian font:** bundle **Vazirmatn** (OFL) under `res/font/` for `UserText`.
- **Ambient tones:** reuse the six field recordings from `mobile/assets/tones/`
  (rain/forest/river/ocean/wind/birds, normalised to −18.4 dBFS RMS) + the generated room tone.
  **Credits are mandatory** (CC0/BY/BY-SA) and shown in the tone picker.
- **No artwork bundled** — identity tiles use aurora ramps; real artwork comes from files/streams.
- Default canvas blooms are drawn in code (no image assets needed).

## 15. Compose implementation notes

- **Blur:** `Backdrop.kt` uses custom `Modifier.Node`s (`DrawModifierNode` + `GlobalPositionAwareModifierNode`
  - `requireGraphicsContext()`) to record `AmbientCanvas` (`zIndex = 0f`) and `ScreenFrame` body
    (`zIndex = 1f`) into unblurred `GraphicsLayer`s, invalidated at the draw phase via
    `Snapshot.registerApplyObserver`. Each `FrostedSurface` pane renders `BackdropBlur` into a `0.5×`
    downscaled, blur-padded `CompositingStrategy.Offscreen` layer with
    `RenderEffect.createChainEffect(vibrancy, createBlurEffect(sigma, sigma, Shader.TileMode.CLAMP))`
    on API 31+ (gated by `Build.VERSION.SDK_INT >= 31`; API 29–30 renders `frostFallback`). While
    `modalOpen` blurs the whole shell via `Modifier.blur(18.dp)`, `backdrop.paused = true` reuses the
    cached `effectLayer` without re-recording.
- **Glass pane:** `GlassSurface` uses `clip(shape)` + `background(glassFill)` + `border(1.dp, glassBorder, shape)`
  - top `glassHighlight`; `FrostedSurface` layers `frostBase` + `BackdropBlur` (or `frostFallback`) +
    `frostScrim` + `frostSheen` + tileable micro-grain + subtle top catchlight + contour-gradient bevel
    border.
- **Canvas:** a `Canvas`/`drawBehind` composable painting 2–3 radial gradients from the ramp, slowly
  animated via `rememberInfiniteTransition` (static under reduced motion).
- **Dock:** one `GlassSurface(strong)` `Column` of two equal-height rows; nav uses `IconButton`s with a
  selected white-circle background. Sibling of content, aligned bottom, `windowInsets` aware.
- **Now Playing morph:** shared-element transition (`SharedTransitionLayout`) between the mini-player
  artwork/rect and the full player; fallback to an expand animation if shared elements are awkward.
- **State:** `StateFlow` + `collectAsStateWithLifecycle`; isolate the 1 Hz position tick to leaf
  composables (seeker clock, wave) so the artwork/control row don't recompose every second.
- **Theme:** all tokens in `ui/theme/`; `MaterialTheme` colorScheme mapped from the glass tokens;
  custom `LocalPejvakTokens` for spacing/radius/ramps/type.

## 16. Do / Don't

**Do**

- Keep the canvas mid-tone (light) / near-black (dark) so glass and white text stay legible.
- Use the one radius ramp, 4 dp spacing rhythm, tabular figures, one icon family.
- Make the play bubble the single filled white accent; selected nav = filled white circle.
- Enforce the contrast contract; test against the worst-case canvas.
- Isolate high-frequency ticks to leaves; honor reduced motion.

**Don't**

- Don't put glass over a near-white canvas (the old 1.04:1 failure) — the canvas base prevents this.
- Don't add hard drop shadows to content cards; depth is blur + border + rim light.
- Don't hard-code a corner, a color, a direction, or a dock clearance literal.
- Don't reintroduce a raised centre nav action or per-tab labels (five icon-only peers).
- Don't spread a highlight over a pane's upper half; rim light is a 3 dp top edge.
- Don't copy GPL code from reference projects; patterns only.
- Don't weaken a contrast threshold to make a palette edit pass.
