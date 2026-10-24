/**
 * The LibriVox adapter, against the shapes its API returns.
 *
 * Two quirks drive every test here:
 *
 *   · The catalogue has no working language filter. `language=German` is
 *     accepted and ignored, so the adapter must filter on each book's own
 *     `language` — otherwise a German browse is a shelf of English books.
 *   · `playtime` and `num_sections` arrive as strings and are already whole
 *     seconds. Parsing them as minutes, or letting `"not a number"` through as
 *     zero, would corrupt every figure derived from them.
 */

import { librivoxAdapter, LIBRIVOX_SOURCE } from "@/lib/online/librivox";

const BOOKS = {
  books: [
    {
      id: 1552,
      title: "Die Verwandlung",
      language: "German",
      num_sections: "3",
      totaltimesecs: 9000,
      url_librivox: "https://librivox.org/die-verwandlung-by-franz-kafka/",
      coverart_thumbnail: "https://archive.org/download/cover.jpg",
      authors: [{ first_name: "Franz", last_name: "Kafka" }],
    },
    {
      id: 42,
      title: "De Kleine Johannes",
      language: "Dutch",
      num_sections: "12",
      authors: [{ first_name: "Frederik", last_name: "van Eeden" }],
    },
    {
      id: 7,
      title: "Pride and Prejudice",
      language: "English",
      num_sections: "61",
    },
    // No id: identity cannot fall back to the archive URL, which is a cache.
    { title: "Nameless", language: "German", num_sections: "1" },
    // No title: would draw as a nameless card.
    { id: 9, language: "German", num_sections: "1" },
  ],
};

const SECTIONS = {
  sections: [
    {
      id: 300,
      section_number: "3",
      title: "Dritter Abschnitt",
      listen_url: "https://archive.org/download/x/03.mp3",
      playtime: "420",
    },
    {
      id: 100,
      section_number: "1",
      title: "Erster Abschnitt",
      listen_url: "https://archive.org/download/x/01.mp3",
      playtime: "611",
    },
    // Out of its listed slot, and a string that must sort numerically.
    {
      id: 200,
      section_number: "10",
      title: "Zehnter Abschnitt",
      listen_url: "https://archive.org/download/x/10.mp3",
      playtime: "not a number",
    },
    // No audio: nothing to play.
    { id: 400, section_number: "4", title: "Ohne Datei", playtime: "10" },
  ],
};

