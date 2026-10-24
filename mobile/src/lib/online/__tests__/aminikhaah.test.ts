/**
 * The aminikhaah.ir adapter.
 *
 * The site's player is driven by a JSON API, so the catalogue and track lists
 * are read from it. Search has no endpoint and is the one HTML page read. Two
 * facts shape these tests:
 *
 *   · `/api/albums` is paginated, and hidden, deleted and nameless albums must
 *     never reach the shelf.
 *   · `/api/albums/<id>` carries every session, so one response answers both
 *     the collection and its tracks.
 *
 * Durations arrive as `MM:SS` or `HH:MM:SS` and are already whole seconds; the
 * song id is the stable identity — the URL is a cache of where the bytes are
 * today.
 */

import { OnlineSourceError } from "@/lib/online/types";
import {
  aminikhaahAdapter,
  AMINIKHAAH_SOURCE,
  parseAminikhaahDuration,
} from "@/lib/online/aminikhaah";

const BASE = "https://aminikhaah.ir";

const CATEGORIES = [
  { id: 136, name: "اخلاق", deleted_at: null },
  { id: 141, name: "اهل بیت (ع)", deleted_at: null },
];

const PAGE_1 = {
  current_page: 1,
  last_page: 2,
  data: [
    {
      id: 27,
      name: "Album 27",
      image_url: `${BASE}/imgproxy/27.webp`,
      category_id: 136,
      is_visible: true,
      deleted_at: null,
    },
    {
      id: 28,
      name: "Album 28",
      image_url: null,
      category_id: 136,
      is_visible: true,
      deleted_at: null,
    },
    {
      id: 29,
      name: "Hidden",
      image_url: null,
      category_id: 136,
      is_visible: false,
      deleted_at: null,
    },
    {
      id: 30,
      name: "Deleted",
      image_url: null,
      category_id: 136,
      is_visible: true,
      deleted_at: "2026-01-01T00:00:00.000000Z",
    },
    {
      id: 31,
      name: null,
      image_url: null,
      category_id: 136,
      is_visible: true,
      deleted_at: null,
    },
  ],
};

const PAGE_2 = {
  current_page: 2,
  last_page: 2,
  data: [
    {
      id: 6,
      name: "Album 6",
      image_url: `${BASE}/imgproxy/6.webp`,
      category_id: 141,
      is_visible: true,
      deleted_at: null,
    },
    {
      id: 27,
      name: "Album 27 (duplicate)",
      image_url: null,
      category_id: 141,
      is_visible: true,
      deleted_at: null,
    },
  ],
};

const ALBUM_DETAIL = {
  id: 27,
  name: "Album 27",
  image_url: `${BASE}/imgproxy/cover.webp`,
  category_id: 136,
  is_visible: true,
  deleted_at: null,
  songs: [
    {
      id: 5567,
      title: "جلسه یک",
      file_path: "https://dl.aminikhaah.ir/sound/27/01.mp3",
      duration: "00:27:51",
      is_visible: true,
      deleted_at: null,
    },
    {
      id: 5568,
      title: "جلسه دو",
      file_path: "https://dl.aminikhaah.ir/sound/27/02.mp3",
      duration: "01:02:03",
      is_visible: true,
      deleted_at: null,
    },
    {
      id: 5569,
      title: "بدون فایل",
      file_path: null,
      duration: "00:10:00",
      is_visible: true,
      deleted_at: null,
    },
    {
      id: 5570,
      title: null,
      file_path: "https://dl.aminikhaah.ir/sound/27/04.mp3",
      duration: "00:11:00",
      is_visible: true,
      deleted_at: null,
    },
    {
      id: 5571,
      title: "پنهان",
      file_path: "https://dl.aminikhaah.ir/sound/27/05.mp3",
      duration: "00:12:00",
      is_visible: false,
      deleted_at: null,
    },
  ],
};

const CATEGORY_136 = { category: { id: 136, name: "اخلاق", deleted_at: null } };

function albumCard(id: number, title: string, cover = `${id}.webp`): string {
  return `
    <div class="col">
      <div class="card">
        <a href="${BASE}/album/${id}">
          <div><img src="${BASE}/imgproxy/${cover}" alt="${title}"></div>
        </a>
        <div>
          <a href="${BASE}/album/${id}"><h5>${title}</h5></a>
          <p></p>
        </div>
      </div>
    </div>
  `;
}

const SEARCH_HTML = `
  <div id="main-content">
    <div class="grid">
      ${albumCard(491, "Ziyarat")}
      ${albumCard(491, "Ziyarat")}
    </div>
    <div class="grid">
      <div class="col">
        <a href="${BASE}/song/5657"><h5>Song result</h5></a>
      </div>
    </div>
  </div>
`;

type Reply = { ok: boolean; status: number; json?: unknown; text?: string };

