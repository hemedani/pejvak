/**
 * The aminikhaah.ir podcast adapter.
 *
 * Podcasts have no JSON listing, so the episode list is read from
 * `/podcast?page=N` — twelve cards per page, each carrying the روضه series under
 * the title. Each episode is one collection with one track, and the audio is
 * read from `/api/songs/<id>`.
 *
 * Three facts shape these tests:
 *
 *   · The listing paginates, so a browse must read every page rather than the
 *     first twelve episodes.
 *   · A card links to its episode twice (cover and title); the two anchors must
 *     merge into one row.
 *   · A lecture song opened through this source is not a podcast and must be
 *     refused, or the same audio would get a second identity.
 */

import { OnlineSourceError } from "@/lib/online/types";
import {
  aminikhaahPodcastsAdapter,
  AMINIKHAAH_PODCASTS_SOURCE,
} from "@/lib/online/aminikhaahPodcasts";

const BASE = "https://aminikhaah.ir";

function podcastCard(
  id: number,
  title: string,
  series: string | null,
  cover = `${id}.webp`,
): string {
  return `
    <div class="col">
      <div class="w-[105px] ml-3">
        <a href="${BASE}/podcast/${id}">
          <img src="${BASE}/imgproxy/${cover}" alt="${title}">
        </a>
        <div class="card-body">
          <a href="${BASE}/podcast/${id}">
            <h5 class="am-song-card-title">${title}</h5>
          </a>
          ${series === null ? "" : `<p class="am-song-card-text">${series}</p>`}
        </div>
      </div>
    </div>
  `;
}

const PAGE_1 = `
  <html>
    <body>
      <div id="main-content">
        <div class="grid">
          ${podcastCard(5659, "روایتی از پیامبر (ص)", "روضه امام حسین (ع)")}
          ${podcastCard(5658, "ورود به شام", "روضه حضرت زینب (س)")}
          <div class="col">
            <div class="w-[105px] ml-3">
              <a href="${BASE}/podcast/5657">
                <img src="${BASE}/imgproxy/5657.webp" alt="شعر امام حسین (ع)">
              </a>
              <div class="card-body">
                <a href="${BASE}/podcast/5657"></a>
                <p class="am-song-card-text">روضه حضرت سکینه (س)</p>
              </div>
            </div>
          </div>
          <div class="col">
            <a href="${BASE}/podcast/5656"></a>
          </div>
        </div>
      </div>
      <a href="${BASE}/podcast?page=2">2</a>
    </body>
  </html>
`;

const PAGE_2 = `
  <html>
    <body>
      <div id="main-content">
        <div class="grid">
          ${podcastCard(5655, "گریه", "روضه امام زین العابدین (ع)")}
          ${podcastCard(5659, "Duplicate title", "Other series")}
        </div>
      </div>
    </body>
  </html>
`;

const PODCAST_SONG = {
  id: 5659,
  title: "روایتی از پیامبر (ص)",
  file_path:
    "https://dl.aminikhaah.ir/sound/Roze/R05_Ep080_Imam-Hossein_Revayate-Peyghambar.mp3",
  duration: "00:12:04",
  album_id: null,
  category_id: 178,
  content_type: "podcast",
  is_visible: true,
  deleted_at: null,
  image: null,
  category: {
    id: 178,
    name: "روضه امام حسین (ع)",
    image_url: `${BASE}/imgproxy/category.webp`,
  },
};

type Reply = { ok: boolean; status: number; json?: unknown; text?: string };

function jsonReply(value: unknown, status = 200): Reply {
  return { ok: true, status, json: value };
}

