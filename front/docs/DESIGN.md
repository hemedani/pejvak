# Web design system

_The durable design source of truth for the Pejvak browser console. Introduced by the
2026-11 rebrand; the full rationale lives in
[the phase 1 spec](./superpowers/specs/2026-11-04-pejvak-rebrand-design.md) and
[the implementation plan](./superpowers/plans/2026-11-04-pejvak-rebrand-foundation.md)._

## Identity

**Ink and paper.** The console is a literary magazine's contents page, not a generic
analytics dashboard: a warm paper canvas, opaque warm-white surfaces, warm near-black ink,
and one deep library green used only for state and action. Newsreader sets the headings;
the platform sans carries the labels, the body and every number. Artwork supplies the
colour — the chrome around it stays neutral.

The screen should read **figure first**. On Home the four numbers are what the eye finds
before their labels; everywhere else the value a surface exists to show owns the loudest
tier, and its label steps back.

---

## Colour

All values are web-owned. `src/styles/tokens.css` is the source; never copy a hex into a
component. Contrast ratios are measured against the canvas or surface named in the spec.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--canvas` | `#f6f3ed` | `#141311` | page background |
| `--canvas-elevated` | `#fbf9f4` | `#1c1a17` | sidebar / raised background |
| `--surface` | `#fffdf8` | `#211f1b` | opaque read surfaces |
| `--surface-sunken` | `#efebe2` | `#2a2722` | wells, fields, skeletons |
| `--outline` | `#cfc8ba` | `#4a463e` | hairline |
| `--outline-strong` | `#857c6c` | `#877f71` | control border (non-text, AA) |
| `--outline-variant` | `#e4ded2` | `#35312a` | dividers |
| `--glass` | `rgba(255,253,248,.78)` | `rgba(33,31,27,.72)` | floating surfaces only |
| `--glass-strong` | `rgba(255,253,248,.92)` | `rgba(35,33,28,.90)` | menus and sheets |
| `--glass-border` | `rgba(30,28,24,.14)` | `rgba(246,243,237,.20)` | edge on glass |
| `--glass-highlight` | `rgba(255,255,255,.95)` | `rgba(255,255,255,.20)` | top highlight |
| `--shadow` | `rgba(30,28,24,.14)` | `rgba(0,0,0,.55)` | warm shadow |
| `--text` | `#1b1a17` | `#f4f0e8` | the value/title the surface exists to show |
| `--text-secondary` | `#4a4740` | `#c4bdb0` | its label and supporting copy |
| `--text-tertiary` | `#666257` | `#9a9386` | detail, de-emphasised metadata |
| `--accent` | `#2c5a4a` | `#8fc9b4` | action and state; never decoration |
| `--accent-soft` | `rgba(44,90,74,.10)` | `rgba(143,201,180,.16)` | accent wash |
| `--on-accent` | `#fffdf8` | `#0b211a` | text on accent (AA) |
| `--danger` | `#a0343f` | `#f0a0a8` | destructive / error (AA) |
| `--danger-soft` | `rgba(160,52,63,.10)` | `rgba(240,160,168,.14)` | danger wash |
| `--scrim` | `rgba(20,18,14,.40)` | `rgba(0,0,0,.60)` | overlay |
| `--track` | `rgba(74,71,64,.18)` | `rgba(196,189,176,.20)` | slider track |
| `--icon` | `#3a3832` | `#e4ded2` | icon stroke |

**Tiers are not interchangeable.** `--text` is the reading tier; `--text-secondary` is its
label and supporting copy; `--text-tertiary` is detail. A label must never outshout the
value it introduces. `--text-tertiary` still clears AA on `--surface-sunken` (5.1:1
light, 5.4:1 dark), which is why it may carry metadata.

---

## Type

**Families**

- `--font-display`: `"Newsreader", "Vazirmatn", "Iowan Old Style", "Palatino Linotype",
  Georgia, serif`
