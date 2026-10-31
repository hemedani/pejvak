/**
 * The catalogue helpers: keys, sizes, sources, and the rules that keep an
 * unknown quantity from being printed as zero.
 */

import { describe, expect, it } from "vitest";

import {
  collectionKey,
  describeCollectionLine,
  describeKnownTrackCount,
  findLanguage,
  findSource,
  isLiveSource,
  parseCollectionKey,
  sourceLanguages,
  sourcesForLanguage,
  SOURCES,
} from "@/lib/online";
import { LANGUAGES } from "@/lib/online/languages";

describe("collectionKey / parseCollectionKey", () => {
  it("round-trips", () => {
    expect(collectionKey("manahej", "190")).toBe("manahej:190");
    expect(parseCollectionKey("manahej:190")).toEqual({
      sourceId: "manahej",
      externalId: "190",
    });
  });

  it("keeps a colon inside the external id", () => {
    expect(parseCollectionKey("manahej:a:b")).toEqual({
      sourceId: "manahej",
      externalId: "a:b",
    });
  });

  it("refuses a key with no source, no id, or no separator", () => {
    expect(parseCollectionKey("190")).toBeNull();
    expect(parseCollectionKey(":190")).toBeNull();
    expect(parseCollectionKey("manahej:")).toBeNull();
    expect(parseCollectionKey("")).toBeNull();
  });
});

describe("describeKnownTrackCount", () => {
  it("says nothing when the size is not known before opening", () => {
    expect(describeKnownTrackCount(0)).toBeNull();
  });

  it("speaks as soon as the size is known", () => {
    expect(describeKnownTrackCount(1)).toBe("1 track");
    expect(describeKnownTrackCount(35)).toBe("35 tracks");
  });
});

describe("describeCollectionLine", () => {
  it("joins the grouping and the known size", () => {
    expect(describeCollectionLine({ subtitle: "اخلاق", trackCount: 41 })).toBe(
      "اخلاق · 41 tracks",
    );
  });

  it("omits an unknown size rather than printing zero", () => {
    expect(describeCollectionLine({ subtitle: "اخلاق", trackCount: 0 })).toBe("اخلاق");
  });

  it("omits a missing grouping line", () => {
    expect(describeCollectionLine({ subtitle: null, trackCount: 29 })).toBe("29 tracks");
  });

  it("says nothing when neither half is true", () => {
    expect(describeCollectionLine({ subtitle: null, trackCount: 0 })).toBeNull();
  });
});

describe("the source registry", () => {
  it("offers more than one source for Persian", () => {
    expect(sourcesForLanguage("fa").map((source) => source.id)).toEqual(
      expect.arrayContaining(["manahej", "aminikhaah", "aminikhaah-podcasts", "archive-fa"]),
    );
  });

  it("finds an archive source for a language with no bespoke adapter", () => {
    expect(sourcesForLanguage("sv").map((source) => source.id)).toContain("archive-sv");
  });

  it("answers nothing for a language it does not know", () => {
    expect(sourcesForLanguage("xx")).toEqual([]);
  });

  it("lists both languages of a multi-language source", () => {
    const librivox = findSource("librivox");
    expect(librivox).not.toBeNull();
    if (librivox) {
      expect(sourceLanguages(librivox)).toEqual(["de", "nl"]);
    }
  });

  it("knows which sources are live", () => {
    expect(isLiveSource("radiobrowser")).toBe(true);
    expect(isLiveSource("librivox")).toBe(false);
    expect(isLiveSource(null)).toBe(false);
  });

  it("has a source for every language in the catalogue", () => {
    const withoutSource = LANGUAGES.filter(
      (language) => sourcesForLanguage(language.code).length === 0,
    );
    expect(withoutSource.map((language) => language.code)).toEqual([]);
  });

  it("marks every language a registered source serves as available", () => {
    for (const source of SOURCES) {
      const language = findLanguage(source.languageCode);
      expect(language?.available).toBe(true);
    }
  });

  it("has no duplicate source ids", () => {
    const ids = SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
