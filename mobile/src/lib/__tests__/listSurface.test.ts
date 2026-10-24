import { rowPositionFor } from "../listSurface";

describe("rowPositionFor", () => {
  it("treats a one-row section as the whole card", () => {
    expect(rowPositionFor(0, 1)).toBe("only");
  });

  it("marks the two ends of a multi-row section", () => {
    expect(rowPositionFor(0, 2)).toBe("first");
    expect(rowPositionFor(1, 2)).toBe("last");
  });

  it("marks the interior rows as middle", () => {
    expect(rowPositionFor(0, 4)).toBe("first");
    expect(rowPositionFor(1, 4)).toBe("middle");
    expect(rowPositionFor(2, 4)).toBe("middle");
    expect(rowPositionFor(3, 4)).toBe("last");
  });
});
