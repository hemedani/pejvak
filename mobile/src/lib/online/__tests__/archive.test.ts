/**
 * The Internet Archive adapter, against the shapes the real endpoints return.
 *
 * The fixtures are trimmed copies of genuine responses, and they are kept
 * awkward on purpose: every quirk this adapter exists to handle is in them.
 * `length` is `"977.66"` and `"20:45"` and `"109:30"` *in the same item*;
 * `track` is `"0000"`, `"003"`, `"5"`, `"9"` and `"10"`, so neither the padding
 * nor the string order can be trusted; one file is an `.mp3` labelled `Ogg
 * Vorbis`; and `creator` is an array on one item and a string on the next.
 */

import {
  archiveSources,
  createArchiveAdapter,
  parseArchiveDuration,
} from "@/lib/online/archive";
import { OnlineSourceError, type OnlineAdapter } from "@/lib/online/types";

/** The search response, as `advancedsearch.php` returns it. */
const SEARCH_RESULT = {
  response: {
    numFound: 2194,
    docs: [
      { identifier: "hezaroiekshab", title: "هزار و یکشب", creator: "Soheil Solhjoo" },
      {
        identifier: "Golestaan",
        title: "Golestan",
        // The archive sends an array as soon as an item has more than one value.
        creator: ["Saadi Shirazi", "Recited by Muhammad Umar Chand"],
      },
      // No identifier: it cannot be opened, so it must not become a row.
      { title: "بی‌مکان" },
      // No title: it would render as a nameless card.
      { identifier: "untitled" },
    ],
  },
};

/** The item response, as `/metadata/<identifier>` returns it. */
const METADATA = {
  server: "ia903102.us.archive.org",
  dir: "/23/items/hezaroiekshab",
  metadata: {
    identifier: "hezaroiekshab",
    title: "هزار و یکشب",
    creator: "Soheil Solhjoo",
    language: "Persian",
  },
  files: [
    // Deliberately out of order, so the sort has to do real work.
    { name: "b_10.mp3", format: "VBR MP3", track: "10", length: "600", title: "شب دهم" },
    { name: "a_0000.mp3", format: "VBR MP3", track: "0000", length: "977.66", title: "آغاز" },
    { name: "c_9.mp3", format: "VBR MP3", track: "9", length: "20:45", title: "شب نهم" },
    { name: "d_003.mp3", format: "VBR MP3", track: "003", length: "109:30", title: "شب سوم" },
    { name: "e_5.mp3", format: "VBR MP3", track: "5", length: "472.77", title: "شب پنجم" },
    // An `.mp3` the archive labels as Ogg. Still playable, so it must survive:
    // the extension is the signal, not the format label.
    { name: "f_none.mp3", format: "Ogg Vorbis", length: "12:00", title: "بی شماره" },
    // Derivatives of the same audio, none of which is a file we can play.
    { name: "a_0000_spectrogram.png", format: "Spectrogram", length: "0" },
    { name: "a_0000.ogg", format: "Ogg Vorbis", length: "16:17" },
    { name: "a_0000_peaks.json", format: "Columbia Peaks", length: "0" },
  ],
};

/**
 * The item that exposed the ordering bug, trimmed to its essentials.
 *
 * `jadi-radio-geek` is a real Persian podcast: 104 episodes, 92 of which carry
 * no `track` field, and whose introduction is numbered 000, claims the *same*
 * track number as episode 1, and sits last in the file list. A derivative is
 * kept in because it is what pushed a raw file index past the track numbers.
 */
const SCRAMBLED = {
  metadata: { title: "Radio Geek", creator: "Jadi" },
  files: [
    { name: "geek_001_singularity.mp3", track: "01", length: "4510.35", title: "یک" },
    { name: "geek_002_space.mp3", track: "002", length: "2033.03", title: "دو" },
    { name: "geek_003_ghoole.mp3", length: "39:09", title: "سه" },
    { name: "geek_004_ashk.mp3", length: "29:36", title: "چهار" },
    { name: "geek_010_ray.mp3", length: "52:58", title: "ده" },
    { name: "geek_009_how.mp3", length: "41:58", title: "نه" },
    { name: "geek_060_pasa.mp3", track: "60", length: "20:00", title: "شصت" },
    { name: "geek_000_dragon-pirates.mp3", track: "01", length: "1727", title: "آغاز" },
    { name: "geek_001_spectrogram.png", format: "Spectrogram", length: "0" },
  ],
};

