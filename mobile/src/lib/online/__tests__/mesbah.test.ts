/**
 * The mesbahyazdi.ir adapter.
 *
 * The institute's site is Drupal with no JSON API, so its "spoken works"
 * browser and every work's own page are HTML. Three facts shape these tests:
 *
 *   · The listing carries everything a card needs — title, series, subtitle —
 *     and the work's page carries the recording, so a collection is one work
 *     with one track and opening it costs one request.
 *   · The listing is paginated and its pager counts from **zero**, so `?page=0`
 *     is the second page a listener sees.
 *   · Lectures, Q&A sessions and interviews are listed together and only some
 *     have a recording, so a card without an MP3 is dropped rather than shown
 *     as an unplayable row.
 */

import { OnlineSourceError } from "@/lib/online/types";
import {
  lastPageFrom,
  mesbahAdapter,
  MESBAH_SOURCE,
  parseSpokenCards,
  parseSpokenWork,
} from "@/lib/online/mesbah";

const BASE = "https://mesbahyazdi.ir";
const SPOKEN = `${BASE}/works/spoken`;

function card(options: {
  id: string;
  title: string;
  series?: string;
  subtitle?: string;
  mp3?: string | null;
}): string {
  const address = options.mp3
    ? `<div class="s-addr">${options.mp3}</div>`
    : `<div class="s-addr">این اثر فایل صوتی ندارد.</div>`;
  return `
    <div class="dexp-grid-item">
      <div class="sp-t"><a href="/node/${options.id}">${options.title}</a></div>
      <div class="sp-group"><a href="/works/series/1">${options.series ?? ""}</a></div>
      <div class="views-field-field-subtitle-1">
        <div class="field-content">${options.subtitle ?? ""}</div>
      </div>
      ${address}
    </div>
  `;
}

const PAGE_ONE = `
  <div class="view">
    ${card({
      id: "7728",
      title: "نظریه سیاسی اسلام ۱",
      series: "نظریه سیاسی اسلام",
      subtitle: "جلسه اول",
      mp3: "https://mesbahyazdi.ir/sites/default/files/audio/7728.mp3",
    })}
    ${card({
      id: "7729",
      title: "نظریه سیاسی اسلام ۲",
      series: "نظریه سیاسی اسلام",
      mp3: "https://mesbahyazdi.ir/sites/default/files/audio/7729.mp3",
    })}
    ${card({ id: "7730", title: "پرسش و پاسخ", series: "پرسش و پاسخ", mp3: null })}
    ${card({
      id: "7731",
      title: "",
      series: "بی‌نام",
      mp3: "https://mesbahyazdi.ir/sites/default/files/audio/7731.mp3",
    })}
    <div class="card"><a href="/works/series/1">یک مجموعه</a></div>
  </div>
  <nav class="pager">
    <a href="/works/spoken?page=0">۱</a>
    <a href="/works/spoken?page=1">۲</a>
    <a href="/works/spoken?page=2">۳</a>
  </nav>
`;

const PAGE_TWO = `
  <div class="view">
    ${card({
      id: "7800",
      title: "اخلاق اسلامی",
      series: "اخلاق",
      mp3: "https://mesbahyazdi.ir/sites/default/files/audio/7800.mp3",
    })}
    ${card({
      id: "7728",
      title: "نظریه سیاسی اسلام ۱ (تکرار)",
      series: "نظریه سیاسی اسلام",
      mp3: "https://mesbahyazdi.ir/sites/default/files/audio/7728.mp3",
    })}
  </div>
`;

const PAGE_THREE = `
  <div class="view">
    ${card({
      id: "7900",
      title: "مصاحبه",
      series: "مصاحبه‌ها",
      mp3: "https://mesbahyazdi.ir/sites/default/files/audio/7900.mp3",
    })}
  </div>
`;

function workHtml(title: string, mp3: string | null): string {
  const player = mp3
    ? `<audio controls><source src="${mp3}" type="audio/mpeg"></audio>`
    : `<p>بدون فایل</p>`;
  return `<html><body><h1>${title}</h1>${player}</body></html>`;
}

type Reply = { ok: boolean; status: number; text?: string };

