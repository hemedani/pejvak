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

function nestedBlock(css: string, marker: string): string {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`missing ${marker}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed ${marker}`);
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
      "glass-blur", "glass-blur-raised", "glass-saturate", "glass-sheen",
      "glass-edge", "glass-glow-alpha",
      "text", "text-secondary", "text-tertiary",
      "accent", "accent-soft", "on-accent", "danger", "danger-soft", "scrim", "track", "icon",
      "warning", "warning-soft", "on-warning",
      "radius-2xs", "radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-card",
      "radius-xl", "radius-xxl", "radius-pill",
      "space-xxs", "space-xs", "space-sm", "space-md", "space-lg", "space-xl", "space-xxl",
      "space-xxxl", "space-huge", "space-giant",
      "control-sm", "control-md", "control-lg", "control-thumb", "tap-min",
      "layout-sidebar", "layout-topbar", "layout-content", "layout-player",
      "layout-player-bar", "layout-dock", "layout-sheet", "layout-artwork", "measure-prose",
      "measure-narrow", "measure-form",
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
      ["warning", "surface", 4.5], ["on-warning", "warning", 4.5],
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
    expect(globalsCss).toContain('[dir="auto"]:dir(rtl)');
  });

  it("collapses both duration and delay under reduced motion", () => {
    const reduced = nestedBlock(globalsCss, "@media (prefers-reduced-motion: reduce)");
    expect(reduced).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(reduced).toMatch(/animation-delay:\s*0ms\s*!important/);
    expect(reduced).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(reduced).toMatch(/transition-delay:\s*0ms\s*!important/);
    expect(reduced).toMatch(/::view-transition-new\(root\)[^}]*animation:\s*none/);
  });

  it("resolves both themes to the light palette when printing", () => {
    const print = nestedBlock(tokensCss, "@media print");
    expect(print).toContain(":root.dark");
    expect(print).toMatch(/--canvas:\s*#ffffff/);
    expect(print).toMatch(/--surface:\s*#ffffff/);
    expect(print).toMatch(/--text:\s*#1b1a17/);
    expect(print).toMatch(/--shadow:\s*transparent/);
  });

  it("keeps the two meaning-bearing states in forced colours", () => {
    const forced = nestedBlock(globalsCss, "@media (forced-colors: active)");
    expect(forced).toMatch(/:focus-visible\s*\{[^}]*outline-color:\s*Highlight/);
    expect(forced).toMatch(/\[aria-current="page"\][^}]*outline:\s*2px solid Highlight/);
    expect(forced).toContain("CanvasText");
    expect(forced).toMatch(/\.wash\s*\{\s*background-image:\s*none/);
  });

  it("takes the shell chrome off paper", () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    const chrome = [
      "../../components/layout/sidebar.tsx",
      "../../components/layout/topbar.tsx",
      "../../components/player/player-bar.tsx",
      "../../app/(admin)/admin/layout.tsx",
    ];
    for (const path of chrome) expect(read(path)).toContain("print:hidden");
  });

  it("lets catalogue data set its own direction", () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    const surfaces: Array<[string, string[]]> = [
      ["../../app/(shell)/library/[trackId]/page.tsx", [
        '<h1 dir="auto"', '<p dir="auto"', '<Badge dir="auto"',
      ]],
      ["../../components/domain/annotation-list.tsx", ['<p dir="auto"']],
      ["../../components/player/player-bar.tsx", ['<span dir="auto"']],
    ];
    for (const [path, needles] of surfaces) {
      const source = read(path);
      for (const needle of needles) expect(source).toContain(needle);
    }
  });

  /**
   * The glass material is the one place a floating surface may differ from a
   * read surface, and it has four obligations that are easy to drop in a
   * refactor: it refracts (blur *and* saturate), it has a thickness (the sheen
   * and the opposed edges), it can intensify without a second element, and it
   * gets out of the way in forced colours and on paper.
   */
  it("keeps glass a floating material, with a thickness and a way out", () => {
    expect(globalsCss).toMatch(/@property --float-blur\s*\{[^}]*syntax:\s*"<length>"/);
    expect(globalsCss).toContain(
      "backdrop-filter: blur(var(--float-blur)) saturate(var(--glass-saturate))",
    );
    expect(globalsCss).toContain("background-image: var(--glass-sheen)");
    expect(globalsCss).toContain("box-shadow: var(--glass-edge), var(--elevation-float)");

    // Blur alone is fog; the saturation is what reads as glass.
    expect(token(light, "glass-saturate")).not.toBe("100%");
    expect(token(dark, "glass-saturate")).not.toBe("100%");

    // A registered length that only ever moves between two theme values.
    expect(globalsCss).toContain("--float-blur: var(--glass-blur)");
    expect(globalsCss).toContain("--float-blur: var(--glass-blur-raised)");

    // The glow's alpha is `opacity`, not a `color-mix`: `color-mix` with a
    // `var()` compiles to a full-strength fallback plus an `@supports` block, and
    // a full-strength neon blob is not a graceful degradation.
    expect(globalsCss).toContain("opacity: var(--glass-glow-alpha)");
    expect(globalsCss).not.toContain("color-mix(in oklab, var(--dock-glow");

    const forced = nestedBlock(globalsCss, "@media (forced-colors: active)");
    expect(forced).toMatch(/\.glass-dock[^{]*\{[^}]*backdrop-filter:\s*none/);

    const print = nestedBlock(tokensCss, "@media print");
    expect(print).toMatch(/--glass-blur:\s*0px/);
    expect(print).toMatch(/--glass-sheen:\s*none/);
  });

  /**
   * The dock's colour comes from the track, its *volume* from the theme. If the
   * component ever hard-codes a colour here, the glow stops belonging to the
   * thing that is playing — which is the only reason it exists.
   */
  it("tints the dock from the track's palette, not from a literal", () => {
    const dock = readFileSync(
      new URL("../../components/player/player-bar.tsx", import.meta.url),
      "utf8",
    );
    expect(dock).toContain("paletteFor");
    expect(dock).toContain('"--dock-glow"');
    expect(dock).toContain("dock-glow");
    expect(dock).toContain("glass-dock");
    // Glass is for floats, and a float is inset: a full-bleed strip is a bar.
    expect(dock).toContain("max-w-[var(--layout-dock)]");
    expect(dock).not.toContain("border-t border-[var(--glass-border)]");
  });

  /**
   * Where a dialog is put is a claim about the app, and this is the one thing in
   * this file that no type, lint rule or snapshot would have caught.
   *
   * The panel used to be placed with `start-1/2` *and* `translate-x-1/2`. Those
   * do not centre: the first puts the left edge at the middle of the window and
   * the second pushes it a further half panel-width right, so the panel's right
   * edge landed exactly on the window edge. Every sheet in the app opened flush
   * against the right — reading as a drawer that had lost its width, which is
   * what a listener reported before this test existed.
   */
  it("centres the sheet in the space the dock leaves, not in the window", () => {
    const sheet = readFileSync(
      new URL("../../components/player/sheet.tsx", import.meta.url),
      "utf8",
    );

    // Centring is `mx-auto`. A translate on top of `start-1/2` is the bug.
    expect(sheet).toContain("sm:mx-auto");
    expect(sheet).not.toContain("sm:start-1/2");
    expect(sheet).not.toContain("sm:translate-x-1/2");
    expect(globalsCss).not.toContain("translate(50%, 50%)");

    // The only transform left is the half-height that pairs with `bottom`, and
    // it is on one axis so the two halves cannot disagree about the sign.
    // The offset *adds* the clearance: with `bottom: B` and `translateY(50%)`
    // the panel's centre lands at `B` from the window bottom, so B has to be
    // the centre of the free area — `50% + clearance/2`. A minus there is the
    // right-edge bug again, one axis over.
    expect(sheet).toContain("sm:translate-y-1/2");
    expect(sheet).toContain("calc(50%_+_var(--sheet-clearance)/2)");

    // A dialog stops above the dock rather than covering it — the listener
    // keeps the player while reading a session's timeline.
    expect(sheet).toContain("bottom-[var(--sheet-clearance)]");
    expect(globalsCss).toContain("--sheet-clearance:");
    expect(globalsCss).toContain("var(--dock-height, 0px)");

    // And the number is measured, because `--layout-player-bar` is a min-height
    // inside a padded container and is not the dock's height.
    const dock = readFileSync(
      new URL("../../components/player/player-bar.tsx", import.meta.url),
      "utf8",
    );
    expect(dock).toContain("--dock-height");
    expect(dock).toContain("ResizeObserver");
  });
});
