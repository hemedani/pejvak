import { retryDelayMs, BASE_SYNC_INTERVAL_MS, MAX_SYNC_INTERVAL_MS } from "@/lib/syncRetry";

describe("retryDelayMs", () => {
  it("uses the base interval after a success", () => {
    expect(retryDelayMs(0)).toBe(BASE_SYNC_INTERVAL_MS);
  });

  it("backs off exponentially on consecutive failures", () => {
    expect(retryDelayMs(1)).toBe(BASE_SYNC_INTERVAL_MS * 2);
  });

  it("caps at the maximum interval", () => {
    expect(retryDelayMs(2)).toBe(MAX_SYNC_INTERVAL_MS);
    expect(retryDelayMs(10)).toBe(MAX_SYNC_INTERVAL_MS);
  });
});
