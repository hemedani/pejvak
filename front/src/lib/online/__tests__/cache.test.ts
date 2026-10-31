/**
 * The catalogue cache: short, bounded, and never a place for personal state.
 *
 * The tests drive `now` by hand rather than sleeping; a five-minute TTL is not
 * something a test should wait for.
 */

import { describe, expect, it, vi } from "vitest";

import {
  __resetOnlineCacheForTests,
  cached,
  cacheKey,
  ONLINE_CACHE_MAX_ENTRIES,
  ONLINE_CACHE_TTL_MS,
} from "@/lib/online/cache";

describe("cacheKey", () => {
  it("ignores property order and drops undefined", () => {
    expect(cacheKey({ sourceId: "x", language: undefined, page: 1 })).toBe(
      cacheKey({ page: 1, sourceId: "x" }),
    );
  });

  it("keeps two different inputs apart", () => {
    expect(cacheKey({ query: "a:b" })).not.toBe(cacheKey({ query: "a", extra: "b" }));
  });
});

describe("cached", () => {
  it("loads once inside the TTL", async () => {
    __resetOnlineCacheForTests();
    const load = vi.fn(async () => "shelf");

    expect(await cached("k", load, 1_000)).toBe("shelf");
    expect(await cached("k", load, 1_000 + ONLINE_CACHE_TTL_MS - 1)).toBe("shelf");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads again after the TTL", async () => {
    __resetOnlineCacheForTests();
    const load = vi.fn(async () => "shelf");

    await cached("k", load, 1_000);
    await cached("k", load, 1_000 + ONLINE_CACHE_TTL_MS);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one request between concurrent misses", async () => {
    __resetOnlineCacheForTests();
    let resolve: (value: string) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );

    const first = cached("k", load, 1_000);
    const second = cached("k", load, 1_000);
    resolve("shelf");

    await expect(Promise.all([first, second])).resolves.toEqual(["shelf", "shelf"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure", async () => {
    __resetOnlineCacheForTests();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce("shelf");

    await expect(cached("k", load, 1_000)).rejects.toThrow("down");
    expect(await cached("k", load, 1_000)).toBe("shelf");
  });

  it("keeps the cache bounded", async () => {
    __resetOnlineCacheForTests();
    for (let index = 0; index <= ONLINE_CACHE_MAX_ENTRIES; index += 1) {
      await cached(`k-${index}`, async () => index, 1_000);
    }

    // The first key was evicted, so loading it runs the loader again.
    const load = vi.fn(async () => 0);
    await cached("k-0", load, 1_000);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
