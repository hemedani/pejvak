/**
 * The online Server Actions, with the backend and the sources mocked out.
 *
 * What is under test is the decisions an action makes that nothing else can:
 * what it sends, what it refuses to send, the order it preserves, and the fold
 * it applies before filtering a source that has no search of its own.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { callAct } from "@/lib/call-act";
import * as server from "@/lib/online/server";
import type { OnlineCollection, OnlineTrack } from "@/lib/online/types";
import { ok } from "@/lib/result";

import { getBrowseCollections } from "../get-browse-collections";
import { getMyContexts } from "../get-my-contexts";
import { getMyOnlineCollections } from "../get-my-online-collections";
import { resolveOnlineStream } from "../resolve-online-stream";
import { saveOnlineCollection } from "../save-online-collection";

vi.mock("@/lib/call-act", () => ({ callAct: vi.fn() }));

vi.mock("@/lib/online/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/online/server")>(
    "@/lib/online/server",
  );
  return {
    ...actual,
    listCollections: vi.fn(),
    searchCollections: vi.fn(),
    getTracks: vi.fn(),
  };
});

const callActMock = vi.mocked(callAct);
const listMock = vi.mocked(server.listCollections);
const searchMock = vi.mocked(server.searchCollections);
const tracksMock = vi.mocked(server.getTracks);

function collection(overrides: Partial<OnlineCollection> = {}): OnlineCollection {
  return {
    key: "manahej:190",
    sourceId: "manahej",
    externalId: "190",
    title: "تاریخ شیعه",
    subtitle: null,
    artworkUrl: null,
    trackCount: 29,
    languageCode: "fa",
    pageUrl: null,
    ...overrides,
  };
}

function track(overrides: Partial<OnlineTrack> = {}): OnlineTrack {
  return {
    externalId: "7101",
    title: "نسخه پیروزی",
    artist: null,
    albumTitle: "تاریخ شیعه",
    artworkUrl: null,
    streamUrl: "https://dl.manahej.ir/190/01.mp3?sig=abc",
    durationSec: 0,
    order: 1,
    pageUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  callActMock.mockReset();
  listMock.mockReset();
  searchMock.mockReset();
  tracksMock.mockReset();
});

describe("getBrowseCollections", () => {
  it("folds the query, so an Arabic kaf finds a Persian kaf title", async () => {
    // The source's own search is mocked away: manahej has none, so the action
    // filters the shelf locally — and that filter must fold.
    searchMock.mockResolvedValue(null);
    listMock.mockResolvedValue([collection({ title: "کتاب‌های صوتی" })]);

    const result = await getBrowseCollections({
      sourceId: "manahej",
      query: "كتاب", // Arabic kaf
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.body.collections.map((entry) => entry.key)).toEqual(["manahej:190"]);
    }
  });

  it("paginates in memory and reports hasMore", async () => {
    searchMock.mockResolvedValue(null);
    listMock.mockResolvedValue([
      collection({ key: "manahej:1", externalId: "1" }),
      collection({ key: "manahej:2", externalId: "2" }),
      collection({ key: "manahej:3", externalId: "3" }),
    ]);

    const first = await getBrowseCollections({ sourceId: "manahej", page: 1, limit: 2 });
    const second = await getBrowseCollections({ sourceId: "manahej", page: 2, limit: 2 });

    expect(first.success && first.body.collections).toHaveLength(2);
    expect(first.success && first.body.hasMore).toBe(true);
    expect(second.success && second.body.collections).toHaveLength(1);
    expect(second.success && second.body.hasMore).toBe(false);
  });

  it("turns an unknown source into a validation failure, not a crash", async () => {
    const result = await getBrowseCollections({ sourceId: "nope" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("validation");
    }
  });
});

describe("saveOnlineCollection", () => {
  it("sends the server clock and a non-negative integer size, never clientId", async () => {
    callActMock.mockResolvedValue(
      ok({
        sourceId: "manahej",
        externalId: "190",
        title: "تاریخ شیعه",
        languageCode: "fa",
        trackCount: 29,
        isFavorite: true,
      }),
    );

    const result = await saveOnlineCollection({
      collection: {
        sourceId: "manahej",
        externalId: "190",
        title: "تاریخ شیعه",
        languageCode: "fa",
        trackCount: 28.6,
      },
      isFavorite: true,
    });

    expect(result.success).toBe(true);
    const [model, act, details] = callActMock.mock.calls[0] ?? [];
    expect(model).toBe("onlineCollection");
    expect(act).toBe("saveOnlineCollection");
    const set = (details as { set: Record<string, unknown> }).set;
    expect(set.updatedAt).toEqual(expect.any(Number));
    expect(set.trackCount).toBe(29);
    expect(set).not.toHaveProperty("clientId");
  });
});

describe("getMyOnlineCollections", () => {
  it("parses a bare array and rebuilds the key", async () => {
    callActMock.mockResolvedValue(
      ok([
        {
          sourceId: "manahej",
          externalId: "190",
          title: "تاریخ شیعه",
          languageCode: "fa",
          trackCount: 29,
          isFavorite: true,
          clientId: "a-different-key",
        },
      ]),
    );

    const result = await getMyOnlineCollections({ limit: 24 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.body.collections[0]?.key).toBe("manahej:190");
      // A full array (one row) is not a full page of 24, so there is no more.
      expect(result.body.hasMore).toBe(false);
    }
  });
});

describe("getMyContexts", () => {
  it("passes the filters through and keeps the act's order", async () => {
    callActMock.mockResolvedValue(
      ok([
        {
          clientId: "new",
          contextType: "online",
          contextKey: "manahej:190",
          contextTitle: "تاریخ شیعه",
          trackCount: 10,
          startedAt: 300,
          endedAt: 400,
          lastIndex: 2,
          lastPositionSec: 30,
          finishedCount: 2,
          completed: false,
          interrupted: false,
        },
        {
          clientId: "old",
          contextType: "online",
          contextKey: "manahej:191",
          contextTitle: "کتاب",
          trackCount: 5,
          startedAt: 100,
          endedAt: 200,
          lastIndex: 1,
          lastPositionSec: 10,
          finishedCount: 1,
          completed: false,
          interrupted: false,
        },
      ]),
    );

    const result = await getMyContexts({ contextType: "online", limit: 36 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.body.map((run) => run.clientId)).toEqual(["new", "old"]);
    }
    const details = callActMock.mock.calls[0]?.[2] as { set: Record<string, unknown> };
    expect(details.set.contextType).toBe("online");
    expect(details.set.limit).toBe(36);
  });
});

describe("resolveOnlineStream", () => {
  it("rejects a key that belongs to another source", async () => {
    const result = await resolveOnlineStream({
      sourceId: "manahej",
      externalId: "7101",
      collectionKey: "librivox:1552",
    });

    expect(result.success).toBe(false);
    expect(tracksMock).not.toHaveBeenCalled();
  });

  it("returns the adapter's address and duration", async () => {
    tracksMock.mockResolvedValue([track({ durationSec: 1830.4 })]);

    const result = await resolveOnlineStream({
      sourceId: "manahej",
      externalId: "7101",
      collectionKey: "manahej:190",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.body).toEqual({
        streamUrl: "https://dl.manahej.ir/190/01.mp3?sig=abc",
        durationSec: 1830,
      });
    }
  });

  it("reports a missing track as a non-retryable validation failure", async () => {
    tracksMock.mockResolvedValue([]);

    const result = await resolveOnlineStream({
      sourceId: "manahej",
      externalId: "7101",
      collectionKey: "manahej:190",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("validation");
    }
  });
});