function jsonReply(value: unknown, status = 200): Reply {
  return { ok: true, status, json: value };
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

function catalogueFetch(overrides: Record<string, Reply> = {}) {
  return stubFetch((url) => {
    const override = overrides[url];
    if (override) {
      return override;
    }
    if (url === `${BASE}/api/categories`) return jsonReply(CATEGORIES);
    if (url === `${BASE}/api/albums?page=1`) return jsonReply(PAGE_1);
    if (url === `${BASE}/api/albums?page=2`) return jsonReply(PAGE_2);
    if (url === `${BASE}/api/albums/27`) return jsonReply(ALBUM_DETAIL);
    if (url === `${BASE}/api/categories/136`) return jsonReply(CATEGORY_136);
    return { ok: false, status: 404 };
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("parseAminikhaahDuration", () => {
  it("reads both clock shapes as whole seconds", () => {
    expect(parseAminikhaahDuration("00:27:51")).toBe(1671);
    expect(parseAminikhaahDuration("27:51")).toBe(1671);
  });

  it("asks the player rather than guessing when there is no readable time", () => {
    expect(parseAminikhaahDuration(null)).toBe(0);
    expect(parseAminikhaahDuration("")).toBe(0);
    expect(parseAminikhaahDuration("زمان")).toBe(0);
    expect(parseAminikhaahDuration("00:00")).toBe(0);
  });
});

describe("the source descriptor", () => {
  it("is a finite Persian lecture source", () => {
    expect(AMINIKHAAH_SOURCE.id).toBe("aminikhaah");
    expect(AMINIKHAAH_SOURCE.kind).toBe("aminikhaah");
    expect(AMINIKHAAH_SOURCE.languageCode).toBe("fa");
    expect(AMINIKHAAH_SOURCE.live).toBeUndefined();
  });
});

describe("listCollections", () => {
  it("pages through the catalogue with the topic it was filed under", async () => {
    catalogueFetch();

    const collections = await aminikhaahAdapter.listCollections();

    expect(collections.map((collection) => collection.externalId)).toEqual(["27", "28", "6"]);
    expect(collections[0]).toMatchObject({
      key: "aminikhaah:27",
      sourceId: "aminikhaah",
      title: "Album 27",
      subtitle: "اخلاق",
      artworkUrl: `${BASE}/imgproxy/27.webp`,
      trackCount: 0,
      languageCode: "fa",
      pageUrl: `${BASE}/album/27`,
    });
    expect(collections[2]).toMatchObject({ title: "Album 6", subtitle: "اهل بیت (ع)" });
  });

  it("keeps the pages in order and an album once when two pages repeat it", async () => {
    catalogueFetch();

    const collections = await aminikhaahAdapter.listCollections();

    const album27 = collections.filter((collection) => collection.externalId === "27");
    expect(album27).toHaveLength(1);
    expect(album27[0]?.title).toBe("Album 27");
    expect(collections.map((collection) => collection.subtitle)).toEqual([
      "اخلاق",
      "اخلاق",
      "اهل بیت (ع)",
    ]);
  });

  it("drops an album that is hidden, deleted or nameless", async () => {
    catalogueFetch();

    const collections = await aminikhaahAdapter.listCollections();

    const ids = collections.map((collection) => collection.externalId);
    expect(ids).not.toContain("29");
    expect(ids).not.toContain("30");
    expect(ids).not.toContain("31");
  });

  it("names a child topic that the root category list omits", async () => {
    catalogueFetch({
      [`${BASE}/api/albums?page=1`]: jsonReply({
        current_page: 1,
        last_page: 1,
        data: [
          {
            id: 40,
            name: "Child album",
            image_url: null,
            category_id: 153,
            is_visible: true,
            deleted_at: null,
          },
        ],
      }),
      [`${BASE}/api/categories/153`]: jsonReply({
        category: { id: 153, name: "امام حسین علیه السلام", parent_id: 141 },
      }),
    });

    const collections = await aminikhaahAdapter.listCollections();

    expect(collections[0]?.subtitle).toBe("امام حسین علیه السلام");
  });

  it("keeps the album when its child topic cannot be named", async () => {
    catalogueFetch({
      [`${BASE}/api/albums?page=1`]: jsonReply({
        current_page: 1,
        last_page: 1,
        data: [
          {
            id: 40,
            name: "Child album",
            image_url: null,
            category_id: 153,
            is_visible: true,
            deleted_at: null,
          },
        ],
      }),
      [`${BASE}/api/categories/153`]: { ok: false, status: 500 },
    });

    const collections = await aminikhaahAdapter.listCollections();

    expect(collections).toHaveLength(1);
    expect(collections[0]?.subtitle).toBeNull();
  });

  it("fails rather than returning half a catalogue when a page fails", async () => {
    catalogueFetch({ [`${BASE}/api/albums?page=2`]: { ok: false, status: 500 } });

    await expect(aminikhaahAdapter.listCollections()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects a catalogue that no longer has the shape of a paginator", async () => {
    catalogueFetch({
      [`${BASE}/api/albums?page=1`]: jsonReply({ data: "not a list", last_page: 2 }),
    });

    await expect(aminikhaahAdapter.listCollections()).rejects.toBeInstanceOf(OnlineSourceError);
  });

  it("rejects an absurd page count instead of requesting it", async () => {
    catalogueFetch({
      [`${BASE}/api/albums?page=1`]: jsonReply({ data: [], last_page: 100_000 }),
    });

    await expect(aminikhaahAdapter.listCollections()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects a category list that is not a list", async () => {
    catalogueFetch({ [`${BASE}/api/categories`]: jsonReply({}) });

    await expect(aminikhaahAdapter.listCollections()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

describe("getCollection", () => {
  it("reads the album, its topic and its playable size", async () => {
    catalogueFetch();

    const collection = await aminikhaahAdapter.getCollection?.("27");

    expect(collection).toMatchObject({
      key: "aminikhaah:27",
      externalId: "27",
      title: "Album 27",
      subtitle: "اخلاق",
      artworkUrl: `${BASE}/imgproxy/cover.webp`,
      trackCount: 2,
      languageCode: "fa",
      pageUrl: `${BASE}/album/27`,
    });
  });

  it("answers null when the album is gone", async () => {
    catalogueFetch({ [`${BASE}/api/albums/27`]: { ok: false, status: 404 } });

    await expect(aminikhaahAdapter.getCollection?.("27")).resolves.toBeNull();
  });

  it("keeps the album readable when its topic cannot be named", async () => {
    catalogueFetch({ [`${BASE}/api/categories/136`]: { ok: false, status: 500 } });

    const collection = await aminikhaahAdapter.getCollection?.("27");

    expect(collection?.subtitle).toBeNull();
    expect(collection?.trackCount).toBe(2);
  });

  it("does not touch the network for a non-numeric id", async () => {
    const fetchMock = catalogueFetch();

    await expect(aminikhaahAdapter.getCollection?.("not-an-album")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getTracks", () => {
  it("reads every playable session with its direct audio and duration", async () => {
    catalogueFetch();

    const tracks = await aminikhaahAdapter.getTracks("aminikhaah:27");

    expect(tracks).toEqual([
      {
        externalId: "5567",
        title: "جلسه یک",
        artist: null,
        albumTitle: "Album 27",
        artworkUrl: `${BASE}/imgproxy/cover.webp`,
        streamUrl: "https://dl.aminikhaah.ir/sound/27/01.mp3",
        durationSec: 1671,
        order: 1,
        pageUrl: `${BASE}/song/5567`,
      },
      {
        externalId: "5568",
        title: "جلسه دو",
        artist: null,
        albumTitle: "Album 27",
        artworkUrl: `${BASE}/imgproxy/cover.webp`,
        streamUrl: "https://dl.aminikhaah.ir/sound/27/02.mp3",
        durationSec: 3723,
        order: 2,
        pageUrl: `${BASE}/song/5568`,
      },
    ]);
  });

  it("drops a session that cannot be played, named, or is hidden", async () => {
    catalogueFetch();

    const tracks = await aminikhaahAdapter.getTracks("aminikhaah:27");

    const ids = tracks.map((track) => track.externalId);
    expect(ids).not.toContain("5569");
    expect(ids).not.toContain("5570");
    expect(ids).not.toContain("5571");
  });

  it("reports an album that is gone as a source error", async () => {
    catalogueFetch({ [`${BASE}/api/albums/27`]: { ok: false, status: 404 } });

    await expect(aminikhaahAdapter.getTracks("aminikhaah:27")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses a key that belongs to another source", async () => {
    const fetchMock = catalogueFetch();

    await expect(aminikhaahAdapter.getTracks("manahej:27")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a key whose id is not numeric", async () => {
    catalogueFetch();

    await expect(aminikhaahAdapter.getTracks("aminikhaah:album")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("searchCollections", () => {
  function search(query: string) {
    if (!aminikhaahAdapter.searchCollections) {
      throw new Error("aminikhaah does not implement search");
    }
    return aminikhaahAdapter.searchCollections(query);
  }

  it("asks the site's own search and returns albums only", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, text: SEARCH_HTML }));

    const collections = await search("امام");

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("q")).toBe("امام");
    expect(collections.map((collection) => collection.externalId)).toEqual(["491"]);
    expect(collections[0]).toMatchObject({ title: "Ziyarat", subtitle: null, trackCount: 0 });
  });

  it("does not touch the network for a blank query", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, text: SEARCH_HTML }));

    await expect(search("   ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
