import { directionFor, isRtlText, textAlignFor } from "@/lib/textDirection";

describe("isRtlText", () => {
  it("recognises a Persian title", () => {
    expect(isRtlText("تاریخ شیعه")).toBe(true);
  });

  it("does not claim a Latin title", () => {
    expect(isRtlText("History of Shi'ism")).toBe(false);
  });

  it("counts rather than taking the first character", () => {
    expect(isRtlText("1. تاریخ شیعه")).toBe(true);
    expect(isRtlText('«تاریخ شیعه»')).toBe(true);
  });

  it("treats text with no letters at all as left-to-right", () => {
    expect(isRtlText("12345")).toBe(false);
    expect(isRtlText("")).toBe(false);
  });
});

describe("directionFor", () => {
  it("returns the direction a block uses", () => {
    expect(directionFor("تاریخ شیعه")).toBe("rtl");
    expect(directionFor("History")).toBe("ltr");
  });
});

describe("textAlignFor", () => {
  it("keeps the start alignment by default", () => {
    expect(textAlignFor("تاریخ شیعه")).toBe("left");
    expect(textAlignFor("History")).toBe("left");
  });

  it("right-aligns only content whose own text is RTL", () => {
    expect(textAlignFor("تاریخ شیعه", "content")).toBe("right");
    expect(textAlignFor("History", "content")).toBe("left");
    expect(textAlignFor("12345", "content")).toBe("left");
  });
});
