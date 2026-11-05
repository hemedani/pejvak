# Pejvak Web — Rebrand Design

_Written 2026-11-04. This is the design source of truth for the web client after the
divergence from the phone's visual identity. The implementation plan is
[`../plans/2026-11-04-pejvak-rebrand-foundation.md`](../plans/2026-11-04-pejvak-rebrand-foundation.md)._

---

## 1. Intent

The phone app is the place listening happens. The web console is the place the listener
**understands** what they listened to: the library, the history, the statistics, the player,
and the operator panel. Its current visual language was transcribed from the phone. That was
right when the web was a port; it is wrong now that it is a console.

The rebrand gives the web its own identity: **calm, premium, editorial**. Paper and ink
rather than glass and chrome. A display serif for the things a reader reads; the platform's
own sans for the things a listener scans, types, and trusts as data. Generous space, quiet
structure, motion that explains a change and then gets out of the way.

**Why now.** The system is already documented and tokenised, which makes a rebrand cheap to
execute and easy to police. The remaining defects are the kind a coat of paint hides rather
than fixes, so this is the moment to fix them and make the rules executable.

**Success looks like:** a first-time visitor can tell this is a listening product, not a
generic dashboard; the four numbers on Home are the first thing the eye finds; a Persian
catalogue title sits correctly inside an English LTR page; and the interface never moves
without a reason.

---

## 2. Goals, non-goals, anti-goals

### Goals

- A distinctive, coherent web identity that no longer pretends to be the phone.
- A token layer that owns colour, type, space, shape, elevation, layout and motion.
- Verified UI defects fixed rather than restyled around.
- Motion applied consistently, with `prefers-reduced-motion` treated as a first-class state.
- Every touched surface holds up in light, dark, narrow viewport, coarse pointer, and Persian
  catalogue content.
- The rules become executable: design-contract tests fail when a token, contrast pair, or
  scale is broken.

### Non-goals

- No new product features. No new acts, no new data surfaces, no new pages.
- No rewrite of the player engine, session math, sync, or auth.
- No change to the listener/admin act surface or the wire format.
- No mobile redesign. The phone keeps its identity; the web diverges visually.
- No new component library, CSS-in-JS, or animation dependency.

### Anti-goals (a failure even if it looks good)

- A rebrand that breaks the documented product rules: English/LTR, two materials, four states,
  token-first, reduced motion, WCAG AA.
- A "premium" look achieved by lowering contrast, shrinking body text, or animating values that
  are also facts.
- A stylesheet that only works for Latin copy and mangles a Persian title.
- A change set too large to review, shipped as one commit.

---

## 3. Constraints and invariants

These survive the rebrand and are checked in the plan.

