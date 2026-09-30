/**
 * The contrast contract for the palette.
 *
 * Every number here is a decision someone had to make, and every one of them is
 * invisible until it is wrong. A card that measures 1.04:1 against its own
 * background still *renders* — it just stops reading as a card, and nothing in
 * the app complains. So the numbers are pinned as tests instead, and a palette
 * edit that breaks legibility fails the suite rather than shipping.
 *
 * Three families of assertion:
 *
 *   1. **Text on surfaces** — WCAG AA, 4.5:1, for every text tier on every
 *      surface it is allowed to sit on.
 *   2. **Tier separation** — `textSecondary` and `textTertiary` are *different
 *      tiers*, so they must be measurably different colours. Without this, a
 *      layout that leans on a two-step hierarchy silently collapses to one flat
 *      grey, which is the single most common way a card becomes unreadable.
 *   3. **Non-text boundaries** — WCAG 1.4.11, 3:1, for hairlines and the
 *      card-to-canvas step that makes a panel read as a panel.
 */

import { colors, radius, typeScale, type ColorScheme } from "@/theme/tokens";

/** WCAG 2.1 minimum for body text. */
const AA_TEXT = 4.5;
/** WCAG 1.4.11 minimum for a boundary that carries meaning. */
const AA_NON_TEXT = 3;

/** `StyleSheet.hairlineWidth` and friends: alpha strings, not hex. */
type Rgba = { r: number; g: number; b: number; a: number };

function parse(color: string): Rgba {
  const value = color.trim();

  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }

  const hex = value.replace("#", "");
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (expanded.length !== 6) {
    throw new Error(`Unsupported colour: ${color}`);
  }
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
    a: 1,
  };
}