function textReply(value: string, status = 200): Reply {
  return { ok: true, status, text: value };
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

function listingFetch(overrides: Record<string, Reply> = {}) {
  return stubFetch((url) => {
    const override = overrides[url];
    if (override) {
      return override;
    }
    if (url === `${BASE}/podcast`) return textReply(PAGE_1);
    if (url === `${BASE}/podcast?page=2`) return textReply(PAGE_2);
    if (url === `${BASE}/api/songs/5659`) return jsonReply(PODCAST_SONG);
    return { ok: false, status: 404 };
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the source descriptor", () => {
  it("is a separate Persian podcast source beside the lecture albums", () => {
    expect(AMINIKHAAH_PODCASTS_SOURCE.id).toBe("aminikhaah-podcasts");
    expect(AMINIKHAAH_PODCASTS_SOURCE.kind).toBe("aminikhaahpodcasts");
    expect(AMINIKHAAH_PODCASTS_SOURCE.languageCode).toBe("fa");
    expect(AMINIKHAAH_PODCASTS_SOURCE.live).toBeUndefined();
  });
});

describe("listCollections", () => {
  it("pages through the listing and makes one collection per episode", async () => {
    listingFetch();

    const collections = await aminikhaahPodcastsAdapter.listCollections();

    expect(collections.map((collection) => collection.externalId)).toEqual([
      "5659",
      "5658",
      "5657",
      "5655",
    ]);
    expect(collections[0]).toMatchObject({
      key: "aminikhaah-podcasts:5659",
      sourceId: "aminikhaah-podcasts",
      title: "روایتی از پیامبر (ص)",
      subtitle: "روضه امام حسین (ع)",
      artworkUrl: `${BASE}/imgproxy/5659.webp`,
      trackCount: 1,
      languageCode: "fa",
      pageUrl: `${BASE}/podcast/5659`,
    });
  });

  it("takes the title from the cover when the card has no heading", async () => {
    listingFetch();

    const collections = await aminikhaahPodcastsAdapter.listCollections();

    expect(collections.find((collection) => collection.externalId === "5657")).toMatchObject({
      title: "شعر امام حسین (ع)",
      subtitle: "روضه حضرت سکینه (س)",
    });
  });

  it("drops a card with no title and keeps an episode once across pages", async () => {
    listingFetch();

    const collections = await aminikhaahPodcastsAdapter.listCollections();

    expect(collections.map((collection) => collection.externalId)).not.toContain("5656");
    const episode = collections.filter((collection) => collection.externalId === "5659");
    expect(episode).toHaveLength(1);
    expect(episode[0]?.title).toBe("روایتی از پیامبر (ص)");
    expect(episode[0]?.subtitle).toBe("روضه امام حسین (ع)");
  });

  it("fails when the first listing page no longer carries cards", async () => {
    listingFetch({ [`${BASE}/podcast`]: textReply("<html><body></body></html>") });

    await expect(aminikhaahPodcastsAdapter.listCollections()).rejects.toBeInstanceOf(
      OnlineSourceError,
    );
  });

  it("fails rather than returning half a listing when a page fails", async () => {
    listingFetch({ [`${BASE}/podcast?page=2`]: { ok: false, status: 500 } });

    await expect(aminikhaahPodcastsAdapter.listCollections()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects an absurd page count instead of requesting it", async () => {
    const absurd = `
      <div id="main-content">${podcastCard(1, "One", "Series")}</div>
      <a href="${BASE}/podcast?page=100000">last</a>
    `;
    listingFetch({ [`${BASE}/podcast`]: textReply(absurd) });

    await expect(aminikhaahPodcastsAdapter.listCollections()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

describe("getCollection", () => {
  it("reads one episode, its series and its cover", async () => {
    listingFetch();

    const collection = await aminikhaahPodcastsAdapter.getCollection?.("5659");

    expect(collection).toMatchObject({
      key: "aminikhaah-podcasts:5659",
      sourceId: "aminikhaah-podcasts",
      externalId: "5659",
      title: "روایتی از پیامبر (ص)",
      subtitle: "روضه امام حسین (ع)",
      artworkUrl: `${BASE}/imgproxy/category.webp`,
      trackCount: 1,
      languageCode: "fa",
      pageUrl: `${BASE}/podcast/5659`,
    });
  });

  it("answers null when the episode is gone", async () => {
    listingFetch({ [`${BASE}/api/songs/5659`]: { ok: false, status: 404 } });

    await expect(aminikhaahPodcastsAdapter.getCollection?.("5659")).resolves.toBeNull();
  });

  it("refuses a lecture song that is not a podcast", async () => {
    listingFetch({
      [`${BASE}/api/songs/5659`]: jsonReply({
        ...PODCAST_SONG,
        album_id: 27,
        content_type: "lecture",
      }),
    });

    await expect(aminikhaahPodcastsAdapter.getCollection?.("5659")).resolves.toBeNull();
  });

  it("does not touch the network for a non-numeric id", async () => {
    const fetchMock = listingFetch();

    await expect(aminikhaahPodcastsAdapter.getCollection?.("not-an-episode")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getTracks", () => {
  it("returns the episode with its direct audio, duration and series", async () => {
    listingFetch();

    const tracks = await aminikhaahPodcastsAdapter.getTracks("aminikhaah-podcasts:5659");

    expect(tracks).toEqual([
      {
        externalId: "5659",
        title: "روایتی از پیامبر (ص)",
        artist: null,
        albumTitle: "روضه امام حسین (ع)",
        artworkUrl: `${BASE}/imgproxy/category.webp`,
        streamUrl:
          "https://dl.aminikhaah.ir/sound/Roze/R05_Ep080_Imam-Hossein_Revayate-Peyghambar.mp3",
        durationSec: 724,
        order: 1,
        pageUrl: `${BASE}/podcast/5659`,
      },
    ]);
  });

  it("reports an episode that is gone as a source error", async () => {
    listingFetch({ [`${BASE}/api/songs/5659`]: { ok: false, status: 404 } });

    await expect(
      aminikhaahPodcastsAdapter.getTracks("aminikhaah-podcasts:5659"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a lecture song that is not a podcast", async () => {
    listingFetch({
      [`${BASE}/api/songs/5659`]: jsonReply({
        ...PODCAST_SONG,
        album_id: 27,
        content_type: "lecture",
      }),
    });

    await expect(
      aminikhaahPodcastsAdapter.getTracks("aminikhaah-podcasts:5659"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses an episode with no playable file", async () => {
    listingFetch({
      [`${BASE}/api/songs/5659`]: jsonReply({ ...PODCAST_SONG, file_path: null }),
    });

    await expect(
      aminikhaahPodcastsAdapter.getTracks("aminikhaah-podcasts:5659"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a key that belongs to another source", async () => {
    const fetchMock = listingFetch();

    await expect(
      aminikhaahPodcastsAdapter.getTracks("aminikhaah:5659"),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
