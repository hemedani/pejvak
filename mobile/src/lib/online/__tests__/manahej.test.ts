/**
 * The manahej.ir adapter, against the shapes the real endpoints return.
 *
 * The fixtures below are trimmed copies of genuine responses: the category list
 * from `wp-json/wp/v2/categories` and one entry of the player's `playlist.json`.
 * They are worth having verbatim, because every quirk this adapter exists to
 * handle is in them — `length: false` instead of a duration, a Persian upload
 * path that is not percent-encoded, a signed `mp3` URL, and a `sourcePostID`
 * that is the only stable thing in the whole payload.
 */

import { manahejAdapter, MANAHEJ_SOURCE, __resetForTests } from "@/lib/online/manahej";
import { OnlineSourceError } from "@/lib/online/types";

const CATEGORIES = [
  { id: 188, name: "رادیو مناهج", slug: "radio", parent: 0, count: 0 },
  { id: 190, name: "تاریخ شیعه", slug: "shia-history", parent: 188, count: 29 },
  { id: 195, name: "خلاصه کتاب", slug: "book-summary", parent: 188, count: 41 },
  { id: 191, name: "تاریخ ایران", slug: "iran-history", parent: 188, count: 0 },
  { id: 7, name: "Uncategorised", slug: "uncategorised", parent: 0, count: 3 },
];

const PLAYLIST = {
  playlist_name: "تاریخ شیعه",
  tracks: [
    {
      mp3: "https://dl.manahej.ir/podcast/190/01.mp3?md5=abc&expires=1790000000",
      track_title: "نسخه پیروزی",
      track_artist: "حجت الاسلام عالی",
      album_title: "تاریخ شیعه",
      poster: "https://manahej.ir/wp-content/uploads/2026/03/نسخه-پیروزی.jpg",
      length: false,
      sourcePostID: 7101,
      optional_storelist_cta: [
        { "store-link": "https://manahej.ir/7101/", "cta-class": "sr-share-button" },
      ],
    },
    // No audio: cannot be played, so it must be dropped rather than shown.
    { track_title: "بدون فایل", sourcePostID: 7102 },
    // No id: identity would have to fall back to the URL, which rotates.
    {
      mp3: "https://dl.manahej.ir/podcast/190/03.mp3?md5=x",
      track_title: "بدون شناسه",
    },
    {
      mp3: "https://dl.manahej.ir/podcast/190/04.mp3?md5=def&expires=1790000000",
      track_title: "درس چهارم",
      length: 1830.4,
      sourcePostID: "7104",
    },
  ],
};

/** A `fetch` that answers by URL, so a test can be explicit about each call. */
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

beforeEach(() => {
  __resetForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the source descriptor", () => {
  it("declares Persian, so the registry can find it from a language", () => {
    expect(MANAHEJ_SOURCE.languageCode).toBe("fa");
    expect(MANAHEJ_SOURCE.id).toBe("manahej");
  });
});

describe("listCollections", () => {
  it("returns the radio category's children, busiest first", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: CATEGORIES }));

    const collections = await manahejAdapter.listCollections();

    // 191 has a count of 0 and 7 is not a child of radio, so neither appears.
    expect(collections.map((collection) => collection.externalId)).toEqual(["195", "190"]);
    expect(collections[0]?.title).toBe("خلاصه کتاب");
  });

  it("builds a key, a language and a page address for each", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: CATEGORIES }));

    const [first] = await manahejAdapter.listCollections();

    expect(first).toMatchObject({
      key: "manahej:195",
      sourceId: "manahej",
      externalId: "195",
      languageCode: "fa",
      pageUrl: "https://manahej.ir/category/radio/book-summary/",
    });
  });

  it("asks for the category list once, not twice", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: CATEGORIES }));

    await manahejAdapter.listCollections();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a changed catalogue rather than an empty list", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: [{ id: 7, name: "x", slug: "x", parent: 0, count: 1 }] }));

    await expect(manahejAdapter.listCollections()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("turns an HTTP failure into a typed source error", async () => {
    stubFetch(() => ({ ok: false, status: 503 }));

    const error = await manahejAdapter.listCollections().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OnlineSourceError);
    expect((error as OnlineSourceError).code).toBe("invalid_response");
  });
});

describe("getTracks", () => {
  it("maps the playlist into playable tracks, dropping the unusable ones", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: PLAYLIST }));

    const tracks = await manahejAdapter.getTracks("manahej:190");

    expect(tracks.map((track) => track.externalId)).toEqual(["7101", "7104"]);
  });

  it("numbers the surviving tracks densely from one", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: PLAYLIST }));

    const tracks = await manahejAdapter.getTracks("manahej:190");

    // The dropped entries must not leave a hole at position 2: the position is
    // what the download's file name is built from.
    expect(tracks.map((track) => track.order)).toEqual([1, 2]);
  });

  it("takes identity from the post id, never from the signed URL", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: PLAYLIST }));

    const tracks = await manahejAdapter.getTracks("manahej:190");

    expect(tracks[0]?.externalId).toBe("7101");
    expect(tracks[0]?.streamUrl).not.toContain("7101");
  });

  it("leaves an unreported duration at zero rather than inventing one", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: PLAYLIST }));

    const tracks = await manahejAdapter.getTracks("manahej:190");

    expect(tracks[0]?.durationSec).toBe(0);
    expect(tracks[1]?.durationSec).toBe(1830);
  });

  it("percent-encodes a raw Persian upload path without touching a signed URL", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: PLAYLIST }));

    const tracks = await manahejAdapter.getTracks("manahej:190");

    expect(tracks[0]?.artworkUrl).toContain("%D9%86%D8%B3%D8%AE%D9%87");
    // The signature's own `%`-escapes and `&` separators must survive intact.
    expect(tracks[0]?.streamUrl).toBe(
      "https://dl.manahej.ir/podcast/190/01.mp3?md5=abc&expires=1790000000",
    );
  });

  it("asks the source for the collection in published order", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: PLAYLIST }));

    await manahejAdapter.getTracks("manahej:190");

    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("category=190");
    expect(url).toContain("srp_order=date_ASC");
  });

  it("refuses a key that belongs to another source", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: PLAYLIST }));

    await expect(manahejAdapter.getTracks("other:190")).rejects.toMatchObject({
      code: "not_found",
    });
    // It must not have asked the network about someone else's collection.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a 404 as not-found rather than as a network problem", async () => {
    stubFetch(() => ({ ok: false, status: 404 }));

    await expect(manahejAdapter.getTracks("manahej:999")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("answers with an empty list when the source sends no tracks", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: { playlist_name: "x" } }));

    await expect(manahejAdapter.getTracks("manahej:190")).resolves.toEqual([]);
  });
});