function adapterFor(languageCode: string): OnlineAdapter {
  const source = archiveSources().find((entry) => entry.languageCode === languageCode);
  if (!source) {
    throw new Error(`No archive source for ${languageCode}`);
  }
  return createArchiveAdapter(source);
}

const persian = adapterFor("fa");

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

/** The `q` parameter of a request, decoded, so assertions read like the query. */
function decodedQuery(url: string): string {
  const match = /[?&]q=([^&]*)/.exec(url);
  return match?.[1] === undefined ? "" : decodeURIComponent(match[1]);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the source descriptor", () => {
  it("is one source per language, not one source that changes language", () => {
    const sources = archiveSources();
    const persianSource = sources.find((source) => source.languageCode === "fa");

    expect(persianSource).toMatchObject({
      id: "archive-fa",
      kind: "archive",
      languageCode: "fa",
    });
    // A source id is baked into every collection key the listener saves, so the
    // language has to be part of the id rather than a field that can change.
    expect(new Set(sources.map((source) => source.id)).size).toBe(sources.length);
  });

  it("serves every language it declares", () => {
    for (const source of archiveSources()) {
      expect(() => createArchiveAdapter(source)).not.toThrow();
    }
  });

  it("refuses a source whose language it does not know", () => {
    expect(() =>
      createArchiveAdapter({
        id: "archive-xx",
        kind: "archive",
        name: "Internet Archive",
        nativeName: "Internet Archive",
        languageCode: "xx",
        homepage: "https://archive.org",
        description: "x",
      }),
    ).toThrow(OnlineSourceError);
  });
});

describe("parseArchiveDuration", () => {
  it("reads a bare number as seconds, not as a count of anything else", () => {
    expect(parseArchiveDuration("472.77")).toBe(473);
    expect(parseArchiveDuration("600")).toBe(600);
    expect(parseArchiveDuration(977.66)).toBe(978);
  });

  it("reads a colon value as minutes and seconds", () => {
    expect(parseArchiveDuration("20:45")).toBe(1245);
    expect(parseArchiveDuration("0:30")).toBe(30);
  });

  it("treats a two-part value as minutes even past sixty", () => {
    // The trap this function exists for. The archive emits `MM:SS`, so "109:30"
    // is one hour and forty-nine minutes — not 109 hours. Reading it as
    // `HH:MM:SS` would overstate the duration sixtyfold, and every statistic
    // derived from it would be wrong in a way nothing downstream could detect.
    expect(parseArchiveDuration("109:30")).toBe(6570);
  });

  it("still reads three parts as hours, minutes and seconds", () => {
    expect(parseArchiveDuration("1:02:03")).toBe(3723);
  });

  it("answers zero rather than guessing at anything it cannot read", () => {
    for (const value of [
      undefined,
      null,
      "",
      "   ",
      "abc",
      "1:xx",
      "1:2:3:4",
      "12x",
      "--",
      "-5",
      "0",
      "0:00",
      NaN,
      Infinity,
      -3,
      {},
      [],
    ]) {
      expect(parseArchiveDuration(value)).toBe(0);
    }
  });
});

