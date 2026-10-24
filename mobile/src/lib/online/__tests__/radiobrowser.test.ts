/**
 * The Radio Browser adapter, against the shapes its mirrors return.
 *
 * The tests are built around the three failures this source invites:
 *
 *   · A hard-coded mirror dies, so every request must be able to walk the
 *     discovered list and try the next one.
 *   · A station record can claim an empty address or be marked broken, and
 *     neither is playable — both must be dropped rather than drawn.
 *   · A station is live. Its duration is zero and its collection is one track;
 *     `url_resolved` is what plays, not the unresolved `url`.
 */

import {
  RADIO_BROWSER_SOURCE,
  RADIO_BROWSER_USER_AGENT,
  radioBrowserAdapter,
  __resetForTests,
} from "@/lib/online/radiobrowser";

const SERVERS = [{ name: "de1.api.radio-browser.info" }, { name: "nl1.api.radio-browser.info" }];

const STATIONS = [
  {
    stationuuid: "station-de",
    name: "Deutschlandfunk",
    url: "https://stream.example/redirect",
    url_resolved: "https://stream.example/live.mp3",
    homepage: "https://www.deutschlandfunk.de",
    favicon: "https://www.deutschlandfunk.de/favicon.ico",
    country: "Germany",
    countrycode: "DE",
    language: "german",
    votes: 1200,
    clickcount: 900,
    lastcheckok: 1,
  },
  {
    stationuuid: "station-nl",
    name: "NPO Radio 1",
    url_resolved: "https://stream.example/nl.mp3",
    country: "Netherlands",
    language: "dutch",
    votes: 800,
    lastcheckok: "1",
  },
  // The directory last failed to reach it; playing it would be a broken row.
  {
    stationuuid: "station-broken",
    name: "Broken FM",
    url_resolved: "https://stream.example/broken.mp3",
    language: "german",
    lastcheckok: 0,
  },
  // No resolved address: the unresolved `url` may be a playlist, not audio.
  {
    stationuuid: "station-empty",
    name: "Empty FM",
    url: "https://stream.example/playlist.m3u",
    url_resolved: "",
    language: "german",
    lastcheckok: 1,
  },
  // Multilingual: the requested language is not necessarily the first one.
  {
    stationuuid: "station-multi",
    name: "Multi FM",
    url_resolved: "https://stream.example/multi.mp3",
    language: "dutch,german",
    lastcheckok: 1,
  },
];

type Reply = { ok: boolean; status: number; body?: unknown };

