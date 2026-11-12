/**
 * The esra.ir adapter.
 *
 * The institute's portal is Liferay with no read API, so both the archive page
 * and every session page are HTML. Three facts shape these tests:
 *
 *   · A collection is an *archive*, not an album: one page lists the sessions
 *     and each session page carries the recording, so opening a series costs
 *     one request per session.
 *   · The archive renders newest-first, which is the wrong order to listen in.
 *     A numbered series sorts by its number; an unnumbered one is reversed.
 *   · The MP3s are on `mp3.esra.ir` over plain HTTP. That is the source's own
 *     arrangement and must survive the adapter untouched — an `https` rewrite
 *     would 502.
 */

import { OnlineSourceError } from "@/lib/online/types";
import {
  esraAdapter,
  ESRA_SOURCE,
  inListeningOrder,
  parseLessonAudio,
  parseLessonLinks,
  seriesTitleFrom,
  sessionNumber,
} from "@/lib/online/esra";

const BASE = "https://esra.ir";
const TAFSIR = `${BASE}/web/javadi/%D8%A2%D8%B1%D8%B4%DB%8C%D9%88-%D8%AF%D8%B1%D9%88%D8%B3-%D8%AA%D9%81%D8%B3%DB%8C%D8%B1`;
const FIQH = `${BASE}/web/javadi/%D8%A2%D8%B1%D8%B4%DB%8C%D9%88-%D8%AF%D8%B1%D9%88%D8%B3-%D9%81%D9%82%D9%87`;
const AKHLAQ = `${BASE}/web/javadi/%D8%A2%D8%B1%D8%B4%DB%8C%D9%88-%D8%AF%D8%B1%D9%88%D8%B3-%D8%A7%D8%AE%D9%84%D8%A7%D9%82`;

function lessonAnchor(slug: string, title: string): string {
  return `<li class="lesson"><a href="/web/javadi/w/${slug}">${title}</a></li>`;
}

/** Newest first, as the portal renders it. */
const TAFSIR_HTML = `
  <div class="archive">
    <ul>
      ${lessonAnchor("tafsir-raad-3", "تفسیر سوره رعد جلسه ۳ (۱۳۶۲/۰۲/۱۲)")}
      ${lessonAnchor("tafsir-raad-2", "تفسیر سوره رعد جلسه ۲ (۱۳۶۲/۰۲/۱۱)")}
      ${lessonAnchor("tafsir-raad-1", "تفسیر سوره رعد جلسه ۱ (۱۳۶۲/۰۲/۱۰)")}
    </ul>
    <a href="/web/javadi/home">بازگشت</a>
    <a href="/web/javadi/w/tafsir-raad-3">تفسیر سوره رعد جلسه ۳ (۱۳۶۲/۰۲/۱۲)</a>
  </div>
`;

const FIQH_HTML = `
  <ul>
    ${lessonAnchor("fiqh-hodud-2", "درس فقه: حدود جلسه ۲")}
    ${lessonAnchor("fiqh-hodud-1", "درس فقه: حدود جلسه ۱")}
  </ul>
`;

/** The ethics lessons do not name a series in their titles. */
const AKHLAQ_HTML = `
  <ul>
    ${lessonAnchor("akhlaq-2", "جلسه درس اخلاق ۲")}
    ${lessonAnchor("akhlaq-1", "جلسه درس اخلاق ۱")}
  </ul>
`;