function stubFetch(handler: (url: string) => Reply) {
  const mock = jest.fn(async (input: unknown) => {
    const reply = handler(String(input));
    return {
      ok: reply.ok,
      status: reply.status,
      text: async () => reply.text ?? "",
    };
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

const WORKS: Record<string, string> = {
  [`${BASE}/node/7728`]: workHtml(
    "نظریه سیاسی اسلام ۱",
    "https://mesbahyazdi.ir/sites/default/files/audio/7728.mp3",
  ),
  [`${BASE}/node/7729`]: workHtml(
    "نظریه سیاسی اسلام ۲",
    "https://mesbahyazdi.ir/sites/default/files/audio/7729.mp3",
  ),
  [`${BASE}/node/7800`]: workHtml(
    "اخلاق اسلامی",
    "https://mesbahyazdi.ir/sites/default/files/audio/7800.mp3",
  ),
  [`${BASE}/node/7900`]: workHtml(
    "مصاحبه",
    "https://mesbahyazdi.ir/sites/default/files/audio/7900.mp3",
  ),
  [`${BASE}/node/7730`]: workHtml("پرسش و پاسخ", null),
};

function catalogueFetch(overrides: Record<string, Reply> = {}) {
  return stubFetch((url) => {
    const override = overrides[url];
    if (override) {
      return override;
    }
    if (url === SPOKEN) return { ok: true, status: 200, text: PAGE_ONE };
    if (url === `${SPOKEN}?page=1`) return { ok: true, status: 200, text: PAGE_TWO };
    if (url === `${SPOKEN}?page=2`) return { ok: true, status: 200, text: PAGE_THREE };
    if (url in WORKS) return { ok: true, status: 200, text: WORKS[url] ?? "" };
    return { ok: false, status: 404 };
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the source descriptor", () => {
  it("is a finite Persian lecture source", () => {
    expect(MESBAH_SOURCE.id).toBe("mesbah");
    expect(MESBAH_SOURCE.kind).toBe("mesbah");
    expect(MESBAH_SOURCE.languageCode).toBe("fa");
    expect(MESBAH_SOURCE.live).toBeUndefined();
  });
});

describe("parseSpokenCards", () => {
  it("reads the title, series, subtitle and whether it can be played", () => {
    const cards = parseSpokenCards(PAGE_ONE);

    expect(cards[0]).toEqual({
      id: "7728",
      title: "نظریه سیاسی اسلام ۱",
      subtitle: "جلسه اول",
      series: "نظریه سیاسی اسلام",
      hasAudio: true,
    });
  });

  it("marks a work whose address block holds no MP3 as unplayable", () => {
    const cards = parseSpokenCards(PAGE_ONE);
    const qa = cards.find((entry) => entry.id === "7730");

    expect(qa?.hasAudio).toBe(false);
  });

  it("ignores links that are not works", () => {
    const cards = parseSpokenCards(PAGE_ONE);

    expect(cards.map((entry) => entry.id)).toEqual(["7728", "7729", "7730", "7731"]);
  });

  it("answers nothing for a page that is not the listing", () => {
    expect(parseSpokenCards("<html><body><h1>خطا</h1></body></html>")).toEqual([]);
  });
});

describe("lastPageFrom", () => {
  it("counts the pager from zero, so a linked ?page=2 is the third page", () => {
    expect(lastPageFrom(PAGE_ONE)).toBe(3);
  });

  it("answers one when there is no pager at all", () => {
    expect(lastPageFrom("<div>only one page</div>")).toBe(1);
  });

  it("takes the largest page the pager links, not the first", () => {
    const html = `<a href="?page=0">1</a><a href="?page=7">8</a><a href="?page=3">4</a>`;

    expect(lastPageFrom(html)).toBe(8);
  });
});

describe("parseSpokenWork", () => {
  it("reads the work's title and recording", () => {
    const work = parseSpokenWork(WORKS[`${BASE}/node/7728`] ?? "", "7728");

    expect(work).toEqual({
      id: "7728",
      title: "نظریه سیاسی اسلام ۱",
      streamUrl: "https://mesbahyazdi.ir/sites/default/files/audio/7728.mp3",
    });
  });

  it("answers a null recording for a work that has none", () => {
    const work = parseSpokenWork(workHtml("پرسش و پاسخ", null), "7730");

    expect(work.streamUrl).toBeNull();
    expect(work.title).toBe("پرسش و پاسخ");
  });
});

describe("listCollections", () => {
  it("pages through the listing and keeps the works that can be played", async () => {
    catalogueFetch();

    const collections = await mesbahAdapter.listCollections();

    expect(collections.map((collection) => collection.externalId)).toEqual([
      "7728",
      "7729",
      "7800",
      "7900",
    ]);
  });

  it("files each lecture under its series and opens on its own page", async () => {
    catalogueFetch();

    const collections = await mesbahAdapter.listCollections();

    expect(collections[0]).toMatchObject({
      key: "mesbah:7728",
      sourceId: "mesbah",
      title: "نظریه سیاسی اسلام ۱",
      subtitle: "نظریه سیاسی اسلام",
      artworkUrl: null,
      trackCount: 1,
      languageCode: "fa",
      pageUrl: `${BASE}/node/7728`,
    });
  });

  it("drops a work with no recording rather than showing a dead row", async () => {
    catalogueFetch();

    const collections = await mesbahAdapter.listCollections();

    expect(collections.map((collection) => collection.externalId)).not.toContain("7730");
  });

  it("drops a work with no title", async () => {
    catalogueFetch();

    const collections = await mesbahAdapter.listCollections();

    expect(collections.map((collection) => collection.externalId)).not.toContain("7731");
  });

  it("keeps one entry when two pages repeat a work", async () => {
    catalogueFetch();

    const collections = await mesbahAdapter.listCollections();

    const repeated = collections.filter((collection) => collection.externalId === "7728");
    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.title).toBe("نظریه سیاسی اسلام ۱");
  });

  it("falls back to the card's subtitle when it names no series", async () => {
    catalogueFetch({
      [SPOKEN]: {
        ok: true,
        status: 200,
        text: `<div class="dexp-grid-item">
          <div class="sp-t"><a href="/node/1">اثر</a></div>
          <div class="views-field-field-subtitle-1"><div class="field-content">زیرنویس</div></div>
          <div class="s-addr">https://mesbahyazdi.ir/a.mp3</div>
        </div>`,
      },
    });

    const collections = await mesbahAdapter.listCollections();

    expect(collections[0]?.subtitle).toBe("زیرنویس");
  });

  it("fails rather than returning half a catalogue when a page fails", async () => {
    catalogueFetch({ [`${SPOKEN}?page=2`]: { ok: false, status: 500 } });

    await expect(mesbahAdapter.listCollections()).rejects.toBeInstanceOf(OnlineSourceError);
  });

  it("refuses a catalogue that has changed shape instead of crawling it", async () => {
    catalogueFetch({
      [SPOKEN]: {
        ok: true,
        status: 200,
        text: `<div class="dexp-grid-item">
          <div class="sp-t"><a href="/node/1">اثر</a></div>
          <div class="s-addr">https://mesbahyazdi.ir/a.mp3</div>
        </div>
        <a href="?page=900">آخر</a>`,
      },
    });

    await expect(mesbahAdapter.listCollections()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("refuses a listing with no cards at all", async () => {
    catalogueFetch({ [SPOKEN]: { ok: true, status: 200, text: "<div>خالی</div>" } });

    await expect(mesbahAdapter.listCollections()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

describe("getCollection", () => {
  it("reads the work it was asked for", async () => {
    catalogueFetch();

    const collection = await mesbahAdapter.getCollection?.("7800");

    expect(collection).toMatchObject({
      key: "mesbah:7800",
      externalId: "7800",
      title: "اخلاق اسلامی",
      trackCount: 1,
    });
  });

  it("answers null for a work that is gone", async () => {
    catalogueFetch({ [`${BASE}/node/7728`]: { ok: false, status: 404 } });

    await expect(mesbahAdapter.getCollection?.("7728")).resolves.toBeNull();
  });

  it("does not touch the network for a non-numeric id", async () => {
    const fetchMock = catalogueFetch();

    await expect(mesbahAdapter.getCollection?.("not-a-work")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getTracks", () => {
  it("opens the work as its own one-track collection", async () => {
    catalogueFetch();

    const tracks = await mesbahAdapter.getTracks("mesbah:7728");

    expect(tracks).toEqual([
      {
        externalId: "7728",
        title: "نظریه سیاسی اسلام ۱",
        artist: null,
        albumTitle: null,
        artworkUrl: null,
        streamUrl: "https://mesbahyazdi.ir/sites/default/files/audio/7728.mp3",
        durationSec: 0,
        order: 1,
        pageUrl: `${BASE}/node/7728`,
      },
    ]);
  });

  it("reports a work with no recording as gone rather than opening silence", async () => {
    catalogueFetch();

    await expect(mesbahAdapter.getTracks("mesbah:7730")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses a key that belongs to another source", async () => {
    const fetchMock = catalogueFetch();

    await expect(mesbahAdapter.getTracks("esra:tafsir")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a key whose id is not numeric", async () => {
    catalogueFetch();

    await expect(mesbahAdapter.getTracks("mesbah:work")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