1. **English-only UI, LTR document.** Catalogue data may be Persian; `dir="auto"` marks it.
2. **Two materials.** Opaque `surface` for anything read; glass only for what floats.
3. **Four states.** Skeleton, empty, error, offline on every data surface.
4. **Token-first.** No literal colour, spacing, radius, type size, or motion duration in a
   component. Component-local dimensions (a chart's plot height) are allowed.
5. **Reduced motion.** Every animation collapses duration *and* delay.
6. **Accessibility.** WCAG AA for text and controls; 44 px minimum touch target on coarse
   pointers; focus ring survives light, dark, and forced colours.
7. **No network at build or runtime.** Fonts are vendored under `public/fonts`.
8. **The gate is `npm run check`.** A phase is done when it is green.

### The one documented divergence

`src/styles/tokens.css` currently says it is a transcription of
`mobile/src/theme/tokens.ts`. After this rebrand that is false. The web owns its visual
identity; it still shares **product rules** (states, semantics, the act surface, the offline
model) with the phone, but not the palette, type, shape, or motion. The tokens file header and
`front/AGENTS.md` must say so in the same change.

---

## 4. Identity direction

**Name of the direction:** _Ink and paper._

| Property | Decision |
|---|---|
| Canvas | Warm paper, not cool blue-grey |
| Surfaces | Warm white, opaque; sunken paper for wells |
| Ink | Warm near-black, not blue-black |
| Accent | Deep library green; a mark of state and action, never decoration |
| Danger | Muted oxblood; serious without shouting |
| Display type | Newsreader (self-hosted variable serif) for headings and titles |
| Body/data type | The platform sans; tabular figures for anything that counts |
| Shape | Soft but not pill-heavy; cards at 22 px, not 28 |
| Space | More air than the phone: 24/32/40/56/80 px on the upper ramp |
| Motion | 120/180/300/360 ms; opacity and transform only; no decorative loops |
| Reference feel | A literary magazine's contents page, not a SaaS dashboard |

The per-track palette in `lib/palette.ts` still colours artwork and the ambient wash. The
chrome around it is neutral so the artwork is the only thing shouting.

---

## 5. Design language

### 5.1 Colour

All values are web-owned. Contrast ratios were computed against the actual surfaces; the
pairs the plan tests are marked **AA**.

#### Light

| Token | Value | Notes |
|---|---|---|
| `--canvas` | `#f6f3ed` | warm paper |
| `--canvas-elevated` | `#fbf9f4` | sidebar / raised background |
| `--surface` | `#fffdf8` | read surfaces |
| `--surface-sunken` | `#efebe2` | wells, fields, skeletons |
| `--outline` | `#cfc8ba` | hairline |
| `--outline-strong` | `#857c6c` | control border; 4.05:1 on surface (non-text OK) |
| `--outline-variant` | `#e4ded2` | dividers |
| `--glass` | `rgba(255,253,248,0.78)` | floating only |
| `--glass-strong` | `rgba(255,253,248,0.92)` | menus |
| `--glass-border` | `rgba(30,28,24,0.14)` | visible on near-white |
| `--glass-highlight` | `rgba(255,255,255,0.95)` | |
| `--shadow` | `rgba(30,28,24,0.14)` | warm shadow |
| `--text` | `#1b1a17` | 13.7:1 on canvas |
| `--text-secondary` | `#4a4740` | 7.1:1 on canvas |
| `--text-tertiary` | `#666257` | 5.5:1 on canvas, 5.1:1 on sunken **AA** |
| `--accent` | `#2c5a4a` | 7.1:1 on canvas **AA** |
| `--accent-soft` | `rgba(44,90,74,0.10)` | 6.66:1 accent text on it |
| `--on-accent` | `#fffdf8` | 7.74:1 on accent **AA** |
| `--danger` | `#a0343f` | 6.2:1 on canvas **AA** |
| `--danger-soft` | `rgba(160,52,63,0.10)` | 5.79:1 danger text on it |
| `--scrim` | `rgba(20,18,14,0.40)` | |
| `--track` | `rgba(74,71,64,0.18)` | |
| `--icon` | `#3a3832` | |

#### Dark

| Token | Value | Notes |
|---|---|---|
| `--canvas` | `#141311` | warm near-black |
| `--canvas-elevated` | `#1c1a17` | |
| `--surface` | `#211f1b` | |
| `--surface-sunken` | `#2a2722` | |
| `--outline` | `#4a463e` | |
| `--outline-strong` | `#877f71` | 4.16:1 on surface (non-text OK) |
| `--outline-variant` | `#35312a` | |
| `--glass` | `rgba(33,31,27,0.72)` | |
| `--glass-strong` | `rgba(35,33,28,0.90)` | |
| `--glass-border` | `rgba(246,243,237,0.20)` | |
| `--glass-highlight` | `rgba(255,255,255,0.20)` | |
| `--shadow` | `rgba(0,0,0,0.55)` | |
| `--text` | `#f4f0e8` | |
| `--text-secondary` | `#c4bdb0` | |
| `--text-tertiary` | `#9a9386` | 5.4:1 on surface **AA** |
| `--accent` | `#8fc9b4` | 8.76:1 on surface **AA** |
| `--accent-soft` | `rgba(143,201,180,0.16)` | 6.23:1 accent text on it |
| `--on-accent` | `#0b211a` | 8.97:1 on accent **AA** |
| `--danger` | `#f0a0a8` | 8.07:1 on surface **AA** |
| `--danger-soft` | `rgba(240,160,168,0.14)` | 6.11:1 danger text on it |
| `--scrim` | `rgba(0,0,0,0.60)` | |
| `--track` | `rgba(196,189,176,0.20)` | |
| `--icon` | `#e4ded2` | |

### 5.2 Type

**Families**

- `--font-display`: `"Newsreader", "Vazirmatn", "Iowan Old Style", "Palatino Linotype",
  Georgia, serif`.
- `--font-sans`: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
  "Vazirmatn", sans-serif`.

Newsreader is vendored (Latin + Latin-ext, variable 400–700, with the optical-size axis).
Vazirmatn stays in both stacks so a Persian title renders in a face designed for it. The
fallback is per glyph, so English copy never waits for Vazirmatn.

**Scale**

| Class | Size / line | Weight | Family | Tracking |
|---|---|---|---|---|
| `type-hero` | 44 / 48 | 500 | display | −1.2 px |
| `type-display` | 36 / 42 | 500 | display | −0.9 px |
| `type-title` | 30 / 36 | 500 | display | −0.6 px |
| `type-figure` | 30 / 34 | 600 | sans | −0.4 px, tabular |
| `type-heading` | 22 / 28 | 500 | display | −0.3 px |
| `type-body` | 16 / 24 | 400 | sans | −0.1 px |
| `type-body-strong` | 16 / 24 | 600 | sans | −0.1 px |
| `type-label` | 14 / 20 | 500 | sans | 0 |
| `type-caption` | 13 / 19 | 400 | sans | 0.05 px |
| `type-overline` | 11 / 15 | 600 | sans | 1.4 px, uppercase |
| `type-kicker` | 12 / 16 | 500 | sans | 0, no uppercase |
| `type-numeric` | 13 / 18 | 600 | sans | 0.2 px, tabular |

Rules:

- Headings and page titles use the display serif. Body, labels, captions, controls and data
  use the sans.
- Figures stay sans and tabular. A number that shifts width as it ticks is a layout bug.
- `type-overline` is for **English UI labels only** (PageHeader and CardHeading eyebrows). A
  catalogue title or album name uses `type-kicker`: uppercase and letter-spacing are wrong for
  Persian data.
- No letter-spacing or word-spacing on RTL text. Add a `[dir="rtl"]` reset and `dir="auto"` on
  data-bearing text.

### 5.3 Space

4 pt rhythm: `2, 4, 8, 12, 16, 24, 32, 40, 56, 80`.
Names stay `xxs, xs, sm, md, lg, xl, xxl, xxxl, huge, giant`.
The upper ramp grows; that is where the editorial calm comes from.

### 5.4 Shape

One strictly increasing ramp. Components ask for a step, never pixels.

`2xs 4 · xs 6 · sm 10 · md 14 · lg 18 · card 22 · xl 28 · xxl 36 · pill 999`

`2xs` is new and exists for highlight marks, dots and hairlines that should not inherit a card
radius.

### 5.5 Elevation

- Card: `0 1px 3px var(--shadow)` — a card is a shape, not a dialog.
- Panel: `0 10px 28px var(--shadow)`.
- Float: `0 18px 44px var(--shadow)`.

### 5.6 Controls and layout

| Token | Value |
|---|---|
| `--control-sm` | 36 px |
| `--control-md` | 44 px |
| `--control-lg` | 52 px |
| `--control-thumb` | 18 px |
| `--tap-min` | 44 px |
| `--layout-sidebar` | 264 px |
| `--layout-topbar` | 64 px |
| `--layout-content` | 1180 px |
| `--layout-player` | 760 px |
| `--layout-player-bar` | 80 px |
| `--layout-artwork` | 360 px |
| `--measure-prose` | 68 ch |
| `--measure-narrow` | 44 ch |
| `--measure-form` | 420 px |

On `(pointer: coarse)`, any control smaller than `--tap-min` gets a 44 px interaction height.

### 5.7 Motion

Tokens: `--motion-fast: 120ms`, `--motion-base: 180ms`, `--motion-slow: 300ms`,
`--motion-reveal: 360ms`, `--motion-distance: 8px`, `--stagger-step: 45ms`.
Easing: `--ease-out: cubic-bezier(0.22,1,0.36,1)`, `--ease-in`, `--ease-in-out`.

Vocabulary:

- **Route change:** 180 ms fade + 6 px rise on the page content, keyed by pathname.
- **First paint:** staggered reveal, max 10 steps, opacity + 8 px rise.
- **Floating surfaces:** sheet up/down, menu fade, overlay fade. Open and close both animate.
- **Interaction:** press scale 0.97 on controls; colour transitions at 120 ms.
- **Theme switch:** browser View Transitions cross-fade when available; instant fallback.
- **Loading:** a shimmer that moves by background-position; no layout property animates.
- **Player:** the wave remains the only continuous motion. Track changes fade the artwork in.

Rules:

- Animate opacity and transform. Never animate layout properties.
- Never animate a value that is also a fact (a number, a position, a duration).
- `prefers-reduced-motion` collapses duration **and** delay, and disables the theme
  cross-fade and the shimmer.

---

## 6. Catalogue content rules

- The document is LTR. A Persian title is the one local RTL run.
- Mark data-bearing text with `dir="auto"`: titles, album names, authors, narrators,
  collection titles, annotation text, playlist names.
- Do not uppercase, letter-space, or negatively track data text. The `[dir="rtl"]` reset and
  the `type-kicker` split are how this is enforced.
- UI labels stay English, in the sans, and may be uppercase/tracked.

---

## 7. Verified defects to fix

Only defects with a source or rendered contract are listed. Each maps to a phase-1 task.

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 1 | `StatCell` makes the label loud and the figure quiet. | `src/components/domain/stat-cell.tsx:39` label `text-text`; `:44` value `text-text-secondary`. The card exists to show the figure. | Figure `type-figure text-text`; label `type-caption text-text-secondary`. |
| 2 | The library's "Added" column promises a date and prints plays · duration; worse, `TrackSummary` does not carry `createdAt`, so it cannot print the date. | `src/components/domain/track-table.tsx:64-70,96-100`; `src/lib/domain/track.ts:16-35` has no `createdAt`; `TRACK_SUMMARY_GET:37-55` does not project it. | Add `createdAt` to `TrackSummary`/projection/parser; render `formatRelativeTime(createdAt)` with `formatDateTime` in `title`. |
| 3 | The history row's duration is louder than the time range, and a third caption line repeats what the detail sheet says better. | `src/components/domain/history-row.tsx:137-160`; UI-REVIEW §3.1.3, §3.2.5. | Time range `text-secondary`; duration `text-tertiary`; drop the position/speed line. |
| 4 | No route transition anywhere. | No `template.tsx`; UI-REVIEW §2.3. | `PageTransition` keyed by pathname. |
| 5 | Reveal is applied to two surfaces out of eight. | `src/app/(shell)/page.tsx` and `history-sections.tsx` only; UI-REVIEW §3.3.7. | Apply to library, playlists, browse, track tables and grids. |
| 6 | English display tracking/uppercase can reach Persian catalogue data. | `src/components/player/player-screen.tsx:183` renders an album/context title with `type-overline` (1.3 px tracking); `type-title`/`type-heading` carry negative tracking. | `type-kicker` for data; `dir="auto"`; `[dir="rtl"]` tracking reset. |
| 7 | Spacing and control sizes bypass the token ramp. | 60 hits for arbitrary `[Npx]` values; e.g. `mt-[2px]`, `mt-[3px]`, `mt-[6px]`, `mt-[7px]`, `gap-[2px]`, `p-[3px]`, `h-[52px]`, `size-[18px]`, `text-[10px]`. | Replace with `--space-*`, `--control-*`, `--radius-2xs`, `type-overline`. |
| 8 | Sheets have no exit animation and an unclamped title. | `src/components/player/sheet.tsx:39-47` open-only; `:55` `Dialog.Title` no clamp; UI-REVIEW §3.6.16. | Add closed-state animations; `line-clamp-2` + `title`. |
| 9 | The scrubber's hit band is 36 px on touch. | `src/components/player/scrubber.tsx:109` `h-9`; UI-REVIEW §3.4.11. | `coarse:h-[var(--tap-min)]`. |

Not defects, but brand decisions recorded here: body weight drops from 500 to 400; cards tighten
from 28 px to 22 px; the upper spacing ramp grows; headings become a serif.

---

## 8. Phased roadmap

### Phase 1 — Foundation and the listening core (this plan)

Tokens, font, type, motion, primitives, shell, dashboard, library, history, RTL, visual QA,
docs. Ends with a working, screenshot-verified console.

### Phase 2 — The rest of the listener shell

Playlists (list, detail, editor), settings, browse (index, language, source, collection),
auth/login, root error/loading/not-found. Same primitives and motion rules; no new tokens.

### Phase 3 — The player

Player screen composition, scrubber/wave, transport, speed/volume, queue sheet, sleep/jump
sheets, annotation list/composer, ambient wash. The wave and timeline stay the signature
motion; the control row is regrouped (transport-adjacent vs utilities) per UI-REVIEW §3.4.10.

### Phase 4 — Admin console

Admin nav, tables, forms, charts, dialogs. Admin keeps the same tokens but may use a denser
spacing mode for tables. Listener and admin must not fork primitives.

### Phase 5 — Polish

Long-content passes, empty/error/offline states, forced-colours, print, reduced-motion audit,
visual regression snapshots.

Each phase is "done" when `npm run check` is green, dark/light/narrow/coarse/reduced-motion
screenshots are captured and inspected, and no touched component contains a literal visual
value outside a component-local dimension.

---

## 9. Calls made in this document

- **Newsreader** over Fraunces/Source Serif: literary, calm, variable, and self-hostable; its
  optical-size axis helps at 22–44 px.
- **Deep green** over oxblood as the accent: green reads as "playing / saved / present" without
  competing with the per-track palette; oxblood is reserved for danger.
- **Warm neutral** over cool blue-grey: the editorial direction needs paper, not slate.
- **Figures stay sans**: serif figures at 13–30 px are harder to compare in a column.
- **No animation library**: the existing CSS vocabulary covers route, reveal, sheet, menu,
  press, theme and skeleton. A library would be a second motion system.
- **Web diverges from mobile**: product rules stay shared; the visual identity does not.
