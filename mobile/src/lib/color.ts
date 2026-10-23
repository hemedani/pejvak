type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace("#", "");
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  if (expanded.length !== 6 || !/^[0-9a-f]{6}$/i.test(expanded)) {
    return null;
  }
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Black or white, whichever is legible on the given swatch.
 *
 * A colour chip draws a check mark in its own foreground, and the annotation
 * palette deliberately spans light amber to deep purple. Picking white for all
 * of them makes the amber check disappear; picking black for all of them makes
 * the purple one disappear. The comparison is WCAG's own contrast formula, not
 * a guessed luminance cut-off, so adding a colour to the palette cannot quietly
 * produce an unreadable check.
 */
export function readableOn(hex: string): "#000000" | "#FFFFFF" {
  const rgb = parseHex(hex);
  if (!rgb) {
    return "#FFFFFF";
  }
  const light = luminance(rgb);
  const black = (light + 0.05) / 0.05;
  const white = 1.05 / (light + 0.05);
  return black >= white ? "#000000" : "#FFFFFF";
}
