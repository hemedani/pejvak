/**
 * The online registry: keys, identity and the small pure helpers.
 *
 * The two things worth guarding here are both identity questions, and both are
 * the kind of bug that is invisible until it has already done damage:
 *
 *   · A collection key is a route param, so it is user-reachable and must be
 *     parsed defensively rather than trusted.
 *   · An online track's hash must derive from the source's own id, never the
 *     URL — a signed URL rotates, and a hash taken from it would turn one
 *     episode into two rows and split its listening history in half.
 */

import {
  collectionKey,
  describeDownloadState,
  describeKnownTrackCount,
  describeTrackCount,
  findLanguage,
  findSource,
  getAdapter,
  LANGUAGES,
  onlineIdentity,
  parseCollectionKey,
  SOURCES,
  sourcesForLanguage,
} from "@/lib/online";
import { isRtlText } from "@/lib/online/languages";

describe("collectionKey / parseCollectionKey", () => {
  it("round-trips", () => {
    const key = collectionKey("manahej", "190");
    expect(key).toBe("manahej:190");
    expect(parseCollectionKey(key)).toEqual({ sourceId: "manahej", externalId: "190" });
  });

  it("keeps an id that itself contains a colon in the external half", () => {
    // The separator is the *first* colon, so a source that names things with
    // colons still round-trips rather than silently losing a prefix.
    expect(parseCollectionKey("manahej:a:b")).toEqual({ sourceId: "manahej", externalId: "a:b" });
  });

  it("refuses a key with no source, no id, or no separator", () => {
    expect(parseCollectionKey("190")).toBeNull();
    expect(parseCollectionKey(":190")).toBeNull();
    expect(parseCollectionKey("manahej:")).toBeNull();
    expect(parseCollectionKey("")).toBeNull();
  });
});

describe("onlineIdentity", () => {
  it("namespaces the identity by source", () => {
    expect(onlineIdentity("manahej", "190")).toBe("online:manahej:190");
  });

  it("is the same string whatever the URL was", () => {
    // The point of the whole helper: the URL is signed and rotates, the id does
    // not, so identity must not be able to see the URL at all.
    const before = onlineIdentity("manahej", "190");
    const after = onlineIdentity("manahej", "190");
    expect(before).toBe(after);
  });
});

describe("the registry", () => {
  it("offers more than one source for Persian, and one for a language with no bespoke adapter", () => {
    // Persian has a hand-written adapter *and* the archive; every other
    // language in the catalogue is served by the archive alone.
    expect(sourcesForLanguage("fa").length).toBeGreaterThan(1);
    expect(sourcesForLanguage("sv").length).toBeGreaterThan(0);
  });

  it("still answers nothing for a language it does not know", () => {
    expect(sourcesForLanguage("xx")).toEqual([]);
  });

  it("has a source for every language in the catalogue", () => {
    // The Browse tab lists the world's languages and marks the ones with
    // nothing behind them, so a language without a source is a dead end the
    // listener is invited to tap. Before the archive, forty-five of them were.
    const withoutSource = LANGUAGES.filter(
      (language) => sourcesForLanguage(language.code).length === 0,
    );
    expect(withoutSource.map((language) => language.code)).toEqual([]);
  });

  it("marks every language a registered source serves as available", () => {
    // The drift guard. Availability is derived from the archive's own language
    // table plus a short hand-list, so a source registered for a language that
    // nobody listed would be invisible in the Browse tab while still being
    // reachable by id. This fails instead of shipping that.
    for (const source of SOURCES) {
      const language = findLanguage(source.languageCode);
      expect(language).not.toBeNull();
      expect(language?.available).toBe(true);
    }
  });

  it("builds a separate adapter for each archive language", () => {
    const persianArchive = getAdapter("archive-fa");
    const swedishArchive = getAdapter("archive-sv");

    expect(persianArchive?.source.languageCode).toBe("fa");
    expect(swedishArchive?.source.languageCode).toBe("sv");
    // Distinct objects, because the language is part of a saved collection's
    // identity: a key saved from one must not be openable through the other.
    expect(persianArchive).not.toBe(swedishArchive);
  });

  it("finds a source by id, and answers null rather than throwing", () => {
    expect(findSource("manahej")?.id).toBe("manahej");
    expect(findSource("nope")).toBeNull();
  });

  it("resolves an adapter for every registered source", () => {
    for (const source of SOURCES) {
      expect(getAdapter(source.id)).not.toBeNull();
    }
    expect(getAdapter("nope")).toBeNull();
  });

  it("describes a count in the singular and the plural", () => {
    expect(describeTrackCount(1)).toBe("1 track");
    expect(describeTrackCount(29)).toBe("29 tracks");
    expect(describeTrackCount(0)).toBe("0 tracks");
  });
});

describe("describeKnownTrackCount", () => {
  it("says nothing at all when the size is not known yet", () => {
    // A source that cannot state a collection's size up front reports zero, and
    // the real figure arrives when the collection is opened. Printing that zero
    // would label a thirty-part course as empty.
    expect(describeKnownTrackCount(0)).toBeNull();
  });

  it("speaks up as soon as the size is known", () => {
    expect(describeKnownTrackCount(1)).toBe("1 track");
    expect(describeKnownTrackCount(35)).toBe("35 tracks");
  });
});

describe("describeDownloadState", () => {
  it("names every state a download can be left in", () => {
    expect(describeDownloadState("complete")).toBe("Downloaded");
    expect(describeDownloadState("downloading")).toBe("Downloading");
    expect(describeDownloadState("failed")).toBe("Download failed");
    expect(describeDownloadState("cancelled")).toBe("Download paused");
  });

  it("says nothing when there is no download to speak of", () => {
    // "none" and "no row at all" are the same fact to a card: this collection
    // only streams. Printing "Not downloaded" would put a line of noise on
    // every listing for every language.
    expect(describeDownloadState("none")).toBeNull();
    expect(describeDownloadState(null)).toBeNull();
    expect(describeDownloadState(undefined)).toBeNull();
  });

  it("claims no progress it cannot know", () => {
    // A card in a list holds no job rows, so "Downloading" is the whole of the
    // truth available to it. A count here would have to be invented.
    expect(describeDownloadState("downloading")).not.toMatch(/\d/);
  });
});

describe("isRtlText", () => {
  it("recognises a Persian title", () => {
    expect(isRtlText("تاریخ شیعه")).toBe(true);
  });

  it("does not claim a Latin title", () => {
    expect(isRtlText("History of Shi'ism")).toBe(false);
  });

  it("counts rather than taking the first character", () => {
    // A Persian title that opens with a numeral or a quotation mark is still
    // Persian, and aligning it left would read as a rendering bug.
    expect(isRtlText("1. تاریخ شیعه")).toBe(true);
    expect(isRtlText('«تاریخ شیعه»')).toBe(true);
  });

  it("treats text with no letters at all as left-to-right", () => {
    expect(isRtlText("12345")).toBe(false);
    expect(isRtlText("")).toBe(false);
  });
});
