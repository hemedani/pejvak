import { ANNOTATION_COLOR_NAMES, ANNOTATION_COLORS } from "@/lib/annotations";
import { readableOn } from "@/lib/color";

describe("readableOn", () => {
  it("puts black on the amber swatch and white on the purple one", () => {
    expect(readableOn("#F5A623")).toBe("#000000");
    expect(readableOn("#8E4EC6")).toBe("#FFFFFF");
  });

  it("has an answer for every annotation colour", () => {
    for (const color of ANNOTATION_COLORS) {
      expect(["#000000", "#FFFFFF"]).toContain(readableOn(color));
    }
  });
});

describe("ANNOTATION_COLOR_NAMES", () => {
  it("names every swatch exactly once", () => {
    const entries = Object.entries(ANNOTATION_COLOR_NAMES);
    expect(entries).toHaveLength(ANNOTATION_COLORS.length);
    expect(new Set(entries.map(([, name]) => name)).size).toBe(
      ANNOTATION_COLORS.length,
    );
    for (const color of ANNOTATION_COLORS) {
      expect(ANNOTATION_COLOR_NAMES[color]).toBeTruthy();
    }
  });
});