function sessionHtml(mp3: string | null): string {
  const player = mp3
    ? `<audio controls preload="none"><source src="${mp3}" type="audio/mpeg"></audio>`
    : `<p>این جلسه فایل صوتی ندارد.</p>`;
  return `<html><body><h1>جلسه</h1>${player}</body></html>`;
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

const AUDIO: Record<string, string> = {
  [`${BASE}/fa/web/javadi/w/tafsir-raad-1`]: "http://mp3.esra.ir/tafsir/01.mp3",
  [`${BASE}/fa/web/javadi/w/tafsir-raad-2`]: "http://mp3.esra.ir/tafsir/02.mp3",
  [`${BASE}/fa/web/javadi/w/tafsir-raad-3`]: "http://mp3.esra.ir/tafsir/03.mp3",
  [`${BASE}/fa/web/javadi/w/fiqh-hodud-1`]: "http://mp3.esra.ir/fiqh/01.mp3",
  [`${BASE}/fa/web/javadi/w/fiqh-hodud-2`]: "http://mp3.esra.ir/fiqh/02.mp3",
  [`${BASE}/fa/web/javadi/w/akhlaq-1`]: "http://mp3.esra.ir/akhlaq/01.mp3",
  [`${BASE}/fa/web/javadi/w/akhlaq-2`]: "http://mp3.esra.ir/akhlaq/02.mp3",
};

function archiveFetch(overrides: Record<string, Reply> = {}) {
  return stubFetch((url) => {
    const override = overrides[url];
    if (override) {
      return override;
    }
    if (url === TAFSIR) return { ok: true, status: 200, text: TAFSIR_HTML };
    if (url === FIQH) return { ok: true, status: 200, text: FIQH_HTML };
    if (url === AKHLAQ) return { ok: true, status: 200, text: AKHLAQ_HTML };
    if (url in AUDIO) return { ok: true, status: 200, text: sessionHtml(AUDIO[url] ?? null) };
    return { ok: false, status: 404 };
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the source descriptor", () => {
  it("is a finite Persian lecture source", () => {
    expect(ESRA_SOURCE.id).toBe("esra");
    expect(ESRA_SOURCE.kind).toBe("esra");
    expect(ESRA_SOURCE.languageCode).toBe("fa");
    expect(ESRA_SOURCE.live).toBeUndefined();
  });
});

describe("parseLessonLinks", () => {
  it("reads every session link on the archive", () => {
    const lessons = parseLessonLinks(TAFSIR_HTML);

    expect(lessons.map((lesson) => lesson.slug)).toEqual([
      "tafsir-raad-3",
      "tafsir-raad-2",
      "tafsir-raad-1",
    ]);
    expect(lessons[0]?.title).toContain("تفسیر سوره رعد");
  });

  it("keeps one entry when the archive repeats a session", () => {
    // The page links each session twice: once in the list and once as a
    // "continue reading" affordance at the foot.
    const lessons = parseLessonLinks(TAFSIR_HTML);

    expect(lessons.filter((lesson) => lesson.slug === "tafsir-raad-3")).toHaveLength(1);
  });

  it("ignores links that are not sessions", () => {
    const lessons = parseLessonLinks(TAFSIR_HTML);

    expect(lessons.map((lesson) => lesson.slug)).not.toContain("home");
    expect(lessons).toHaveLength(3);
  });

  it("drops a session whose link carries no text", () => {
    const html = `<a href="/web/javadi/w/blank"></a><a href="/web/javadi/w/real">جلسه ۱</a>`;

    expect(parseLessonLinks(html).map((lesson) => lesson.slug)).toEqual(["real"]);
  });

  it("answers nothing for a page that is not an archive", () => {
    expect(parseLessonLinks("<html><body><p>خطا</p></body></html>")).toEqual([]);
  });
});

describe("sessionNumber", () => {
  it("reads a Persian numeral", () => {
    expect(sessionNumber("تفسیر سوره رعد جلسه ۱۲")).toBe(12);
  });

  it("reads an Arabic-Indic numeral", () => {
    expect(sessionNumber("جلسه ٧")).toBe(7);
  });

  it("reads a Latin numeral the same way", () => {
    expect(sessionNumber("جلسه 3")).toBe(3);
  });

  it("ignores the date in brackets", () => {
    // "تفسیر سوره رعد جلسه ۳ (۱۳۶۲/۰۲/۱۲)" — the year must not be mistaken for
    // the session number, so the number is taken from beside "جلسه" only.
    expect(sessionNumber("تفسیر سوره رعد جلسه ۳ (۱۳۶۲/۰۲/۱۲)")).toBe(3);
  });

  it("answers null when the title does not number its session", () => {
    expect(sessionNumber("درس اخلاق")).toBeNull();
    expect(sessionNumber("جلسه صفر")).toBeNull();
    expect(sessionNumber("")).toBeNull();
  });
});

describe("inListeningOrder", () => {
  it("puts a numbered series back in the order it was taught", () => {
    const ordered = inListeningOrder(parseLessonLinks(TAFSIR_HTML));

    expect(ordered.map((lesson) => lesson.slug)).toEqual([
      "tafsir-raad-1",
      "tafsir-raad-2",
      "tafsir-raad-3",
    ]);
  });

  it("reverses a series that numbers nothing, because the page is newest-first", () => {
    const lessons = [
      { slug: "b", title: "درس اخلاق" },
      { slug: "a", title: "درس اخلاق" },
    ];

    expect(inListeningOrder(lessons).map((lesson) => lesson.slug)).toEqual(["a", "b"]);
  });

  it("sorts by number even when the page order disagrees", () => {
    const lessons = [
      { slug: "x", title: "جلسه ۹" },
      { slug: "y", title: "جلسه ۲" },
      { slug: "z", title: "جلسه ۱۰" },
    ];

    expect(inListeningOrder(lessons).map((lesson) => lesson.slug)).toEqual(["y", "x", "z"]);
  });

  it("does not mutate what it was given", () => {
    const lessons = parseLessonLinks(TAFSIR_HTML);
    const before = lessons.map((lesson) => lesson.slug);

    inListeningOrder(lessons);

    expect(lessons.map((lesson) => lesson.slug)).toEqual(before);
  });
});

describe("seriesTitleFrom", () => {
  it("reads the series off the session titles", () => {
    expect(seriesTitleFrom(parseLessonLinks(TAFSIR_HTML), "fallback")).toBe("تفسیر سوره رعد");
  });

  it("falls back when the titles do not name a series", () => {
    expect(seriesTitleFrom(parseLessonLinks(AKHLAQ_HTML), "درس اخلاق")).toBe("درس اخلاق");
  });

  it("falls back for an empty archive", () => {
    expect(seriesTitleFrom([], "دروس فقه")).toBe("دروس فقه");
  });

  it("refuses a prefix too short to be a name", () => {
    expect(seriesTitleFrom([{ slug: "s", title: "جلسه ۱" }], "دروس فقه")).toBe("دروس فقه");
  });
});

describe("parseLessonAudio", () => {
  it("reads the player's own source", () => {
    expect(parseLessonAudio(sessionHtml("http://mp3.esra.ir/a/01.mp3"))).toBe(
      "http://mp3.esra.ir/a/01.mp3",
    );
  });

  it("keeps the plain-HTTP address as the source publishes it", () => {
    // `mp3.esra.ir` has no TLS listener; an https rewrite answers 502.
    const url = parseLessonAudio(sessionHtml("http://mp3.esra.ir/a/01.mp3"));

    expect(url?.startsWith("http://")).toBe(true);
  });

  it("falls back to the download link beside the player", () => {
    const html = `<a href="https://esra.ir/dl/lesson.mp3">دریافت فایل</a>`;

    expect(parseLessonAudio(html)).toBe("https://esra.ir/dl/lesson.mp3");
  });

  it("answers null for a session with no recording", () => {
    expect(parseLessonAudio(sessionHtml(null))).toBeNull();
  });

  it("ignores a source that is not an MP3", () => {
    const html = `<audio><source src="http://mp3.esra.ir/a/01.m4a"></audio>`;

    expect(parseLessonAudio(html)).toBeNull();
  });
});

describe("listCollections", () => {
  it("offers the three archives as three collections", async () => {
    archiveFetch();

    const collections = await esraAdapter.listCollections();

    expect(collections.map((collection) => collection.key)).toEqual([
      "esra:tafsir",
      "esra:fiqh",
      "esra:akhlaq",
    ]);
  });

  it("names each archive by its own series and labels the archive under it", async () => {
    archiveFetch();

    const collections = await esraAdapter.listCollections();

    expect(collections[0]).toMatchObject({
      sourceId: "esra",
      externalId: "tafsir",
      title: "تفسیر سوره رعد",
      subtitle: "دروس تفسیر",
      artworkUrl: null,
      trackCount: 3,
      languageCode: "fa",
      pageUrl: TAFSIR,
    });
    expect(collections[2]).toMatchObject({ title: "درس اخلاق", subtitle: "دروس اخلاق" });
  });

  it("counts what the archive lists, which is what the series will play", async () => {
    archiveFetch();

    const collections = await esraAdapter.listCollections();

    expect(collections.map((collection) => collection.trackCount)).toEqual([3, 2, 2]);
  });

  it("fails rather than offering a broken archive as an empty series", async () => {
    archiveFetch({ [FIQH]: { ok: true, status: 200, text: "<html><body>خطا</body></html>" } });

    await expect(esraAdapter.listCollections()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("reports an unreachable archive as a source error", async () => {
    archiveFetch({ [AKHLAQ]: { ok: false, status: 500 } });

    await expect(esraAdapter.listCollections()).rejects.toBeInstanceOf(OnlineSourceError);
  });
});

describe("getCollection", () => {
  it("reads the archive it was asked for", async () => {
    archiveFetch();

    const collection = await esraAdapter.getCollection?.("fiqh");

    expect(collection).toMatchObject({
      key: "esra:fiqh",
      title: "درس فقه: حدود",
      subtitle: "دروس فقه",
      trackCount: 2,
    });
  });

  it("answers null for an archive this source does not have", async () => {
    const fetchMock = archiveFetch();

    await expect(esraAdapter.getCollection?.("history")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getTracks", () => {
  it("opens the series in listening order with each recording", async () => {
    archiveFetch();

    const tracks = await esraAdapter.getTracks("esra:tafsir");

    expect(tracks.map((track) => track.externalId)).toEqual([
      "tafsir-raad-1",
      "tafsir-raad-2",
      "tafsir-raad-3",
    ]);
    expect(tracks[0]).toMatchObject({
      artist: null,
      albumTitle: "تفسیر سوره رعد",
      artworkUrl: null,
      streamUrl: "http://mp3.esra.ir/tafsir/01.mp3",
      durationSec: 0,
      order: 1,
      pageUrl: `${BASE}/fa/web/javadi/w/tafsir-raad-1`,
    });
    expect(tracks.map((track) => track.order)).toEqual([1, 2, 3]);
  });

  it("leaves the duration for the player to ask, because the page states none", async () => {
    archiveFetch();

    const tracks = await esraAdapter.getTracks("esra:tafsir");

    expect(tracks.every((track) => track.durationSec === 0)).toBe(true);
  });

  it("keeps the rest of the series when one session cannot be read", async () => {
    // A series with a gap is still worth listening to; the gap says so by being
    // absent rather than by failing the whole open.
    archiveFetch({
      [`${BASE}/fa/web/javadi/w/tafsir-raad-2`]: { ok: false, status: 500 },
    });

    const tracks = await esraAdapter.getTracks("esra:tafsir");

    expect(tracks.map((track) => track.externalId)).toEqual(["tafsir-raad-1", "tafsir-raad-3"]);
  });

  it("drops a session that has no recording and renumbers what is left", async () => {
    archiveFetch({
      [`${BASE}/fa/web/javadi/w/fiqh-hodud-1`]: { ok: true, status: 200, text: sessionHtml(null) },
    });

    const tracks = await esraAdapter.getTracks("esra:fiqh");

    expect(tracks.map((track) => track.externalId)).toEqual(["fiqh-hodud-2"]);
    expect(tracks[0]?.order).toBe(1);
  });

  it("reports an archive with nothing playable as gone", async () => {
    archiveFetch({
      [FIQH]: {
        ok: true,
        status: 200,
        text: `<a href="/web/javadi/w/fiqh-hodud-1">درس فقه جلسه ۱</a>`,
      },
      [`${BASE}/fa/web/javadi/w/fiqh-hodud-1`]: {
        ok: true,
        status: 200,
        text: sessionHtml(null),
      },
    });

    await expect(esraAdapter.getTracks("esra:fiqh")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses a key that belongs to another source", async () => {
    const fetchMock = archiveFetch();

    await expect(esraAdapter.getTracks("mesbah:7728")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an archive this source does not have", async () => {
    archiveFetch();

    await expect(esraAdapter.getTracks("esra:history")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