function stubFetch(handler: (url: string, init?: RequestInit) => Reply) {
  const mock = jest.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const { ok, status, body } = handler(url, init);
    return {
      ok,
      status,
      json: async () => body,
    };
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** Discovery plus a station reply, which is what most tests need. */
function stubRadio(handler: (url: string) => Reply) {
  return stubFetch((url) => {
    if (url.includes("/json/servers")) {
      return { ok: true, status: 200, body: SERVERS };
    }
    return handler(url);
  });
}

/** The adapter declares search as a capability; this suite is about it. */
function search(query: string, options?: { languageCode?: string }) {
  if (!radioBrowserAdapter.searchCollections) {
    throw new Error("Radio Browser does not implement search");
  }
  return radioBrowserAdapter.searchCollections(query, options);
}

beforeEach(() => {
  __resetForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the source descriptor", () => {
  it("is a live, multi-language source", () => {
    expect(RADIO_BROWSER_SOURCE.id).toBe("radiobrowser");
    expect(RADIO_BROWSER_SOURCE.languageCodes).toEqual(["de", "nl"]);
    expect(RADIO_BROWSER_SOURCE.live).toBe(true);
  });
});

describe("listCollections", () => {
  it("browses the German stations, filtered to the playable ones", async () => {
    stubRadio(() => ({ ok: true, status: 200, body: STATIONS }));

    const stations = await radioBrowserAdapter.listCollections({ languageCode: "de" });

    expect(stations.map((station) => station.externalId)).toEqual([
      "station-de",
      "station-multi",
    ]);
    expect(stations[1]?.languageCode).toBe("de");
  });

  it("asks for German by name, with broken stations hidden", async () => {
    const fetchMock = stubRadio(() => ({ ok: true, status: 200, body: STATIONS }));

    await radioBrowserAdapter.listCollections({ languageCode: "de" });

    const stationUrl = fetchMock.mock.calls
      .map((call) => String(call[0] ?? ""))
      .find((url) => url.includes("/json/stations/"));
    expect(stationUrl).toContain("/bylanguage/german");
    expect(stationUrl).toContain("hidebroken=true");
    expect(stationUrl).toContain("order=votes");
  });

  it("browses Dutch when Dutch was chosen", async () => {
    stubRadio(() => ({ ok: true, status: 200, body: STATIONS }));

    const stations = await radioBrowserAdapter.listCollections({ languageCode: "nl" });

    expect(stations.map((station) => station.externalId)).toEqual([
      "station-nl",
      "station-multi",
    ]);
    expect(stations[0]?.languageCode).toBe("nl");
  });

  it("answers with nothing for a language it does not serve", async () => {
    const fetchMock = stubRadio(() => ({ ok: true, status: 200, body: STATIONS }));

    await expect(radioBrowserAdapter.listCollections({ languageCode: "fa" })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a station to a one-track collection named after it", async () => {
    stubRadio(() => ({ ok: true, status: 200, body: STATIONS }));

    const [station] = await radioBrowserAdapter.listCollections({ languageCode: "de" });

    expect(station).toMatchObject({
      key: "radiobrowser:station-de",
      sourceId: "radiobrowser",
      title: "Deutschlandfunk",
      subtitle: "Germany",
      artworkUrl: "https://www.deutschlandfunk.de/favicon.ico",
      pageUrl: "https://www.deutschlandfunk.de",
      trackCount: 1,
      languageCode: "de",
    });
  });

  it("sends a descriptive User-Agent, which the directory asks for", async () => {
    const fetchMock = stubRadio(() => ({ ok: true, status: 200, body: STATIONS }));

    await radioBrowserAdapter.listCollections({ languageCode: "de" });

    for (const call of fetchMock.mock.calls) {
      const headers = call[1]?.headers as Record<string, string> | undefined;
      expect(headers?.["User-Agent"]).toBe(RADIO_BROWSER_USER_AGENT);
    }
  });
});

describe("searchCollections", () => {
  it("searches by name inside the chosen language", async () => {
    const fetchMock = stubRadio(() => ({ ok: true, status: 200, body: STATIONS }));

    const stations = await search("Deutschland", {
      languageCode: "de",
    });

    expect(stations.map((station) => station.externalId)).toEqual([
      "station-de",
      "station-multi",
    ]);
    const stationUrl = fetchMock.mock.calls
      .map((call) => String(call[0] ?? ""))
      .find((url) => url.includes("/json/stations/search"));
    expect(stationUrl).toContain("name=Deutschland");
    expect(stationUrl).toContain("language=german");
  });

  it("returns nothing for an empty query without a request", async () => {
    const fetchMock = stubRadio(() => ({ ok: true, status: 200, body: STATIONS }));

    await expect(search("  ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getCollection", () => {
  it("opens a station directly by uuid", async () => {
    const fetchMock = stubRadio(() => ({ ok: true, status: 200, body: STATIONS }));

    const station = await radioBrowserAdapter.getCollection?.("station-de");

    expect(station).toMatchObject({ key: "radiobrowser:station-de", languageCode: "de" });
    expect(
      fetchMock.mock.calls.some((call) => String(call[0] ?? "").includes("/byuuid/station-de")),
    ).toBe(true);
  });

  it("answers null when the station is gone", async () => {
    stubRadio(() => ({ ok: true, status: 200, body: [] }));

    await expect(radioBrowserAdapter.getCollection?.("gone")).resolves.toBeNull();
  });
});

describe("getTracks", () => {
  it("returns one endless track that plays url_resolved", async () => {
    stubRadio(() => ({ ok: true, status: 200, body: [STATIONS[0]] }));

    const tracks = await radioBrowserAdapter.getTracks("radiobrowser:station-de");

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      externalId: "station-de",
      title: "Deutschlandfunk",
      streamUrl: "https://stream.example/live.mp3",
      durationSec: 0,
      order: 1,
      artist: "Germany",
    });
  });

  it("refuses a key from another source without asking the network", async () => {
    const fetchMock = stubRadio(() => ({ ok: true, status: 200, body: STATIONS }));

    await expect(radioBrowserAdapter.getTracks("librivox:1552")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a station that is gone as not-found", async () => {
    stubRadio(() => ({ ok: true, status: 200, body: [] }));

    await expect(radioBrowserAdapter.getTracks("radiobrowser:gone")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("mirror discovery and failover", () => {
  it("tries another mirror when one will not answer", async () => {
    let badAttempts = 0;
    stubFetch((url) => {
      if (url.includes("/json/servers")) {
        return { ok: true, status: 200, body: SERVERS };
      }
      if (url.includes("de1.api.radio-browser.info")) {
        badAttempts += 1;
        throw new Error("connection refused");
      }
      return { ok: true, status: 200, body: STATIONS };
    });

    const stations = await radioBrowserAdapter.listCollections({ languageCode: "de" });

    expect(stations).toHaveLength(2);
    // Depending on the random starting mirror, the bad one may not be tried at
    // all — but the request must never fail because one of them is down.
    expect(badAttempts).toBeLessThanOrEqual(1);
  });

  it("falls back to the project's round-robin name when discovery fails", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("/json/servers")) {
        throw new Error("discovery is down");
      }
      return { ok: true, status: 200, body: STATIONS };
    });

    const stations = await radioBrowserAdapter.listCollections({ languageCode: "de" });

    expect(stations).toHaveLength(2);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0] ?? "").startsWith("https://all.api.radio-browser.info/"),
      ),
    ).toBe(true);
  });

  it("reports a response that is not a station list", async () => {
    stubFetch((url) => {
      if (url.includes("/json/servers")) {
        return { ok: true, status: 200, body: SERVERS };
      }
      return { ok: true, status: 200, body: { stations: [] } };
    });

    await expect(
      radioBrowserAdapter.listCollections({ languageCode: "de" }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("notePlaybackStarted", () => {
  it("counts a play at most once per station per ten minutes", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
    const fetchMock = stubRadio(() => ({ ok: true, status: 200, body: {} }));

    radioBrowserAdapter.notePlaybackStarted?.("station-de");
    radioBrowserAdapter.notePlaybackStarted?.("station-de");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const clicks = () =>
      fetchMock.mock.calls.filter((call) =>
        String(call[0] ?? "").includes("/json/url/station-de"),
      );
    expect(clicks()).toHaveLength(1);

    now.mockReturnValue(1_000 + 10 * 60_000 + 1);
    radioBrowserAdapter.notePlaybackStarted?.("station-de");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(clicks()).toHaveLength(2);
  });

  it("never lets a failed count affect playback", async () => {
    stubFetch((url) => {
      if (url.includes("/json/servers")) {
        return { ok: true, status: 200, body: SERVERS };
      }
      throw new Error("offline");
    });

    expect(() => radioBrowserAdapter.notePlaybackStarted?.("station-de")).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
