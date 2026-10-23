import { addTag, removeTag } from "@/lib/tags";

describe("addTag", () => {
  it("rejects an empty draft", () => {
    expect(addTag([], "  ")).toEqual({
      tags: [],
      added: false,
      reason: "empty",
    });
  });

  it("trims and collapses internal whitespace", () => {
    expect(addTag([], "  Persian  history ")).toEqual({
      tags: ["Persian history"],
      added: true,
    });
  });

  it("rejects duplicates by the Persian fold", () => {
    expect(addTag(["کتاب"], "كتاب")).toMatchObject({
      added: false,
      reason: "duplicate",
    });
    expect(addTag(["می‌رود"], "میرود")).toMatchObject({
      added: false,
      reason: "duplicate",
    });
    expect(addTag(["123"], "۱۲۳")).toMatchObject({
      added: false,
      reason: "duplicate",
    });
  });

  it("enforces the tag count and the per-tag length", () => {
    const ten = Array.from({ length: 10 }, (_, index) => `tag-${index}`);
    expect(addTag(ten, "one more")).toMatchObject({
      added: false,
      reason: "limit",
    });
    expect(addTag([], "x".repeat(25))).toMatchObject({
      added: false,
      reason: "too-long",
    });
    expect(addTag([], "x".repeat(24))).toMatchObject({ added: true });
  });

  it("never mutates the tags it was given", () => {
    const tags = ["one"];
    addTag(tags, "two");
    expect(tags).toEqual(["one"]);
  });
});

describe("removeTag", () => {
  it("removes only the requested index", () => {
    expect(removeTag(["one", "two", "three"], 1)).toEqual(["one", "three"]);
  });

  it("returns an unchanged copy for an index that does not exist", () => {
    const tags = ["one"];
    expect(removeTag(tags, 4)).toEqual(["one"]);
    expect(removeTag(tags, 4)).not.toBe(tags);
  });
});
