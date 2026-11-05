# Pejvak Web Rebrand — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the spec first:
> `docs/superpowers/specs/2026-11-04-pejvak-rebrand-design.md`.

**Goal:** Rebrand the listener console to a calm, editorial "ink and paper" identity, fix the
verified UI defects in the listening core, and make the design rules executable by tests.

**Architecture:** One web-owned token layer in `src/styles/tokens.css`, type and motion in
`src/app/globals.css`, primitives that only consume tokens, a pathname-keyed page transition,
and design-contract tests that fail when a token, contrast pair, or scale is broken. The phone
keeps its own visual identity; the web shares product rules only.

**Tech Stack:** Next 16 (App Router), React 19, Tailwind v4 (`@theme inline`), CSS custom
properties, Radix primitives, lucide icons, Vitest + Testing Library, Playwright Core (drives
the installed Chrome) for visual QA.

**Spec:** `docs/superpowers/specs/2026-11-04-pejvak-rebrand-design.md`

---

## Global Constraints

- **English-only UI, LTR document** (D10). Catalogue data may be Persian; mark it with
  `dir="auto"`. No Persian UI copy.
- **Two materials.** Opaque `surface` for anything read; glass only for what floats (player
  bar, sheets, menus).
- **Four states.** Skeleton, empty, error, offline on every data surface. A blank list is a bug.
- **Token-first.** No literal colour, spacing, radius, type size, or motion duration in a
  component. Component-local dimensions (e.g. a chart's plot height) are allowed.
- **Reduced motion.** Every animation collapses duration **and** delay; theme cross-fade and
  shimmer are disabled.
- **Accessibility.** WCAG AA for text/controls; 44 px minimum touch target on
  `(pointer: coarse)`; visible focus ring in light, dark and forced colours.
- **No network at build or runtime.** Vendor every font under `public/fonts`.
- **No new runtime dependencies.** The only new dev dependency is `playwright-core` (visual QA).
- **Do not modify `back/` or `mobile/`.** The web diverges visually; the act surface and wire
  format stay the same.
- **Next 16 conventions:** `proxy.ts` (not middleware), `await cookies()`, `Promise` params,
  Server Actions only. Read `node_modules/next/dist/docs/` before inventing a convention.
- **TypeScript:** `strict`, no `any`, no non-null `!` where a guard reads better.
- **Commits:** gitmoji + Conventional Commits, lowercase imperative, scope `(front)`.
  Never push. Never `git reset`.
- **Environment workarounds** (from `AGENTS.md`): run npm/eslint with `env NODE_OPTIONS=`;
  if `/safe-delete` blocks `.next`, `mv .next /tmp/next-old`; run gate steps individually if
  the harness mangles `unset`; `next build` may rewrite `tsconfig.json` — commit it.

---

## Review Focus

These are the failure modes the redesign is most likely to introduce. Each has a test or a
visual-QA check in the task that owns it.

1. **Persian title inside a serif heading.** Negative tracking, letter-spacing, and uppercase
   are wrong for Arabic script. Expect `dir="auto"`, `type-kicker` (not `type-overline`) for
   data, and a `[dir="rtl"]` tracking reset. Test in Task 8.
2. **Reduced motion hides content.** A staggered reveal with `animation-fill-mode: backwards`
   holds opacity 0 for the whole delay. Expect the delay to collapse too. Assert in Task 1;
   capture in Task 9.
3. **Dark theme contrast or a first-paint flash.** Expect AA on every tested pair and the
   existing `THEME_BOOTSTRAP` to keep working. Test in Task 1; capture in Task 9.
4. **Long chapter/collection titles.** Expect two-line clamps in rows and sheets, no layout
   jump, and the full string in `title`. Fix in Task 7; capture in Task 9.
5. **Narrow viewport / coarse pointer.** Expect 44 px targets, no horizontal scroll, intact
   mobile nav, and a scrubber that can be grabbed. Fix in Tasks 4 and 7; capture in Task 9.

---

## Task 1: Design-contract tests (red)

**Files:**
- Create: `src/lib/__tests__/design-tokens.test.ts`
- Create: `src/components/domain/stat-cell.test.tsx`

**Interfaces:**
- Produces: `block(css, selector)`, `contrast(hex, hex)`, `fontSize(className)` used only inside
  the test file. No product code depends on them.
- Consumes: `src/styles/tokens.css`, `src/app/globals.css`, `StatCell`.

- [ ] **Step 1: Write the failing token test**

Create `src/lib/__tests__/design-tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function block(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`missing ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return Object.fromEntries(
    [...css.slice(open + 1, close).matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map(
      (match) => [match[1], match[2].trim()],
    ),
  );
}

function channels(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function token(record: Record<string, string>, name: string): string {
  const value = record[name];
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

function fontSize(name: string): number {
  const found = globalsCss.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`));
  const body = found?.[1];
  if (!body) throw new Error(`missing .${name}`);
  const size = body.match(/font-size:\s*([0-9.]+)px/)?.[1];
  if (!size) throw new Error(`missing font-size in .${name}`);
  return Number.parseFloat(size);
}

const light = block(tokensCss, ":root");
const dark = block(tokensCss, ".dark");

describe("design tokens", () => {
  it("declares the full web-owned token set", () => {
    const required = [
      "canvas", "canvas-elevated", "surface", "surface-sunken",
      "outline", "outline-strong", "outline-variant",
      "glass", "glass-strong", "glass-border", "glass-highlight", "shadow",
      "text", "text-secondary", "text-tertiary",
      "accent", "accent-soft", "on-accent", "danger", "danger-soft", "scrim", "track", "icon",
      "radius-2xs", "radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-card",
      "radius-xl", "radius-xxl", "radius-pill",
      "space-xxs", "space-xs", "space-sm", "space-md", "space-lg", "space-xl", "space-xxl",
      "space-xxxl", "space-huge", "space-giant",
      "control-sm", "control-md", "control-lg", "control-thumb", "tap-min",
      "layout-sidebar", "layout-topbar", "layout-content", "layout-player",
      "layout-player-bar", "layout-artwork", "measure-prose", "measure-narrow", "measure-form",
      "motion-fast", "motion-base", "motion-slow", "motion-reveal", "motion-distance",
      "ease-out", "ease-in", "ease-in-out", "stagger-step",
      "font-display", "font-sans",
    ];
    for (const name of required) {
      expect(token(light, name), `--${name}`).toBeDefined();
    }
    expect(token(light, "font-display")).toContain("Newsreader");
    expect(token(light, "font-display")).toContain("Vazirmatn");
  });

  it("holds the contrast pairs the UI relies on", () => {
    const pairs: [string, string, number][] = [
      ["text", "canvas", 4.5], ["text-secondary", "canvas", 4.5],
      ["text-tertiary", "canvas", 4.5],
      ["text", "surface", 4.5], ["text-secondary", "surface", 4.5],
      ["text-tertiary", "surface", 4.5], ["text-tertiary", "surface-sunken", 4.5],
      ["accent", "surface", 4.5], ["danger", "surface", 4.5], ["on-accent", "accent", 4.5],
      ["outline-strong", "surface", 3], ["outline-strong", "surface-sunken", 3],
    ];
    for (const [fg, bg, min] of pairs) {
      expect(contrast(token(light, fg), token(light, bg)), `light ${fg} on ${bg}`)
        .toBeGreaterThanOrEqual(min);
      expect(contrast(token(dark, fg), token(dark, bg)), `dark ${fg} on ${bg}`)
        .toBeGreaterThanOrEqual(min);
    }
  });

  it("keeps the spacing and radius ramps strictly increasing", () => {
    const spaces = ["space-xxs", "space-xs", "space-sm", "space-md", "space-lg", "space-xl",
      "space-xxl", "space-xxxl", "space-huge", "space-giant"]
      .map((name) => Number.parseFloat(token(light, name)));
    expect(spaces).toEqual([2, 4, 8, 12, 16, 24, 32, 40, 56, 80]);

    const radii = ["radius-2xs", "radius-xs", "radius-sm", "radius-md", "radius-lg",
      "radius-card", "radius-xl", "radius-xxl"]
      .map((name) => Number.parseFloat(token(light, name)));
    expect(radii).toEqual([4, 6, 10, 14, 18, 22, 28, 36]);
  });

  it("keeps the heading ramp descending and reduced motion present", () => {
    const sizes = ["type-hero", "type-display", "type-title", "type-heading", "type-body",
      "type-label", "type-caption", "type-overline"].map(fontSize);
    expect(sizes).toEqual([44, 36, 30, 22, 16, 14, 13, 11]);
    expect(globalsCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globalsCss).toContain('[dir="rtl"]');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `env NODE_OPTIONS= npx vitest run src/lib/__tests__/design-tokens.test.ts`
Expected: FAIL — `missing --radius-2xs` (or the first missing token), then contrast/ramp
failures once the token set exists. That is the red state.

- [ ] **Step 3: Write the failing StatCell test**

Create `src/components/domain/stat-cell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatCell } from "./stat-cell";

describe("StatCell", () => {
  it("makes the figure the loudest text in the card", () => {
    render(
      <StatCell
        label="Total listening time"
        value="12h 4m"
        detail="Since yesterday"
        icon="clock"
      />,
    );

    const value = screen.getByText("12h 4m");
    expect(value.className).toContain("type-figure");
    expect(value.className).toContain("text-text");
    expect(value.className).not.toContain("text-text-secondary");

    const label = screen.getByText("Total listening time");
    expect(label.className).toContain("text-text-secondary");
    expect(label.className.split(/\s+/)).not.toContain("text-text");
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `env NODE_OPTIONS= npx vitest run src/components/domain/stat-cell.test.tsx`
Expected: FAIL — the current value has `text-text-secondary` and the label has `text-text`.

- [ ] **Step 5: Commit the red tests**

```bash
git add src/lib/__tests__/design-tokens.test.ts src/components/domain/stat-cell.test.tsx
git commit -m ":white_check_mark: test(front): Pin the rebrand token contract"
```

---

## Task 2: Token foundation, display font, type scale, RTL reset (green)

**Files:**
- Modify: `src/styles/tokens.css` (replace `:root` and `.dark`; add the new token groups)
- Modify: `src/app/globals.css` (font-face, type scale, RTL reset, body weight)
- Modify: `src/app/layout.tsx` (`themeColor`)
- Create: `public/fonts/newsreader-latin.woff2`
- Create: `public/fonts/newsreader-latin-ext.woff2`
- Create: `public/fonts/OFL-newsreader.txt`
- Test: `src/lib/__tests__/design-tokens.test.ts` (from Task 1)

**Interfaces:**
- Produces: all tokens listed in the spec §5; `--font-display`; `[dir="rtl"]` tracking reset.
- Consumes: nothing from Task 1 except its assertions.

- [ ] **Step 1: Vendor Newsreader**

```bash
mkdir -p public/fonts
curl -sS -o public/fonts/newsreader-latin.woff2 \
  "https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK4397yjIJFJpc.woff2"
curl -sS -o public/fonts/newsreader-latin-ext.woff2 \
  "https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK439DyjIJFJpeBZQ.woff2"
curl -sS -o public/fonts/OFL-newsreader.txt \
  "https://raw.githubusercontent.com/productiontype/newsreader/master/OFL.txt"
file public/fonts/newsreader-latin.woff2 public/fonts/newsreader-latin-ext.woff2
```

Expected: both say `Web Open Font Format (Version 2)`. If the URL has moved, request
`https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400..700&display=swap`
with a Chrome user agent and use the `latin` / `latin-ext` `woff2` URLs from the response. Do
not switch to a network font at build or runtime.

- [ ] **Step 2: Replace the token blocks**

Rewrite `:root` and `.dark` in `src/styles/tokens.css` to exactly:

```css
:root {
  --canvas: #f6f3ed;
  --canvas-elevated: #fbf9f4;
  --surface: #fffdf8;
  --surface-sunken: #efebe2;

  --outline: #cfc8ba;
  --outline-strong: #857c6c;
  --outline-variant: #e4ded2;

  --glass: rgba(255, 253, 248, 0.78);
  --glass-strong: rgba(255, 253, 248, 0.92);
  --glass-border: rgba(30, 28, 24, 0.14);
  --glass-highlight: rgba(255, 255, 255, 0.95);
  --shadow: rgba(30, 28, 24, 0.14);

  --text: #1b1a17;
  --text-secondary: #4a4740;
  --text-tertiary: #666257;

  --accent: #2c5a4a;
  --accent-soft: rgba(44, 90, 74, 0.1);
  --on-accent: #fffdf8;
  --danger: #a0343f;
  --danger-soft: rgba(160, 52, 63, 0.1);
  --scrim: rgba(20, 18, 14, 0.4);
  --track: rgba(74, 71, 64, 0.18);
  --icon: #3a3832;

  --radius-2xs: 4px;
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
  --radius-card: 22px;
  --radius-xl: 28px;
  --radius-xxl: 36px;
  --radius-pill: 999px;

  --space-xxs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-xxl: 32px;
  --space-xxxl: 40px;
  --space-huge: 56px;
  --space-giant: 80px;

  --control-sm: 36px;
  --control-md: 44px;
  --control-lg: 52px;
  --control-thumb: 18px;
  --tap-min: 44px;

  --layout-sidebar: 264px;
  --layout-topbar: 64px;
  --layout-content: 1180px;
  --layout-player: 760px;
  --layout-player-bar: 80px;
  --layout-artwork: 360px;
  --measure-prose: 68ch;
  --measure-narrow: 44ch;
  --measure-form: 420px;

  --bar-thin: 4px;
  --bar-thick: 6px;

  --elevation-card: 0 1px 3px var(--shadow);
  --elevation-panel: 0 10px 28px var(--shadow);
  --elevation-float: 0 18px 44px var(--shadow);

  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 300ms;
  --motion-reveal: 360ms;
  --motion-distance: 8px;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --stagger-step: 45ms;

  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
    "Vazirmatn", sans-serif;
  --font-display: "Newsreader", "Vazirmatn", "Iowan Old Style", "Palatino Linotype", Georgia,
    serif;

  color-scheme: light;
}

.dark {
  --canvas: #141311;
  --canvas-elevated: #1c1a17;
  --surface: #211f1b;
  --surface-sunken: #2a2722;

  --outline: #4a463e;
  --outline-strong: #877f71;
  --outline-variant: #35312a;

  --glass: rgba(33, 31, 27, 0.72);
  --glass-strong: rgba(35, 33, 28, 0.9);
  --glass-border: rgba(246, 243, 237, 0.2);
  --glass-highlight: rgba(255, 255, 255, 0.2);
  --shadow: rgba(0, 0, 0, 0.55);

  --text: #f4f0e8;
  --text-secondary: #c4bdb0;
  --text-tertiary: #9a9386;

  --accent: #8fc9b4;
  --accent-soft: rgba(143, 201, 180, 0.16);
  --on-accent: #0b211a;
  --danger: #f0a0a8;
  --danger-soft: rgba(240, 160, 168, 0.14);
  --scrim: rgba(0, 0, 0, 0.6);
  --track: rgba(196, 189, 176, 0.2);
  --icon: #e4ded2;

  color-scheme: dark;
}
```

Update the file header: the web now owns this file; it is no longer a transcription of
`mobile/src/theme/tokens.ts`. Keep the three load-bearing notes (two materials, content tiers,
radius ramp) but rewrite the first sentence.

- [ ] **Step 3: Add the font faces and type scale**

In `src/app/globals.css`, add the two Newsreader faces beside Vazirmatn:

```css
@font-face {
  font-family: "Newsreader";
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url("/fonts/newsreader-latin.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
    U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215,
    U+FEFF, U+FFFD;
}

@font-face {
  font-family: "Newsreader";
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url("/fonts/newsreader-latin-ext.woff2") format("woff2");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304,
    U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4,
    U+2113, U+2C60-2C7F, U+A720-A7FF;
}
```

Replace the `.type-*` block with:

```css
.type-hero {
  font-family: var(--font-display);
  font-size: 44px;
  line-height: 48px;
  font-weight: 500;
  letter-spacing: -1.2px;
  font-optical-sizing: auto;
}
.type-display {
  font-family: var(--font-display);
  font-size: 36px;
  line-height: 42px;
  font-weight: 500;
  letter-spacing: -0.9px;
  font-optical-sizing: auto;
}
.type-title {
  font-family: var(--font-display);
  font-size: 30px;
  line-height: 36px;
  font-weight: 500;
  letter-spacing: -0.6px;
  font-optical-sizing: auto;
}
.type-figure {
  font-size: 30px;
  line-height: 34px;
  font-weight: 600;
  letter-spacing: -0.4px;
  font-variant-numeric: tabular-nums;
}
.type-heading {
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 28px;
  font-weight: 500;
  letter-spacing: -0.3px;
  font-optical-sizing: auto;
}
.type-body {
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  letter-spacing: -0.1px;
}
.type-body-strong {
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  letter-spacing: -0.1px;
}
.type-label {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
.type-caption {
  font-size: 13px;
  line-height: 19px;
  font-weight: 400;
  letter-spacing: 0.05px;
}
.type-overline {
  font-size: 11px;
  line-height: 15px;
  font-weight: 600;
  letter-spacing: 1.4px;
  text-transform: uppercase;
}
.type-kicker {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}
.type-numeric {
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
}
```

Set the base body to `font-size: 16px; line-height: 24px; font-weight: 400;` (was 23/500).

- [ ] **Step 4: Add the RTL reset**

In the base layer of `globals.css`, after the `html` rule:

```css
/* A Persian catalogue title is the one RTL run in an LTR document. Tracking is
   a Latin typographic device; applied to Arabic script it pulls joined letters
   apart. Reset it wherever the text declares its own direction. */
[dir="rtl"] {
  letter-spacing: normal;
  word-spacing: normal;
}
```

- [ ] **Step 5: Update the browser chrome**

In `src/app/layout.tsx`, change `themeColor` to the new canvases:
`#F6F3ED` (light) and `#141311` (dark). Keep the media-query structure and the
`THEME_BOOTSTRAP` script unchanged.

- [ ] **Step 6: Run the contract test**

Run: `env NODE_OPTIONS= npx vitest run src/lib/__tests__/design-tokens.test.ts`
Expected: PASS for the token set, contrast pairs, ramps, and type scale. The StatCell test
still fails; that is Task 6.

- [ ] **Step 7: Typecheck and lint the token change**

Run: `env NODE_OPTIONS= npx tsc --noEmit`
Run: `env NODE_OPTIONS= npx eslint src/styles src/app/globals.css src/app/layout.tsx`
Expected: no errors. (`eslint` does not lint CSS; the command just verifies the TS side.)

- [ ] **Step 8: Commit**

```bash
git add src/styles/tokens.css src/app/globals.css src/app/layout.tsx public/fonts
git commit -m ":art: feat(front): Add the ink-and-paper token foundation"
```

---

## Task 3: Motion foundation and page transition

**Files:**
- Modify: `src/app/globals.css` (keyframes, utilities, coarse variant, view-transition CSS)
- Modify: `src/components/motion/reveal.tsx`
- Create: `src/components/motion/page-transition.tsx`
- Modify: `src/app/(shell)/layout.tsx`
- Test: `src/components/motion/reveal.test.tsx`
- Test: `src/components/motion/page-transition.test.tsx`

**Interfaces:**
- Produces: `.reveal`, `.page-enter`, `.skeleton`, `.reveal-row`; keyframes `reveal-up`,
  `page-in`, `fade-in`, `fade-out`, `sheet-up`, `sheet-down`, `shimmer`, `track-in`;
  `PageTransition({ children })`.
- Consumes: motion tokens from Task 2.

- [ ] **Step 1: Write the failing motion tests**

`src/components/motion/reveal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Reveal } from "./reveal";

describe("Reveal", () => {
  it("caps the stagger delay at ten steps", () => {
    render(<Reveal index={99}>content</Reveal>);
    expect(screen.getByText("content").parentElement?.style.animationDelay).toBe("450ms");
  });

  it("does not delay the first item", () => {
    render(<Reveal index={0}>first</Reveal>);
    expect(screen.getByText("first").parentElement?.style.animationDelay).toBe("");
  });
});
```

`src/components/motion/page-transition.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/library" }));

import { PageTransition } from "./page-transition";

describe("PageTransition", () => {
  it("renders its children inside the page-enter wrapper", () => {
    render(<PageTransition>page body</PageTransition>);
    expect(screen.getByText("page body").parentElement).toHaveClass("page-enter");
  });
});
```

Run: `env NODE_OPTIONS= npx vitest run src/components/motion`
Expected: FAIL — `Reveal` still uses the old duration classes and `PageTransition` does not
exist.

- [ ] **Step 2: Add the motion vocabulary to `globals.css`**

Add `@custom-variant coarse (@media (pointer: coarse));` after the imports.

Replace/extend the keyframes and add utilities:

```css
@keyframes reveal-up {
  from { opacity: 0; transform: translateY(var(--motion-distance)); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes page-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes sheet-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes sheet-down {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(12px); }
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
@keyframes track-in {
  from { opacity: 0; transform: scale(0.985); }
  to { opacity: 1; transform: scale(1); }
}

.reveal {
  animation: reveal-up var(--motion-reveal) var(--ease-out) backwards;
  animation-delay: calc(var(--reveal-index, 0) * var(--stagger-step));
}
.reveal-row {
  animation: fade-in var(--motion-slow) var(--ease-out) backwards;
  animation-delay: calc(var(--reveal-index, 0) * var(--stagger-step));
}
.page-enter {
  animation: page-in var(--motion-base) var(--ease-out);
}
.skeleton {
  background-image: linear-gradient(
    90deg,
    var(--surface-sunken) 25%,
    var(--canvas-elevated) 50%,
    var(--surface-sunken) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
```

Keep the existing `sheet-up`/`reveal-up` names; replace their bodies with the versions above.
For desktop `sheet-up`, keep the existing `translate(50%, 50%)` keyframe at
`min-width: 640px`, and add the matching `sheet-down` there.

Add the view-transition CSS:

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: var(--motion-base);
  animation-timing-function: var(--ease-in-out);
}
```

Inside the existing `prefers-reduced-motion` block, add:

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
}
```

- [ ] **Step 3: Update `Reveal` to the token vocabulary**

Keep the `STEP_MS`/`MAX_STEPS` math (the test pins 450 ms). Change the wrapper class to
`reveal` and keep the inline `animationDelay` for indices above zero. Do not set a delay of
`0ms` on index 0 (the test expects no inline style).

- [ ] **Step 4: Implement `PageTransition`**

`src/components/motion/page-transition.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
```

Wrap the shell's `{children}` in `src/app/(shell)/layout.tsx` with `<PageTransition>`.
Do not wrap the player bar or the sidebar — they persist across routes.

- [ ] **Step 5: Run the motion tests**

Run: `env NODE_OPTIONS= npx vitest run src/components/motion`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/components/motion src/app/\(shell\)/layout.tsx
git commit -m ":lipstick: feat(front): Add the restrained motion vocabulary"
```

---

## Task 4: Rebrand the primitives

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/page-header.tsx`
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/text-field.tsx`
- Modify: `src/components/ui/segmented-control.tsx`
- Modify: `src/components/ui/pagination.tsx`
- Modify: `src/components/ui/state.tsx`
- Modify: `src/components/ui/planned.tsx`
- Test: `src/components/ui/button.test.tsx`
- Test: `src/components/ui/state.test.tsx`

**Interfaces:**
- Produces: the same public API for every primitive. Only classes and internal sizes change.
- Consumes: control/layout/radius/motion tokens from Task 2.

- [ ] **Step 1: Write the failing primitive tests**

`src/components/ui/button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("sizes controls from the control tokens", () => {
    render(<Button size="md">Play</Button>);
    expect(screen.getByRole("button").className).toContain("h-[var(--control-md)]");
  });

  it("grows the dense variants on coarse pointers", () => {
    render(<Button size="sm">Save</Button>);
    expect(screen.getByRole("button").className).toContain("coarse:h-[var(--control-md)]");
  });
});
```

`src/components/ui/state.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./state";

describe("Skeleton", () => {
  it("uses the shimmer utility instead of an opacity pulse", () => {
    const { container } = render(<Skeleton className="h-8" />);
    expect(container.firstElementChild?.className).toContain("skeleton");
    expect(container.firstElementChild?.className).not.toContain("animate-pulse");
  });
});
```

Run: `env NODE_OPTIONS= npx vitest run src/components/ui`
Expected: FAIL.

- [ ] **Step 2: Update the primitives**

Apply these exact changes:

- `button.tsx`: `sm` → `h-[var(--control-sm)] ... coarse:h-[var(--control-md)]`; `md` →
  `h-[var(--control-md)]`; `lg` → `h-[var(--control-lg)]`; `icon` →
  `size-[var(--control-md)]`; `iconSm` →
  `size-[var(--control-sm)] coarse:size-[var(--control-md)]`. Base transition →
  `transition-[background-color,color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)]`.
- `card.tsx`: keep the same API; replace `--radius-card` values as the token now carries the
  new shape. Update the header comment to the new identity.
- `page-header.tsx`: title stays `type-title`; description becomes
  `type-body text-text-secondary mt-[var(--space-sm)] max-w-[var(--measure-prose)]`; overline
  stays `type-overline`.
- `badge.tsx`: keep sizes; use `--control-*` only if a size is expressed in pixels. It is not;
  leave the visual classes, but replace any arbitrary radius with `--radius-pill`.
- `text-field.tsx`: `h-[var(--control-lg)]`; transition duration `var(--motion-fast)`.
- `segmented-control.tsx`: `gap-[var(--space-xxs)] p-[var(--space-xxs)]`; segment
  `h-[var(--control-sm)] coarse:h-[var(--control-md)]`; `transition-colors duration-[var(--motion-fast)]`.
- `pagination.tsx`: both `h-10` → `h-[var(--control-md)]`.
- `state.tsx`: `Skeleton` → `skeleton rounded-[var(--radius-sm)] bg-surface-sunken` (no
  `animate-pulse`); `TableSkeleton` rows `h-14` → `h-[var(--control-lg)]`; `EmptyState`
  `max-w-[42ch]` → `max-w-[var(--measure-narrow)]`; `ErrorState` and `OfflineBanner` keep
  their semantics, replace arbitrary spacing with tokens.
- `planned.tsx`: replace `mt-[7px]` with `mt-[var(--space-sm)]` and any arbitrary radius with a
  token; verify the dot still aligns in Task 9.

- [ ] **Step 3: Run tests and typecheck**

Run: `env NODE_OPTIONS= npx vitest run src/components/ui`
Run: `env NODE_OPTIONS= npx tsc --noEmit`
Expected: PASS / no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui
git commit -m ":lipstick: refactor(front): Rebrand the UI primitives"
```

---

## Task 5: Rebrand the shell

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/topbar.tsx`
- Modify: `src/components/layout/nav-link.tsx`
- Modify: `src/components/layout/account-menu.tsx`
- Modify: `src/components/layout/theme-toggle.tsx`
- Modify: `src/components/player/player-bar.tsx`
- Modify: `src/app/(shell)/layout.tsx`
- Modify: `src/app/(admin)/admin/layout.tsx` (token swap only)
- Test: `src/components/layout/theme-toggle.test.tsx`

**Interfaces:**
- Produces: the same shell components; the theme toggle now uses the View Transitions API when
  available.
- Consumes: layout/motion/glass tokens from Task 2.

- [ ] **Step 1: Write the failing theme-toggle test**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("toggles the html class and writes the cookie", () => {
    document.documentElement.classList.remove("dark");
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.cookie).toContain("theme=dark");
  });
});
```

Run: `env NODE_OPTIONS= npx vitest run src/components/layout/theme-toggle.test.tsx`
Expected: PASS today (the current toggle already does this). Keep the test as a regression
guard while adding the cross-fade.

- [ ] **Step 2: Update the shell**

- `sidebar.tsx`: `w-[248px]` → `w-[var(--layout-sidebar)]`; keep the border and padding;
  the wordmark is `type-heading` (now serif).
- `topbar.tsx`: header height `h-16` → `h-[var(--layout-topbar)]`; keep the sticky glass.
- `nav-link.tsx`: height `h-11` → `h-[var(--control-md)]`; transition
  `duration-[var(--motion-fast)]`.
- `account-menu.tsx`: add
  `data-[state=open]:animate-[fade-in_var(--motion-fast)_var(--ease-out)]` to
  `DropdownMenu.Content`; replace `min-w-[14rem]` with `min-w-[16rem]` if the serif needs the
  room (visual QA decides). Keep the explicit `dir="ltr"`.
- `theme-toggle.tsx`: wrap the class flip and cookie write in a helper. If
  `document.startViewTransition` exists and reduced motion is off, call it; otherwise call the
  helper directly. Keep `useSyncExternalStore` and the listener set exactly as they are.
- `player-bar.tsx`: `lg:ms-[248px]` → `lg:ms-[var(--layout-sidebar)]`;
  `min-h-[76px]` → `min-h-[var(--layout-player-bar)]`;
  `max-w-[1180px]` → `max-w-[var(--layout-content)]`; update the comment's `76px` to the token.
- `src/app/(shell)/layout.tsx`: `max-w-[1180px]` → `max-w-[var(--layout-content)]`;
  the error branch `max-w-[52ch]` → `max-w-[var(--measure-narrow)]`.
- `src/app/(admin)/admin/layout.tsx`: do only the mechanical `w-[248px]` →
  `w-[var(--layout-sidebar)]` and `max-w-[1180px]` → `max-w-[var(--layout-content)]` swaps so
  the admin rail does not misalign with the new sidebar. Do not restyle the admin surfaces in
  this phase.
- `src/app/globals.css`: `body[data-player-bar="visible"] .shell-main` padding uses
  `calc(var(--space-giant) + var(--layout-player-bar))`.

- [ ] **Step 3: Run the shell tests**

Run: `env NODE_OPTIONS= npx vitest run src/components/layout/theme-toggle.test.tsx`
Run: `env NODE_OPTIONS= npx tsc --noEmit`
Expected: PASS / no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout src/components/player/player-bar.tsx src/app/\(shell\)/layout.tsx src/app/\(admin\)/admin/layout.tsx src/app/globals.css
git commit -m ":lipstick: feat(front): Rebrand the shell and add the theme cross-fade"
```

---

## Task 6: Dashboard and StatCell hierarchy

**Files:**
- Modify: `src/components/domain/stat-cell.tsx`
- Modify: `src/app/(shell)/page.tsx`
- Modify: `src/components/domain/activity-chart.tsx`
- Modify: `src/components/domain/top-tracks-table.tsx`
- Test: `src/components/domain/stat-cell.test.tsx` (from Task 1)

**Interfaces:**
- Produces: `StatCell` now takes the same props but renders the figure as the loudest tier.
- Consumes: tokens and `.reveal` from Tasks 2–3.

- [ ] **Step 1: Fix `StatCell`**

- Label: `type-caption text-text-secondary`.
- Value: `type-figure text-text`.
- Detail: `type-caption text-text-tertiary`.
- Icon: `text-text-tertiary`.
- Card padding: `p-[var(--space-xl)]`.
- Rewrite the file comment: the card's purpose is the figure, so the figure is the label.

Run: `env NODE_OPTIONS= npx vitest run src/components/domain/stat-cell.test.tsx`
Expected: PASS.

- [ ] **Step 2: Update the dashboard surfaces**

- `src/app/(shell)/page.tsx`: use `p-[var(--space-xl)]` on cards; keep the `Reveal` indexes;
  replace `p-[var(--space-lg)]` on the activity card with the new padding; keep the four-cell
  grid and its responsive columns.
- `activity-chart.tsx`: bars use `rounded-t-[var(--radius-2xs)]`; hover transition uses
  `duration-[var(--motion-fast)]`; the `bg-accent/70` stays (it is a state, not decoration).
- `top-tracks-table.tsx`: swap the title link to `type-label` (already), add
  `dir="auto"` to the title/link, use `--radius-2xs` for the artwork tile if it reads too
  round, and keep the numeric columns end-aligned on `md`/`lg`.

- [ ] **Step 3: Run the dashboard tests and typecheck**

Run: `env NODE_OPTIONS= npx vitest run src/components/domain/stat-cell.test.tsx src/lib/__tests__/insights.test.ts`
Run: `env NODE_OPTIONS= npx tsc --noEmit`
Expected: PASS / no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/stat-cell.tsx src/app/\(shell\)/page.tsx src/components/domain/activity-chart.tsx src/components/domain/top-tracks-table.tsx
git commit -m ":lipstick: feat(front): Rebrand the dashboard and fix the stat hierarchy"
```

---

## Task 7: Library and history defects

**Files:**
- Modify: `src/lib/domain/track.ts` (`createdAt` in `TrackSummary`, projection, parser)
- Modify: `src/lib/__tests__/playlists.test.ts` (factory)
- Modify: `src/lib/__tests__/insights.test.ts` (factory)
- Modify: `src/components/domain/track-table.tsx`
- Modify: `src/app/(shell)/library/page.tsx`
- Modify: `src/components/domain/history-row.tsx`
- Modify: `src/components/player/sheet.tsx`
- Modify: `src/components/player/scrubber.tsx`
- Test: `src/components/domain/track-table.test.tsx`

**Interfaces:**
- Produces: `TrackSummary.createdAt: number | null`; the library table renders the added time
  under the sortable "Added" header.
- Consumes: `formatRelativeTime`, `formatDateTime`, `.reveal-row`, tokens.

- [ ] **Step 1: Write the failing library test**

`src/components/domain/track-table.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { TrackTable } from "./track-table";
import type { TrackSummary } from "@/lib/domain/track";
import { formatRelativeTime } from "@/lib/time";

const NOW = Date.UTC(2026, 10, 4);
const createdAt = NOW - 2 * 86_400_000;

const track = {
  id: "t1", title: "Sapiens", contentHash: "hash", durationSec: 3600,
  isAudiobook: true, author: "Yuval Noah Harari", narrator: null, artworkUrl: null,
  totalPlayCount: 7, totalListenTimeSec: 600, lastPlayedAt: null, createdAt,
  origin: "online", sourceId: "s", externalId: "e", collectionKey: "s:e",
  collectionTitle: null,
} as TrackSummary;

describe("TrackTable", () => {
  it("shows when the track was added under the Added column", () => {
    render(
      <TrackTable
        tracks={[track]}
        sort={{ field: "createdAt", order: "desc" }}
        buildSortHref={() => "#"}
        now={NOW}
      />,
    );
    expect(screen.getAllByText(formatRelativeTime(createdAt, NOW)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/7 plays/)).toBeNull();
  });
});
```

Run: `env NODE_OPTIONS= npx vitest run src/components/domain/track-table.test.tsx`
Expected: FAIL — the table prints `7 plays · 1:00:00` under "Added".

- [ ] **Step 2: Add `createdAt` to the domain shape**

- `src/lib/domain/track.ts`: add `createdAt: number | null;` to `TrackSummary`; add
  `createdAt: 1` to `TRACK_SUMMARY_GET`; add `createdAt: asTimestamp(record.createdAt)` to
  `parseTrackSummary`. Remove the now-redundant `createdAt` line from the `TrackDetail`
  intersection and the explicit `createdAt: 1` from `TRACK_DETAIL_GET` (it spreads
  `TRACK_SUMMARY_GET`).
- Update the two test factories:
  `src/lib/__tests__/playlists.test.ts` and `src/lib/__tests__/insights.test.ts` — add
  `createdAt: null` to each `TrackSummary` literal.
- Run `rg -n "TrackSummary" src` and fix any other literal the compiler reports.

- [ ] **Step 3: Fix the library table**

- Header "Added" stays; the cell renders
  `track.createdAt === null ? "—" : formatRelativeTime(track.createdAt, now)` with
  `title={track.createdAt === null ? undefined : formatDateTime(track.createdAt)}`.
- Remove the play-count/duration rendering from that cell. Play count and duration remain
  available on the track detail page and the top-tracks table.
- "Listening time" header and cell become `text-end` (not `text-center`).
- Replace `mt-[2px]` and the mark's `rounded-[2px] px-[1px]` with `mt-[var(--space-xs)]`,
  `rounded-[var(--radius-2xs)]`, `px-[var(--space-xxs)]`.
- Replace the sort arrow's `text-[10px]` with `type-overline`.
- Add `.reveal-row` to `<tr>` and `<li>` with
  `style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}`. Apply it to the card list too.
- `src/app/(shell)/library/page.tsx`: replace arbitrary widths with tokens where they are
  layout values; keep the search width component-local.

Run: `env NODE_OPTIONS= npx vitest run src/components/domain/track-table.test.tsx`
Expected: PASS.

- [ ] **Step 4: Fix the history row**

- The time range (`formatStretchTimeRange`) is `text-secondary`; the duration
  (`formatSpan(stretch.listenedSec)`) is `text-tertiary`.
- Remove the third caption line (position range and speed). The session-detail sheet already
  carries both; drop the now-unused imports and variables.
- Add `dir="auto"` to the title `<p>` and to the collection link text.
- Keep the verdict badge as the only outcome rendering.

- [ ] **Step 5: Sheet exit animation and title clamp**

In `src/components/player/sheet.tsx`:

- Overlay:
  `data-[state=open]:animate-[fade-in_var(--motion-fast)_ease-out] data-[state=closed]:animate-[fade-out_var(--motion-fast)_ease-in]`.
- Content:
  `data-[state=open]:animate-[sheet-up_var(--motion-base)_var(--ease-out)] data-[state=closed]:animate-[sheet-down_var(--motion-fast)_var(--ease-in)]`.
- `Dialog.Title` gets `line-clamp-2` and `title={title}`.

- [ ] **Step 6: Scrubber touch target**

In `src/components/player/scrubber.tsx`, change the `Slider.Root` `h-9` to
`h-9 coarse:h-[var(--tap-min)]`. Do not change the visual wave geometry.

- [ ] **Step 7: Run the library and history tests**

Run: `env NODE_OPTIONS= npx vitest run src/components/domain/track-table.test.tsx src/lib/__tests__/playlists.test.ts src/lib/__tests__/insights.test.ts`
Run: `env NODE_OPTIONS= npx tsc --noEmit`
Expected: PASS / no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/track.ts src/lib/__tests__/playlists.test.ts src/lib/__tests__/insights.test.ts src/components/domain/track-table.tsx src/app/\(shell\)/library/page.tsx src/components/domain/history-row.tsx src/components/player/sheet.tsx src/components/player/scrubber.tsx
git commit -m ":bug: fix(front): Make the Added column honest and calm the history row"
```

---

## Task 8: Catalogue text, direction, and the kicker split

**Files:**
- Modify: `src/components/player/player-screen.tsx`
- Modify: `src/components/domain/track-table.tsx`
- Modify: `src/components/domain/history-row.tsx`
- Modify: `src/components/domain/top-tracks-table.tsx`
- Modify: `src/components/domain/session-detail.tsx`
- Test: extend `src/components/domain/track-table.test.tsx`

**Interfaces:**
- Produces: data-bearing text marked `dir="auto"`; `type-kicker` for album/context titles.
- Consumes: `type-kicker` and the `[dir="rtl"]` reset from Task 2.

- [ ] **Step 1: Add the Persian-title regression test**

Extend `track-table.test.tsx`:

```tsx
it("marks catalogue text as auto-direction so a Persian title renders RTL", () => {
  const persian = { ...track, title: "تاریخ شیعه" } as TrackSummary;
  render(
    <TrackTable
      tracks={[persian]}
      sort={{ field: "createdAt", order: "desc" }}
      buildSortHref={() => "#"}
      now={NOW}
    />,
  );
  expect(screen.getAllByText("تاریخ شیعه")[0]).toHaveAttribute("dir", "auto");
});
```

Run: `env NODE_OPTIONS= npx vitest run src/components/domain/track-table.test.tsx`
Expected: FAIL — the title has no `dir`.

- [ ] **Step 2: Mark data text**

Add `dir="auto"` to:

- `track-table.tsx`: the title link, the subtitle span, the collection span.
- `top-tracks-table.tsx`: the title link and the plain-title paragraph.
- `history-row.tsx`: the title `<p>`, the `ContextLink` text; keep the arrow isolated with
  `dir="ltr"`.
- `session-detail.tsx`: the `<dd>` facts (values may be Persian); labels stay LTR.
- `player-screen.tsx`: the track `<h1>`, the artist line, and the context chip text.

- [ ] **Step 3: Split the overline from the kicker**

In `player-screen.tsx`, the overline is `describeOverline(...)` — it can be an album title or a
collection context. Change its class from `type-overline` to `type-kicker`. `type-overline`
stays for PageHeader/CardHeading English labels only.

- [ ] **Step 4: Run the tests**

Run: `env NODE_OPTIONS= npx vitest run src/components/domain/track-table.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/domain/track-table.tsx src/components/domain/top-tracks-table.tsx src/components/domain/history-row.tsx src/components/domain/session-detail.tsx src/components/player/player-screen.tsx
git commit -m ":bug: fix(front): Keep Persian catalogue text out of Latin tracking"
```

---

## Task 9: Visual QA harness and capture

**Files:**
- Modify: `package.json` (add `playwright-core` devDependency and a `capture` script)
- Create: `scripts/capture.mjs`
- Modify: `.gitignore` (add `/artifacts`)

**Interfaces:**
- Produces: `artifacts/*.png` screenshots at desktop/mobile, light/dark, and reduced motion.
- Consumes: a running dev server and the remote backend's demo account
  (`demo@pejvak.app` / `password123`, from `back/utils/seed.ts`).

- [ ] **Step 1: Install the driver**

Run: `env NODE_OPTIONS= npm install --save-dev playwright-core`
Expected: `playwright-core` in `devDependencies`. It drives the installed Google Chrome via
`channel: "chrome"`; it does not download a browser.

- [ ] **Step 2: Write the capture script**

`scripts/capture.mjs` must:

- Launch `chromium.launch({ channel: "chrome", headless: true })`.
- Create a context at `1440x900`, `colorScheme: "light"`, then a second at `390x844`.
- Log in once with `E2E_EMAIL`/`E2E_PASSWORD` (defaults to the demo account), submit the form,
  and wait for `/`.
- Capture `/login`, `/`, `/library`, `/history`, `/playlists`, `/settings`, `/player`, `/browse`
  to `artifacts/<route>-<viewport>-<scheme>.png` with `fullPage: true`.
- Repeat with `context.addCookies([{ name: "theme", value: "dark", url: "http://localhost:3000" }])`.
- Repeat one pass with `reducedMotion: "reduce"`.
- If login fails, capture `/login` and exit non-zero with a message that names the env vars.

- [ ] **Step 3: Start the dev server**

```bash
mkdir -p artifacts
env NODE_OPTIONS= npm run dev > /tmp/pejvak-dev.log 2>&1 &
```

Wait until ready:

```bash
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login || true)
  [ "$code" = "200" ] && break
  sleep 1
done
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
```

Expected: `200`.

- [ ] **Step 4: Capture and inspect**

```bash
env NODE_OPTIONS= npm run capture
```

Open the PNGs with the Read tool. Inspect at minimum:

- Home: figure hierarchy, card padding, chart baseline, top-tracks alignment.
- Library: the Added column shows a time, the numeric column is end-aligned, no clipped
  subtitles, Persian title renders correctly.
- History: the time range is louder than the duration, the row is two caption lines.
- Settings/Playlists: no orphaned 2 px/3 px gaps; cards share a left edge.
- Player: artwork, wave, transport, control row; no overlap at 390 px.
- Dark: all surfaces, glass, focus ring; no flash (reload once).
- Reduced motion: no invisible content; the route still changes.

- [ ] **Step 5: Fix what the screenshots prove**

Fix only defects with a visible cause. Keep each fix in its own commit, e.g.:

```bash
git add <files>
git commit -m ":bug: fix(front): Align the dashboard figures after the type change"
```

Re-run `npm run capture` after the fixes.

- [ ] **Step 6: Commit the harness**

```bash
git add package.json package-lock.json scripts/capture.mjs .gitignore
git commit -m ":technologist: chore(front): Add the visual QA capture harness"
```

---

## Task 10: Documentation and the gate

**Files:**
- Create: `docs/DESIGN.md`
- Modify: `src/styles/tokens.css` (header only — done in Task 2, verify)
- Modify: `front/AGENTS.md`
- Modify: `docs/UI-REVIEW.md`
- Run: `npm run check`

**Interfaces:**
- Produces: the durable design source of truth and a green gate.
- Consumes: everything above.

- [ ] **Step 1: Write `docs/DESIGN.md`**

A short, durable document (not a copy of the whole spec):

- The identity in one paragraph ("ink and paper", calm/premium/editorial).
- The token tables for colour, type, space, radius, controls, layout, motion (link to the spec
  for the full rationale).
- The rules: two materials, four states, token-first, reduced motion, AA, English/LTR,
  Persian data handling.
- A "where to change what" table: colour → `tokens.css`; type/motion → `globals.css`;
  primitives → `components/ui`; a new shared pattern must become a primitive, not a copy.
- A link to this phase's spec and plan.

- [ ] **Step 2: Record the divergence from mobile**

In `front/AGENTS.md`, under the design/theme rules, add:

> The web has its own visual identity (2026-11 rebrand). `src/styles/tokens.css` is the web
> source of truth; it is no longer a transcription of `mobile/src/theme/tokens.ts`. Product
> rules — English/LTR, two materials, four states, token-first, reduced motion, AA — still
> match the phone. Do not "sync" a visual token back to mobile without a product decision.

Update the existing "Port, don't reinvent" / token references that still claim the phone is the
source. Do not rewrite unrelated sections.

- [ ] **Step 3: Update the review record**

Add a dated header note to `docs/UI-REVIEW.md`:

> 2026-11-04: Phase 1 of the rebrand resolved §3.1.1, §3.1.3, §3.2.4, §3.2.5, §3.2.6, §3.3.7,
> §3.4.11, §3.6.16 and added the route transition from §2.3. The remaining §3 items are
> Phase 2–5 work; the token values in this document are superseded by `docs/DESIGN.md`.

Do not delete the historical review; it is the record of what was true when it was written.

- [ ] **Step 4: Run the full gate**

Run:

```bash
env NODE_OPTIONS= npm run check
```

Expected: declarations drift → tsc → eslint → vitest → next build all pass, `0 problems` in the
ESLint summary.

If the foreground budget kills it at exit 137, run it in the background and read the log:

```bash
env NODE_OPTIONS= npm run check > /tmp/pejvak-check.log 2>&1 &
tail -f /tmp/pejvak-check.log
```

If `/safe-delete` blocks `.next`, `mv .next /tmp/next-old` and rerun. If `next build` rewrites
`tsconfig.json`, commit it.

- [ ] **Step 5: Commit the docs and the gate fix (if any)**

```bash
git add docs/DESIGN.md docs/UI-REVIEW.md front/AGENTS.md tsconfig.json
git commit -m ":memo: docs(front): Record the web design system and rebrand phase 1"
```

---

## Phase 1 done-when

- `npm run check` is green.
- The design-contract test fails if a token, contrast pair, ramp, or reduced-motion rule is
  removed.
- `npm run capture` produces light/dark, desktop/mobile, reduced-motion screenshots; every
  route in the Phase 1 scope has been inspected.
- Home reads figure-first; Library's Added column shows a date; History's row is two caption
  lines with the time range louder than the duration.
- A Persian title in a heading has `dir="auto"` and no Latin tracking.
- The shell, dashboard, library and history use no literal colour, spacing, radius, type size
  or motion duration outside component-local dimensions.
- `docs/DESIGN.md` is the durable source of truth and `front/AGENTS.md` records the divergence
  from mobile.

---

## Follow-on plans (not in this document)

- **Phase 2:** playlists, settings, browse, auth, root error/loading/not-found.
- **Phase 3:** player screen, scrubber/wave, transport grouping, queue and timer sheets,
  annotations.
- **Phase 4:** admin console.
- **Phase 5:** long-content, forced-colours, print, visual regression snapshots.

Each follow-on plan starts from `docs/DESIGN.md`, adds no new tokens without a spec change, and
ends with the same capture + `npm run check` gate.
