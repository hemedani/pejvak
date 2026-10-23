import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { readFileSync } from "node:fs";

import { ICON_GLYPHS } from "@/components/ui/icon";

describe("ICON_GLYPHS", () => {
  it("maps every semantic name to a real MaterialCommunityIcons glyph", () => {
    for (const [semantic, glyph] of Object.entries(ICON_GLYPHS)) {
      expect({
        semantic,
        glyph,
        present: MaterialCommunityIcons.glyphMap[glyph] !== undefined,
      }).toEqual({ semantic, glyph, present: true });
    }
  });

  it("has a filled pair for every dock destination", () => {
    for (const base of [
      "library",
      "history",
      "stats",
      "playlists",
      "compass",
    ]) {
      expect(ICON_GLYPHS[base as keyof typeof ICON_GLYPHS]).toBeDefined();
    }
  });

  it("has a base name for every *Filled semantic", () => {
    for (const semantic of Object.keys(ICON_GLYPHS)) {
      if (!semantic.endsWith("Filled")) {
        continue;
      }
      const base = semantic.slice(0, -"Filled".length);
      expect(ICON_GLYPHS[base as keyof typeof ICON_GLYPHS]).toBeDefined();
    }
  });

  it("does not give two unrelated semantics the same glyph", () => {
    const byGlyph = new Map<string, string[]>();
    for (const [semantic, glyph] of Object.entries(ICON_GLYPHS)) {
      byGlyph.set(glyph, [...(byGlyph.get(glyph) ?? []), semantic]);
    }
    const duplicatePairs = [...byGlyph.values()].filter(
      (semantics) => semantics.length > 1,
    );
    expect(duplicatePairs).toEqual([]);
  });

  it("imports only MaterialCommunityIcons", () => {
    const source = readFileSync("src/components/ui/icon.tsx", "utf8");
    expect(source).toContain("MaterialCommunityIcons");
    expect(source).not.toContain("Ionicons");
    expect(source).not.toContain("@expo/vector-icons/MaterialIcons");
  });
});
