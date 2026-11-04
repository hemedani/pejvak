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
    expect(globalsCss).toContain('[dir="auto"]:dir(rtl)');
  });
});