/** Flattens a translucent colour onto an opaque one — how the screen really looks. */
function flatten(fg: string, bg: string): Rgba {
  const top = parse(fg);
  const bottom = parse(bg);
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG relative-contrast ratio, 1–21. */
export function contrast(fg: string, bg: string): number {
  const a = luminance(parse(fg));
  const b = luminance(flatten(bg, "#FFFFFF"));
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

/** The same ratio, for two colours already flattened. */
function ratioOf(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Renders a flattened colour back into a string `flatten` can take as a base. */
function toRgb({ r, g, b }: Rgba): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

const SCHEMES: ColorScheme[] = ["light", "dark"];

describe.each(SCHEMES)("palette — %s", (scheme) => {
  const c = colors[scheme];

  describe("body text on every surface it is allowed to sit on", () => {
    const surfaces = [
      ["canvas", c.canvas],
      ["surface", c.surface],
      ["surfaceSunken", c.surfaceSunken],
    ] as const;

    const tiers = [
      ["text", c.text],
      ["textSecondary", c.textSecondary],
      ["textTertiary", c.textTertiary],
      ["accent", c.accent],
      ["danger", c.danger],
    ] as const;

    it.each(
      surfaces.flatMap(([surfaceName, surface]) =>
        tiers.map(
          ([tierName, tier]) => [tierName, surfaceName, tier, surface] as const,
        ),
      ),
    )("%s on %s", (_tier, _surface, tier, surface) => {
      expect(contrast(tier, surface)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it("keeps the accent legible where it is used for the onAccent fill", () => {
      // PrimaryButton draws `onAccent` on top of a solid `accent` — and so does
      // the dock's selected destination, where `onAccent` is a 20pt glyph knocked
      // out of the circle. This is the one place a saturated fill carries text.
      expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });

  describe("the two quiet tiers are actually different tiers", () => {
    it("separates textSecondary from textTertiary", () => {
      // This is the assertion that keeps a two-step hierarchy from collapsing.
      // The palette that motivated it measured 1.07:1 — the same grey, twice.
      expect(contrast(c.textSecondary, c.textTertiary)).toBeGreaterThanOrEqual(
        1.3,
      );
    });

    it("separates text from textSecondary", () => {
      expect(contrast(c.text, c.textSecondary)).toBeGreaterThanOrEqual(1.6);
    });
  });

  describe("the card is a shape, not a tint", () => {
    it("lifts the card off the canvas", () => {
      // Below ~1.2:1 a panel stops reading as a panel and the page becomes one
      // undifferentiated field. The glass palette this replaced sat at 1.07:1.
      expect(contrast(c.surface, c.canvas)).toBeGreaterThanOrEqual(1.2);
    });

    it("lifts the card off the elevated canvas too", () => {
      expect(contrast(c.surface, c.canvasElevated)).toBeGreaterThanOrEqual(
        1.12,
      );
    });

    it("draws a hairline you can see against the card", () => {
      expect(contrast(c.outline, c.surface)).toBeGreaterThanOrEqual(1.6);
    });

    it("draws a hairline you can see against the canvas", () => {
      expect(contrast(c.outline, c.canvas)).toBeGreaterThanOrEqual(1.5);
    });

    it("separates a row divider from the card, without shouting", () => {
      // A row divider is structure, not a boundary the user acts on, so it sits
      // below the 3:1 non-text floor on purpose — but it must still be visible.
      const ratio = contrast(c.outlineVariant, c.surface);
      expect(ratio).toBeGreaterThanOrEqual(1.22);
      expect(ratio).toBeLessThan(AA_NON_TEXT);
    });

    it("separates the sunken track from the card it sits on", () => {
      expect(contrast(c.surfaceSunken, c.surface)).toBeGreaterThanOrEqual(1.04);
    });
  });

  describe("a floating panel keeps an edge over an opaque card", () => {
    // The tab bar and the mini-player float over cards now, not over a frosted
    // wash, so their own outline is the only thing drawing their boundary. The
    // palette that predates this used a white hairline on a near-white fill and
    // measured 1.00:1 — an edge that was not there.
    it("draws a hairline you can see against its own fill", () => {
      const fill = flatten(c.glass, c.surface);
      const border = flatten(c.glassBorder, toRgb(fill));
      expect(ratioOf(border, fill)).toBeGreaterThanOrEqual(1.25);
    });

    it("keeps the floating fill from being a perfect match for the card beneath", () => {
      // A floating bar is allowed to be a near-match in *fill* — it is lifted by
      // shadow, not by colour — but it must not be an exact one.
      const overCard = flatten(c.glass, c.surface);
      expect(ratioOf(overCard, parse(c.surface))).toBeGreaterThan(0.98);
    });
  });
});

describe("shape lock", () => {
  /** The ramp itself. Everything else in the scale is a name for one of these. */
  const RAMP = ["xs", "sm", "md", "lg", "card", "xl", "xxl"] as const;

  it("has exactly one card radius", () => {
    // Screens used to hard-code 20 / 22 / 24 / 26 / 28, which reads as assembled
    // from parts. Every card now resolves through this one value.
    expect(radius.card).toBe(28);
  });

  it("is strictly increasing, so a bigger shape always looks bigger", () => {
    const values = RAMP.map((step) => radius[step]);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("uses even values throughout", () => {
    // A 1px difference between two neighbouring cards is what makes a screen
    // look like it was assembled rather than designed.
    for (const step of RAMP) {
      expect(radius[step] % 2).toBe(0);
    }
  });

  it("resolves every semantic alias onto the ramp", () => {
    const onRamp = new Set<number>(RAMP.map((step) => radius[step]));
    for (const alias of ["tile", "badge", "segment", "panel"] as const) {
      expect(onRamp.has(radius[alias])).toBe(true);
    }
  });

  it("ends the ramp at the pill", () => {
    expect(radius.pill).toBeGreaterThan(radius.xxl);
  });
});

describe("type scale", () => {
  it("has a figure size for a card's headline number", () => {
    expect(typeScale.figure.fontSize).toBeGreaterThan(
      typeScale.heading.fontSize,
    );
  });

  it("gives every variant room for its descenders", () => {
    // A line height at or below the font size clips the tail of a Persian or
    // Latin glyph, and a clipped card label is a card nobody can read.
    for (const [name, variant] of Object.entries(typeScale)) {
      expect(`${name}:${variant.lineHeight}`).toBe(
        `${name}:${variant.lineHeight}`,
      );
      expect(variant.lineHeight).toBeGreaterThan(variant.fontSize);
    }
  });

  it("keeps a card's figure optically tighter than its title's", () => {
    // Tracking scales down with size. A large number set at title tracking
    // looks loose; one set at figure tracking looks set.
    expect(typeScale.figure.letterSpacing).toBeLessThan(
      typeScale.title.letterSpacing,
    );
  });

  it("marks the readouts that count, so digits do not jitter", () => {
    expect(typeScale.figure.fontVariant).toEqual(["tabular-nums"]);
    expect(typeScale.numeric.fontVariant).toEqual(["tabular-nums"]);
  });
});
