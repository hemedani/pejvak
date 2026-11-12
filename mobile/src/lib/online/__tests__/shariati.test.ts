/**
 * The drshariati.com adapter.
 *
 * The site is WordPress, and its spoken books are their own post type, so the
 * shelf is JSON and only the episodes are HTML. Three facts shape these tests:
 *
 *   · The episodes are *not* in the REST body — the player comes from a
 *     page-builder block — so the listing and the tracks are read differently.
 *   · Two page layouts exist (`.podcast-item` and a bare `<div>` under
 *     `.audio-list`), and the only invariant is that each `<audio>` has its
 *     title in a `<p>` in the same wrapper.
 *   · The media host answers `301` from `http` to `https`, so the adapter
 *     settles the scheme once instead of on every play.
 */

import { OnlineSourceError } from "@/lib/online/types";
import {
  parseBookTitle,
  parseCatalogue,
  parseEpisodes,
  secureMediaUrl,
  shariatiAdapter,
  SHARIATI_SOURCE,
} from "@/lib/online/shariati";

const BASE = "https://drshariati.com";
const CATALOGUE = `${BASE}/wp-json/wp/v2/audiobooks?per_page=100&_fields=id,slug,link,title,date`;

const CATALOGUE_JSON = [
  { id: 536, slug: "adian1", link: `${BASE}/audiobooks/adian1/`, title: { rendered: "کتاب صوتی تاریخ و شناخت ادیان (جلد اول)" } },
  { id: 534, slug: "abouzar", link: `${BASE}/audiobooks/abouzar/`, title: { rendered: "کتاب صوتی ابوذر" } },
  { id: 532, slug: "zan", link: `${BASE}/audiobooks/zan/`, title: { rendered: "کتاب صوتی زن" } },
];

/** The `.podcast-item` layout. */
function podcastPage(title: string, episodes: [string, string][]): string {
  const items = episodes
    .map(
      ([label, url]) => `
      <div class="podcast-item">
        <p>${label}</p>
        <audio controls preload="none">
          <source src="${url}" type="audio/mpeg">
        </audio>
      </div>`,
    )
    .join("");
  return `<html><body><h1>${title}</h1><div class="podcast-list">${items}</div></body></html>`;
}

/** The `.audio-list` layout: a bare `<div>` per episode. */
function audioListPage(title: string, episodes: [string, string][]): string {
  const items = episodes
    .map(
      ([label, url]) => `
      <div>
        <p>${label}</p>
        <audio controls preload="none">
          <source src="${url}" type="audio/mpeg">
        </audio>
      </div>`,
    )
    .join("");
  return `<html><body><h1>${title}</h1><div class="audio-list">${items}</div></body></html>`;
}

const MEDIA = "http://dl.drshariati.com/audiobooks/adian1";

const ADIAN = podcastPage("کتاب صوتی تاریخ و شناخت ادیان (جلد اول)", [
  ["قسمت اول", `${MEDIA}/adian1_01.mp3`],
  ["قسمت دوم", `${MEDIA}/adian2_01.mp3`],
  ["قسمت سوم", `${MEDIA}/adian3_01.mp3`],
]);

const ZAN = audioListPage("کتاب صوتی زن", [
  ["قسمت ۱", "http://dl.drshariati.com/audiobooks/zan/zan1_01.mp3"],
  ["قسمت ۲", "http://dl.drshariati.com/audiobooks/zan/zan2_01.mp3"],
]);

type Reply = { ok: boolean; status: number; json?: unknown; text?: string };

function jsonReply(value: unknown): Reply {
  return { ok: true, status: 200, json: value };
}

