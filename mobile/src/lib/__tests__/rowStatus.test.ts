import { STATUS_KINDS, isStatusKind } from "@/lib/rowStatus";

describe("status vocabulary", () => {
  it("has no duplicate kinds", () => {
    expect(new Set(STATUS_KINDS).size).toBe(STATUS_KINDS.length);
  });

  it("accepts every declared kind", () => {
    for (const kind of STATUS_KINDS) {
      expect(isStatusKind(kind)).toBe(true);
    }
  });

  it("rejects a word that is not a status", () => {
    expect(isStatusKind("finished ")).toBe(false);
    expect(isStatusKind("Complete")).toBe(false);
    expect(isStatusKind("")).toBe(false);
  });
});