describe("listCollections", () => {
  it("maps the items into collections", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: SEARCH_RESULT }));

    const collections = await persian.listCollections();

    expect(collections.map((collection) => collection.externalId)).toEqual([
      "hezaroiekshab",
      "Golestaan",
    ]);
  });

  it("builds a key, an address, artwork and a language for each", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: SEARCH_RESULT }));

    const [first] = await persian.listCollections();

    expect(first).toMatchObject({
      key: "archive-fa:hezaroiekshab",
      sourceId: "archive-fa",
      externalId: "hezaroiekshab",
      languageCode: "fa",
      artworkUrl: "https://archive.org/services/img/hezaroiekshab",
      pageUrl: "https://archive.org/details/hezaroiekshab",
    });
  });

  it("takes the first name when the archive credits several people", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: SEARCH_RESULT }));

    const collections = await persian.listCollections();

    expect(collections[0]?.subtitle).toBe("Soheil Solhjoo");
    expect(collections[1]?.subtitle).toBe("Saadi Shirazi");
  });

  it("reports the size as unknown rather than as zero tracks", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: SEARCH_RESULT }));

    const [first] = await persian.listCollections();

    // The search index holds no per-item track count — the only field that
    // looks like one counts every derivative too, 227 files for a 35-part
    // course. Zero means "not known yet" and is filled in on first open, which
    // is why the UI must not print it as a count. See `describeKnownTrackCount`.
    expect(first?.trackCount).toBe(0);
  });

  it("asks for every spelling of the language, not just one", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: SEARCH_RESULT }));

    await persian.listCollections();

    const query = decodedQuery(String(fetchMock.mock.calls[0]?.[0] ?? ""));
    // The archive files Persian under its English name and under two ISO codes,
    // and the three sets are disjoint: the English name alone matches 91 items
    // against the union's 2,194, and the most-downloaded Persian item of all is
    // filed only under `per`. Dropping any one of these loses most of the list.
    for (const facet of ["Persian", "fa", "per", "fas"]) {
      expect(query).toContain(`language:("${facet}")`);
    }
    expect(query).toContain("mediatype:(audio)");
  });

  it("requires an MP3, as a token rather than as a full label", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: SEARCH_RESULT }));

    await persian.listCollections();

    const query = decodedQuery(String(fetchMock.mock.calls[0]?.[0] ?? ""));
    // `format:("mp3")` matches `VBR MP3` and `128Kbps MP3` alike; asking for
    // `VBR MP3` by name would hide the items that carry only another variant.
    expect(query).toContain('format:("mp3")');
    expect(query).not.toContain("VBR MP3");
  });

  it("asks for the most downloaded first, with the fields it maps", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: SEARCH_RESULT }));

    await persian.listCollections();

    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("sort[]=downloads%20desc");
    expect(url).toContain("fl[]=identifier");
    expect(url).toContain("fl[]=title");
    expect(url).toContain("fl[]=creator");
    expect(url).toContain("output=json");
  });

  it("reports a changed response shape rather than an empty catalogue", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: { response: { numFound: 0 } } }));

    await expect(persian.listCollections()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("answers with an empty list when the language has nothing", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: { response: { numFound: 0, docs: [] } } }));

    await expect(persian.listCollections()).resolves.toEqual([]);
  });

  it("turns an HTTP failure into a typed source error", async () => {
    stubFetch(() => ({ ok: false, status: 503 }));

    const error = await persian.listCollections().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OnlineSourceError);
    expect((error as OnlineSourceError).code).toBe("invalid_response");
  });
});