function stubFetch(handler: (url: string) => Reply) {
  const mock = jest.fn(async (input: unknown) => {
    const reply = handler(String(input));
    return {
      ok: reply.ok,
      status: reply.status,
      json: async () => reply.json,
      text: async () => reply.text ?? "",
    };
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function shelfFetch(overrides: Record<string, Reply> = {}) {
  return stubFetch((url) => {
    const override = overrides[url];
    if (override) {
      return override;
    }
    if (url === CATALOGUE) return jsonReply(CATALOGUE_JSON);
    if (url === `${BASE}/audiobooks/adian1/`) return { ok: true, status: 200, text: ADIAN };
    if (url === `${BASE}/audiobooks/zan/`) return { ok: true, status: 200, text: ZAN };
    if (url === `${BASE}/audiobooks/abouzar/`) {
      return {
        ok: true,
        status: 200,
        text: podcastPage("کتاب صوتی ابوذر", [
          ["قسمت اول", "http://dl.drshariati.com/audiobooks/abouzar/abouzar1_01.mp3"],
        ]),
      };
    }
    return { ok: false, status: 404 };
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the source descriptor", () => {
  it("is a finite Persian source", () => {
    expect(SHARIATI_SOURCE.id).toBe("shariati");
    expect(SHARIATI_SOURCE.kind).toBe("shariati");
    expect(SHARIATI_SOURCE.languageCode).toBe("fa");
    expect(SHARIATI_SOURCE.live).toBeUndefined();
  });
});

describe("secureMediaUrl", () => {
  it("settles the media host on TLS, because it redirects there anyway", () => {
    expect(secureMediaUrl("http://dl.drshariati.com/audiobooks/zan/zan1_01.mp3")).toBe(
      "https://dl.drshariati.com/audiobooks/zan/zan1_01.mp3",
    );
  });

  it("leaves a file that is already secure alone", () => {
    const url = "https://dl.drshariati.com/audiobooks/zan/zan1_01.mp3";

    expect(secureMediaUrl(url)).toBe(url);
  });

  it("leaves another host's scheme alone", () => {
    // Only the media host is known to upgrade; rewriting a stranger's URL
    // could turn a working plain-HTTP stream into a broken one.
    expect(secureMediaUrl("http://example.com/a.mp3")).toBe("http://example.com/a.mp3");
  });
});

describe("parseEpisodes", () => {
  it("reads the titled players of the .podcast-item layout", () => {
    const episodes = parseEpisodes(ADIAN);

    expect(episodes).toEqual([
      { title: "قسمت اول", streamUrl: `${MEDIA.replace("http:", "https:")}/adian1_01.mp3` },
      { title: "قسمت دوم", streamUrl: `${MEDIA.replace("http:", "https:")}/adian2_01.mp3` },
      { title: "قسمت سوم", streamUrl: `${MEDIA.replace("http:", "https:")}/adian3_01.mp3` },
    ]);
  });

  it("reads the .audio-list layout the same way", () => {
    // The wrapper class differs between books; keying on the player rather than
    // the class is what makes one parser serve both.
    const episodes = parseEpisodes(ZAN);

    expect(episodes.map((episode) => episode.title)).toEqual(["قسمت ۱", "قسمت ۲"]);
    expect(episodes[0]?.streamUrl).toBe(
      "https://dl.drshariati.com/audiobooks/zan/zan1_01.mp3",
    );
  });

  it("keeps the book's own order, which is the order to listen in", () => {
    const episodes = parseEpisodes(ADIAN);

    expect(episodes.map((episode) => episode.streamUrl)).toEqual([
      "https://dl.drshariati.com/audiobooks/adian1/adian1_01.mp3",
      "https://dl.drshariati.com/audiobooks/adian1/adian2_01.mp3",
      "https://dl.drshariati.com/audiobooks/adian1/adian3_01.mp3",
    ]);
  });

  it("answers a null title for a player with no label", () => {
    const html = `<div><audio><source src="http://dl.drshariati.com/a/b.mp3"></audio></div>`;

    expect(parseEpisodes(html)).toEqual([
      { title: null, streamUrl: "https://dl.drshariati.com/a/b.mp3" },
    ]);
  });

  it("keeps one entry when a player is repeated", () => {
    const html = `${ADIAN}${ADIAN}`;

    expect(parseEpisodes(html)).toHaveLength(3);
  });

  it("ignores a player whose source is not an MP3", () => {
    const html = `<div><audio><source src="https://dl.drshariati.com/a/b.m4b"></audio></div>`;

    expect(parseEpisodes(html)).toEqual([]);
  });

  it("answers nothing for a page with no player", () => {
    expect(parseEpisodes("<html><body><p>به زودی</p></body></html>")).toEqual([]);
  });
});

describe("parseBookTitle", () => {
  it("reads the book's heading", () => {
    expect(parseBookTitle(ADIAN)).toBe("کتاب صوتی تاریخ و شناخت ادیان (جلد اول)");
  });

  it("answers null for a page with no heading", () => {
    expect(parseBookTitle("<div>خطا</div>")).toBeNull();
  });
});

describe("parseCatalogue", () => {
  it("reads the slug and the rendered title", () => {
    expect(parseCatalogue(CATALOGUE_JSON)[0]).toEqual({
      slug: "adian1",
      title: "کتاب صوتی تاریخ و شناخت ادیان (جلد اول)",
    });
  });

  it("drops an entry whose slug is not a URL segment", () => {
    const value = [{ slug: "not a slug!", title: { rendered: "x" } }, ...CATALOGUE_JSON];

    expect(parseCatalogue(value).map((book) => book.slug)).toEqual(["adian1", "abouzar", "zan"]);
  });

  it("drops an entry with no title, because a card cannot be nameless", () => {
    const value = [...CATALOGUE_JSON, { slug: "nameless", title: { rendered: "" } }];

    expect(parseCatalogue(value).map((book) => book.slug)).not.toContain("nameless");
  });

  it("keeps one entry when the catalogue repeats a book", () => {
    const value = [...CATALOGUE_JSON, CATALOGUE_JSON[0]];

    expect(parseCatalogue(value).filter((book) => book.slug === "adian1")).toHaveLength(1);
  });

  it("refuses an error object dressed as a catalogue", () => {
    // A site with its REST API restricted answers a 200 with an error body.
    expect(() => parseCatalogue({ code: "rest_cannot_read" })).toThrow(OnlineSourceError);
  });
});

describe("listCollections", () => {
  it("offers every spoken book with the size of its reading", async () => {
    shelfFetch();

    const collections = await shariatiAdapter.listCollections();

    expect(collections.map((collection) => collection.key)).toEqual([
      "shariati:adian1",
      "shariati:abouzar",
      "shariati:zan",
    ]);
    expect(collections.map((collection) => collection.trackCount)).toEqual([3, 1, 2]);
  });

  it("describes a book the way the app expects to open it", async () => {
    shelfFetch();

    const collections = await shariatiAdapter.listCollections();

    expect(collections[0]).toMatchObject({
      sourceId: "shariati",
      externalId: "adian1",
      title: "کتاب صوتی تاریخ و شناخت ادیان (جلد اول)",
      subtitle: null,
      artworkUrl: null,
      languageCode: "fa",
      pageUrl: `${BASE}/audiobooks/adian1/`,
    });
  });

  it("reports an unreadable book as a size not yet known, and keeps the shelf", async () => {
    // Zero is the app's "not known yet", so one broken book cannot blank the
    // other three.
    shelfFetch({ [`${BASE}/audiobooks/zan/`]: { ok: false, status: 500 } });

    const collections = await shariatiAdapter.listCollections();

    expect(collections).toHaveLength(3);
    expect(collections[2]).toMatchObject({ externalId: "zan", trackCount: 0 });
  });

  it("fails rather than offering nothing when the catalogue itself is gone", async () => {
    shelfFetch({ [CATALOGUE]: jsonReply([]) });

    await expect(shariatiAdapter.listCollections()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("reports an unreachable catalogue as a source error", async () => {
    shelfFetch({ [CATALOGUE]: { ok: false, status: 500 } });

    await expect(shariatiAdapter.listCollections()).rejects.toBeInstanceOf(OnlineSourceError);
  });
});

describe("getCollection", () => {
  it("reads the book it was asked for", async () => {
    shelfFetch();

    const collection = await shariatiAdapter.getCollection?.("zan");

    expect(collection).toMatchObject({
      key: "shariati:zan",
      externalId: "zan",
      title: "کتاب صوتی زن",
      trackCount: 2,
    });
  });

  it("answers null for a book with no player on it", async () => {
    shelfFetch({
      [`${BASE}/audiobooks/zan/`]: {
        ok: true,
        status: 200,
        text: "<html><body><h1>کتاب صوتی زن</h1></body></html>",
      },
    });

    await expect(shariatiAdapter.getCollection?.("zan")).resolves.toBeNull();
  });

  it("answers null for a book that is gone", async () => {
    shelfFetch({ [`${BASE}/audiobooks/zan/`]: { ok: false, status: 404 } });

    await expect(shariatiAdapter.getCollection?.("zan")).resolves.toBeNull();
  });

  it("does not touch the network for an id that is not a slug", async () => {
    const fetchMock = shelfFetch();

    await expect(shariatiAdapter.getCollection?.("not a slug")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getTracks", () => {
  it("opens the book in its own order, titled and numbered", async () => {
    shelfFetch();

    const tracks = await shariatiAdapter.getTracks("shariati:adian1");

    expect(tracks.map((track) => track.order)).toEqual([1, 2, 3]);
    expect(tracks[0]).toEqual({
      externalId: "adian1#1",
      title: "قسمت اول",
      artist: null,
      albumTitle: "کتاب صوتی تاریخ و شناخت ادیان (جلد اول)",
      artworkUrl: null,
      streamUrl: "https://dl.drshariati.com/audiobooks/adian1/adian1_01.mp3",
      durationSec: 0,
      order: 1,
      pageUrl: `${BASE}/audiobooks/adian1/`,
    });
  });

  it("keeps the book's title on every episode, so History keeps the grouping", async () => {
    shelfFetch();

    const tracks = await shariatiAdapter.getTracks("shariati:zan");

    expect(tracks.every((track) => track.albumTitle === "کتاب صوتی زن")).toBe(true);
  });

  it("leaves the duration for the player to ask, because the page states none", async () => {
    shelfFetch();

    const tracks = await shariatiAdapter.getTracks("shariati:adian1");

    expect(tracks.every((track) => track.durationSec === 0)).toBe(true);
  });

  it("names an unlabelled episode by its place rather than by nothing", async () => {
    shelfFetch({
      [`${BASE}/audiobooks/zan/`]: {
        ok: true,
        status: 200,
        text: `<h1>کتاب صوتی زن</h1><div><audio><source src="http://dl.drshariati.com/zan/a.mp3"></audio></div>`,
      },
    });

    const tracks = await shariatiAdapter.getTracks("shariati:zan");

    expect(tracks[0]?.title).toBe("قسمت 1");
  });

  it("reports a book with no player as gone", async () => {
    shelfFetch({
      [`${BASE}/audiobooks/zan/`]: {
        ok: true,
        status: 200,
        text: "<html><body><h1>کتاب صوتی زن</h1></body></html>",
      },
    });

    await expect(shariatiAdapter.getTracks("shariati:zan")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses a key that belongs to another source", async () => {
    const fetchMock = shelfFetch();

    await expect(shariatiAdapter.getTracks("esra:tafsir")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a key whose id is not a slug", async () => {
    shelfFetch();

    await expect(shariatiAdapter.getTracks("shariati:../etc")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