- `--font-sans`: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
  "Vazirmatn", sans-serif`

Newsreader is vendored under `public/fonts` (Latin + Latin-ext, variable 400–700, optical
size). Vazirmatn stays in both stacks so Persian catalogue text renders in a face designed
for it. Fallback is per glyph, so English never waits for Vazirmatn.

**Scale** — defined as `.type-*` in `src/app/globals.css`. Components ask for a step, never
a size.

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

**Rules**

- Headings and page titles use the display serif. Body, labels, captions, controls and data
  use the sans.
- Figures stay sans and tabular. A number that changes width as it ticks is a layout bug.
- `type-overline` is for **English UI labels only**. Catalogue data uses `type-kicker`;
  uppercase and letter-spacing are wrong for Arabic script.
- No letter-spacing or word-spacing on RTL text. `[dir="rtl"]` and `[dir="auto"]:dir(rtl)`
  are reset in `globals.css`.

---

## Space

A 4 pt rhythm with a growing upper ramp — the air is where the editorial calm comes from.

`2 · 4 · 8 · 12 · 16 · 24 · 32 · 40 · 56 · 80`

Names: `--space-xxs xs sm md lg xl xxl xxxl huge giant`.

---

## Shape

One strictly increasing ramp. Components ask for a step, never pixels.

`2xs 4 · xs 6 · sm 10 · md 14 · lg 18 · card 22 · xl 28 · xxl 36 · pill 999`

`--radius-2xs` exists for highlight marks, dots and hairlines that must not inherit a card
radius.

---

## Elevation

| Token | Value | Use |
|---|---|---|
| `--elevation-card` | `0 1px 3px var(--shadow)` | a card is a shape, not a dialog |
| `--elevation-panel` | `0 10px 28px var(--shadow)` | panels |
| `--elevation-float` | `0 18px 44px var(--shadow)` | menus, sheets, the player bar |

---

## Controls, layout and measures

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

On `(pointer: coarse)`, any control smaller than `--tap-min` gets a 44 px interaction
height (`coarse:h-[var(--tap-min)]`).

---

## Motion

**Tokens:** `--motion-fast 120ms`, `--motion-base 180ms`, `--motion-slow 300ms`,
`--motion-reveal 360ms`, `--motion-distance 8px`, `--stagger-step 45ms`.
**Easing:** `--ease-out cubic-bezier(.22,1,.36,1)`, `--ease-in`, `--ease-in-out`.

**Vocabulary**

- **Route change:** 180 ms fade + 6 px rise, keyed by pathname (`PageTransition`).
- **First paint:** staggered reveal, max 10 steps, opacity + 8 px rise (`Reveal`).
- **Floating surfaces:** sheet up/down, menu fade, overlay fade. Open *and* close animate.
- **Interaction:** press scale 0.97; colour transitions at 120 ms.
- **Theme switch:** View Transitions cross-fade when available; instant fallback.
- **Loading:** a shimmer that moves by background-position; no layout property animates.
- **Player:** the wave is the only continuous motion. Track changes fade the artwork in.

**Rules**

- Animate opacity and transform. Never animate layout properties.
- Never animate a value that is also a fact (a number, a position, a duration).
- `prefers-reduced-motion` collapses duration **and** delay, and disables the theme
  cross-fade and the shimmer.

---

## Rules

1. **Two materials.** Opaque `surface` for anything read. Glass only for what floats — the
   player bar, menus, sheets, overlays. A frosted content card is the mistake the split
   exists to prevent.
2. **Four states, not one.** Every data surface renders skeleton, empty, error or offline.
   A blank list is a bug.
3. **Token-first.** No literal colour, spacing, radius, type size or motion duration in a
   component. Component-local dimensions (a chart's plot height) are allowed.
4. **Reduced motion is a first-class state.** Collapse duration and delay; never leave
   content invisible behind an animation.
5. **WCAG AA.** Text and controls clear AA in light and dark. Touch targets are at least
   44 px on coarse pointers. Focus rings survive both themes.
6. **English UI, LTR document.** `dir="ltr"` on `<html>`; logical properties only. Catalogue
   content is data, not copy: mark it `dir="auto"` (or a local RTL span) and never translate,
   uppercase or letter-space it.
7. **No network at build or runtime.** Fonts are vendored under `public/fonts`.
8. **The gate is `npm run check`.** A phase is done when it is green.

---

## Where to change what

| Change | Goes in |
|---|---|
| A colour, radius, spacing step, control size, layout measure, motion token | `src/styles/tokens.css` |
| A type step, keyframe, motion utility, RTL reset, base layer | `src/app/globals.css` |
| A button, input, card, badge, dialog, icon, state | `src/components/ui/` — extend the primitive, do not copy it |
| A repeated product pattern (a stat, a row, a table) | `src/components/domain/` (or a new primitive if it is generic) |
| Shell chrome, navigation, player bar | `src/components/layout/`, `src/app/(shell)/layout.tsx` |
| A Persian catalogue string | Render it; do not translate it. Mark direction; do not add Latin tracking |
| A visual token intended for the phone | Do not sync it back without a product decision — the web owns its palette, type, shape and motion |

---

## Related

- [Phase 1 design spec](./superpowers/specs/2026-11-04-pejvak-rebrand-design.md) — the
  full rationale, contrast measurements and defect list.
- [Phase 1 implementation plan](./superpowers/plans/2026-11-04-pejvak-rebrand-foundation.md)
  — task order, tests and the capture harness.
- [UI review](./UI-REVIEW.md) — what the phone had, what the web had before this phase, and
  what remains.