describe("getTracks", () => {
  it("keeps only the files it can play", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: METADATA }));

    const tracks = await persian.getTracks("archive-fa:hezaroiekshab");

    // The spectrogram, the Ogg derivative and the peaks file are all dropped;
    // the `.mp3` the archive mislabels as Ogg is not.
    expect(tracks.map((track) => track.externalId)).toEqual([
      "a_0000.mp3",
      "d_003.mp3",
      "e_5.mp3",
      "c_9.mp3",
      "b_10.mp3",
      // Its name carries no numbers, so it says nothing about order and is
      // placed after everything that does rather than displacing it.
      "f_none.mp3",
    ]);
  });

  it("orders by the numbers in the name, not as text", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: METADATA }));

    const tracks = await persian.getTracks("archive-fa:hezaroiekshab");
    const names = tracks.map((track) => track.externalId);

    // As text, "10" sorts before "9". As numbers it does not, and the padding
    // ("0000", "003") must not change where a file lands either.
    expect(names.indexOf("c_9.mp3")).toBeLessThan(names.indexOf("b_10.mp3"));
    expect(names[0]).toBe("a_0000.mp3");
    expect(names[1]).toBe("d_003.mp3");
  });

  it("orders a real item the way its own file names do", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: SCRAMBLED }));

    const tracks = await persian.getTracks("archive-fa:jadi-radio-geek");
    const names = tracks.map((track) => track.externalId);

    // Ordering by `track`, with the file's listing position as the fallback,
    // scrambled this item: 92 of its 104 files carry no `track` at all, so they
    // fell back to a raw file index that the interleaved derivatives pushed up
    // to 657 — on the same scale as the real track numbers. Episode 60 landed
    // before episode 7.
    expect(names).toEqual([
      "geek_000_dragon-pirates.mp3",
      "geek_001_singularity.mp3",
      "geek_002_space.mp3",
      "geek_003_ghoole.mp3",
      "geek_004_ashk.mp3",
      "geek_009_how.mp3",
      "geek_010_ray.mp3",
      "geek_060_pasa.mp3",
    ]);
    // The introduction is last in the file list and claims the same track
    // number as the first episode, so only its name can put it first.
    expect(names[0]).toBe("geek_000_dragon-pirates.mp3");
    expect(names[names.length - 1]).toBe("geek_060_pasa.mp3");
  });

  it("numbers the surviving tracks densely from one", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: METADATA }));

    const tracks = await persian.getTracks("archive-fa:hezaroiekshab");

    // The position is what a downloaded file's name is built from, so the three
    // dropped derivatives must not leave a hole in the numbering.
    expect(tracks.map((track) => track.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("reads both duration notations in one item", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: METADATA }));

    const tracks = await persian.getTracks("archive-fa:hezaroiekshab");
    const byName = new Map(tracks.map((track) => [track.externalId, track.durationSec]));

    expect(byName.get("a_0000.mp3")).toBe(978); // "977.66", already seconds
    expect(byName.get("c_9.mp3")).toBe(1245); // "20:45"
    expect(byName.get("d_003.mp3")).toBe(6570); // "109:30", minutes not hours
    expect(byName.get("f_none.mp3")).toBe(720); // "12:00"
  });

  it("takes identity from the file's own name, never from the URL", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: METADATA }));

    const tracks = await persian.getTracks("archive-fa:hezaroiekshab");
    const first = tracks[0];

    // The archive serves one file from whichever node is nearest, so the host
    // in the URL changes while the name inside the item does not.
    expect(first?.externalId).toBe("a_0000.mp3");
    expect(first?.streamUrl).toBe(
      "https://archive.org/download/hezaroiekshab/a_0000.mp3",
    );
  });

  it("gives every track the item's cover and address", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: METADATA }));

    const tracks = await persian.getTracks("archive-fa:hezaroiekshab");

    for (const track of tracks) {
      expect(track.artworkUrl).toBe("https://archive.org/services/img/hezaroiekshab");
      expect(track.pageUrl).toBe("https://archive.org/details/hezaroiekshab");
      expect(track.albumTitle).toBe("هزار و یکشب");
    }
  });

  it("falls back to the item's author when the file names no artist", async () => {
    stubFetch(() => ({ ok: true, status: 200, body: METADATA }));

    const tracks = await persian.getTracks("archive-fa:hezaroiekshab");

    expect(tracks.every((track) => track.artist === "Soheil Solhjoo")).toBe(true);
  });

  it("builds a title from the file name when the archive gives none", async () => {
    stubFetch(() => ({
      ok: true,
      status: 200,
      body: {
        metadata: { title: "x" },
        files: [{ name: "00_01_intro_final.mp3", length: "60" }],
      },
    }));

    const [track] = await persian.getTracks("archive-fa:whatever");

    // A nameless row is worse than an ugly one, so the name is always a title.
    expect(track?.title).toBe("00 01 intro final");
  });

  it("refuses a key that belongs to another source, without asking the network", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: METADATA }));

    await expect(persian.getTracks("manahej:190")).rejects.toMatchObject({ code: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a key that belongs to another language's archive source", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, status: 200, body: METADATA }));

    await expect(persian.getTracks("archive-sv:hezaroiekshab")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a 404 as not-found rather than as a network problem", async () => {
    stubFetch(() => ({ ok: false, status: 404 }));

    await expect(persian.getTracks("archive-fa:gone")).rejects.toMatchObject({ code: "not_found" });
  });

  it("treats an empty item response as a collection that is gone", async () => {
    // The archive answers a removed or renamed identifier with `200` and `{}`,
    // so the absence of a file list is the only signal that it no longer exists.
    stubFetch(() => ({ ok: true, status: 200, body: {} }));

    await expect(persian.getTracks("archive-fa:gone")).rejects.toMatchObject({ code: "not_found" });
  });

  it("answers with an empty list when an item holds no playable file", async () => {
    stubFetch(() => ({
      ok: true,
      status: 200,
      body: { metadata: { title: "x" }, files: [{ name: "cover.png", format: "PNG" }] },
    }));

    await expect(persian.getTracks("archive-fa:images-only")).resolves.toEqual([]);
  });
});
