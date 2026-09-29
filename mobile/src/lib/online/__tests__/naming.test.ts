/**
 * The naming rules for downloaded audio.
 *
 * These are the tests that matter most in the whole feature, because the input
 * is hostile: the source's titles are Persian prose containing `/`, `؟`, quotes,
 * colons, emoji and 120-character headlines, and a bug here does not throw — it
 * silently writes a file with a name the filesystem truncates, or two episodes
 * that overwrite each other.
 */

import {
  collectionFolderKey,
  collectionRelativePath,
  extensionFromUrl,
  ONLINE_ROOT,
  sanitizeSegment,
  slugify,
  trackFileName,
} from "@/lib/online/naming";

describe("sanitizeSegment", () => {
  it("keeps a Persian title intact", () => {
    expect(sanitizeSegment("تاریخ شیعه")).toBe("تاریخ شیعه");
  });

  it("replaces every character a filesystem will not accept", () => {
    expect(sanitizeSegment('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("strips the bidi marks a Persian title often carries", () => {
    // U+200E (LRM) and U+200F (RLM) are invisible in a title and rejected by
    // some storage layers, so they must not survive into a file name.
    expect(sanitizeSegment("شیعه\u200f\u200e")).toBe("شیعه");
  });

  it("collapses the whitespace the substitutions leave behind", () => {
    expect(sanitizeSegment("a  /  b")).toBe("a - b");
  });

  it("strips trailing dots and spaces", () => {
    expect(sanitizeSegment("Episode one. ")).toBe("Episode one");
  });

  it("falls back rather than producing a nameless file", () => {
    expect(sanitizeSegment("   ")).toBe("Untitled");
    expect(sanitizeSegment("", "Collection")).toBe("Collection");
  });

  it("clips a long headline on a word boundary", () => {
    const title = `${"کلمه ".repeat(30)}end`;
    const clipped = sanitizeSegment(title);
    expect(clipped.length).toBeLessThanOrEqual(90);
    expect(clipped.endsWith("کلمه")).toBe(true);
  });
});

describe("slugify", () => {
  it("uses the fallback when a Persian title yields no ASCII", () => {
    // The whole reason the slug exists: an ASCII filter empties a Persian name,
    // and an empty folder name is not a folder.
    expect(slugify("تاریخ شیعه", "195")).toBe("195");
  });

  it("slugifies a Latin title", () => {
    expect(slugify("History of Shi'ism", "x")).toBe("history-of-shi-ism");
  });
});

describe("collectionFolderKey", () => {
  it("is namespaced by source and stable across titles", () => {
    expect(collectionFolderKey("manahej", "190")).toBe(`${ONLINE_ROOT}/manahej/190`);
  });

  it("does not use the title, so renaming a show cannot orphan its files", () => {
    const before = collectionFolderKey("manahej", "190");
    const after = collectionFolderKey("manahej", "190");
    expect(before).toBe(after);
  });
});

describe("collectionRelativePath", () => {
  it("keeps the title readable and the id unique", () => {
    expect(collectionRelativePath("manahej", "تاریخ شیعه", "190")).toBe(
      `${ONLINE_ROOT}/manahej/تاریخ شیعه (190)`,
    );
  });

  it("sanitises the title rather than trusting it", () => {
    expect(collectionRelativePath("manahej", "a/b:c", "7")).toBe(
      `${ONLINE_ROOT}/manahej/a-b-c (7)`,
    );
  });
});

describe("trackFileName", () => {
  it("zero-pads the position so a course sorts in the filesystem too", () => {
    expect(trackFileName(3, "نسخه پیروزی", "https://x/y.mp3")).toBe("03 - نسخه پیروزی.mp3");
  });

  it("pads past nine without reordering ten", () => {
    expect(trackFileName(10, "Tenth", "https://x/y.mp3")).toBe("10 - Tenth.mp3");
    // 9 must still sort before 10, which is what the padding buys.
    expect(trackFileName(9, "Ninth", "https://x/y.mp3") < trackFileName(10, "Tenth", "https://x/y.mp3")).toBe(true);
  });

  it("takes the extension from the URL, ignoring its signature", () => {
    expect(trackFileName(1, "Episode", "https://dl.x/podcast/a.mp3?md5=abc&expires=99")).toBe(
      "01 - Episode.mp3",
    );
  });

  it("sanitises a title that contains a path separator", () => {
    expect(trackFileName(2, "Part 2/3", "https://x/y.mp3")).toBe("02 - Part 2-3.mp3");
  });
});

describe("extensionFromUrl", () => {
  it("reads the extension from before the query string", () => {
    expect(extensionFromUrl("https://dl.x/a.m4a?md5=1")).toBe("m4a");
  });

  it("defaults to mp3 when there is no extension to read", () => {
    expect(extensionFromUrl("https://dl.x/stream?id=4")).toBe("mp3");
  });

  it("refuses to treat a signed URL's tail as a file extension", () => {
    expect(extensionFromUrl("https://dl.x/audio.php?expires=17")).toBe("mp3");
  });
});