function stubFetch(handler: (url: string) => { ok: boolean; status: number; body?: unknown }) {
  const mock = jest.fn(async (input: unknown) => {
    const url = String(input);
    const { ok, status, body } = handler(url);
    return {
      ok,
      status,
      json: async () => body,
    };
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** The adapter declares search as a capability; this suite is about it. */
function search(query: string, options?: { languageCode?: string }) {
  if (!librivoxAdapter.searchCollections) {
    throw new Error("LibriVox does not implement search");
  }
  return librivoxAdapter.searchCollections(query, options);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the source descriptor", () => {
  it("is a multi-language audiobook source", () => {
    expect(LIBRIVOX_SOURCE.id).toBe("librivox");
    expect(LIBRIVOX_SOURCE.languageCodes).toEqual(["de", "nl"]);
    expect(LIBRIVOX_SOURCE.live).toBeUndefined();
  });
});

describe("listCollections", () => {
  it("filters on the book's own language, because the API ignores the query", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: BOOKS }));

    const collections = await librivoxAdapter.listCollections({ languageCode: "de" });

    expect(collections.map((collection) => collection.externalId)).toEqual(["1552"]);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).not.toContain("language=German");
  });

  it("returns Dutch books when Dutch was chosen", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: BOOKS }));

    const collections = await librivoxAdapter.listCollections({ languageCode: "nl" });

    expect(collections.map((collection) => collection.externalId)).toEqual(["42"]);
    expect(collections[0]?.languageCode).toBe("nl");
  });

  it("names the author, the cover and the page address", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: BOOKS }));

    const [book] = await librivoxAdapter.listCollections({ languageCode: "de" });

    expect(book).toMatchObject({
      key: "librivox:1552",
      sourceId: "librivox",
      title: "Die Verwandlung",
      subtitle: "Franz Kafka",
      artworkUrl: "https://archive.org/download/cover.jpg",
      pageUrl: "https://librivox.org/die-verwandlung-by-franz-kafka/",
      trackCount: 3,
      languageCode: "de",
    });
  });

  it("walks no further once a short page says the catalogue has ended", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: BOOKS }));

    await librivoxAdapter.listCollections({ languageCode: "de" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks for whole seconds and the fields it actually reads", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: BOOKS }));

    await librivoxAdapter.listCollections({ languageCode: "de" });

    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("format=json");
    expect(url).toContain("coverart=1");
    expect(url).toContain("num_sections");
  });

  it("answers with nothing for a language it does not serve", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: BOOKS }));

    await expect(librivoxAdapter.listCollections({ languageCode: "fa" })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a changed catalogue rather than a silent empty shelf", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: { results: [] } }));

    await expect(librivoxAdapter.listCollections({ languageCode: "de" })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

describe("searchCollections", () => {
  it("merges a title query and an author query without duplicating a book", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: BOOKS }));

    const collections = await search("Kafka", {
      languageCode: "de",
    });

    expect(collections.map((collection) => collection.externalId)).toEqual(["1552"]);
  });

  it("asks both fields, because it cannot know which one the listener meant", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: BOOKS }));

    await search("Kafka", { languageCode: "de" });

    const urls = fetchMock.mock.calls.map((call) => String(call[0] ?? ""));
    expect(urls.some((url) => url.includes("title=Kafka"))).toBe(true);
    expect(urls.some((url) => url.includes("author=Kafka"))).toBe(true);
  });

  it("returns nothing for an empty query without a request", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: BOOKS }));

    await expect(search("   ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getCollection", () => {
  it("opens a book directly, without walking the language catalogue", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: BOOKS }));

    const collection = await librivoxAdapter.getCollection?.("1552");

    expect(collection).toMatchObject({ key: "librivox:1552", languageCode: "de" });
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("id=1552");
  });

  it("answers null when the id is gone", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: { books: [] } }));

    await expect(librivoxAdapter.getCollection?.("999")).resolves.toBeNull();
  });
});

describe("getTracks", () => {
  it("orders chapters by their own section number, not by list slot", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: SECTIONS }));

    const tracks = await librivoxAdapter.getTracks("librivox:1552");

    expect(tracks.map((track) => track.externalId)).toEqual(["100", "300", "200"]);
    expect(tracks.map((track) => track.order)).toEqual([1, 2, 3]);
  });

  it("keeps playtime as whole seconds, and leaves an unreadable one at zero", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: SECTIONS }));

    const tracks = await librivoxAdapter.getTracks("librivox:1552");

    expect(tracks[0]?.durationSec).toBe(611);
    expect(tracks[2]?.durationSec).toBe(0);
  });

  it("drops a section with no playable URL", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: SECTIONS }));

    const tracks = await librivoxAdapter.getTracks("librivox:1552");

    expect(tracks.map((track) => track.title)).not.toContain("Ohne Datei");
  });

  it("takes identity from the section id, never the archive URL", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: SECTIONS }));

    const tracks = await librivoxAdapter.getTracks("librivox:1552");

    expect(tracks[0]?.externalId).toBe("100");
    expect(tracks[0]?.streamUrl).not.toContain(tracks[0]?.externalId ?? "");
  });

  it("refuses a key from another source without asking the network", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: SECTIONS }));

    await expect(librivoxAdapter.getTracks("radiobrowser:abc")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a missing section list as not-found", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: { tracks: [] } }));

    await expect(librivoxAdapter.getTracks("librivox:1552")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
