import { describe, expect, it } from "vitest";

import { onlineContentHash, onlineIdentity } from "../online-hash";

describe("online identity", () => {
  it("is the source's own id, never a URL", () => {
    expect(onlineIdentity("archive", "episode-42")).toBe("online:archive:episode-42");
  });

  it("hashes the identity, not the address that happens to serve it", async () => {
    const first = await onlineContentHash("archive", "episode-42");
    const second = await onlineContentHash("archive", "episode-42");

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs across external ids", async () => {
    const a = await onlineContentHash("archive", "episode-42");
    const b = await onlineContentHash("archive", "episode-43");
    expect(a).not.toBe(b);
  });

  it("differs across sources with the same external id", async () => {
    const a = await onlineContentHash("archive", "1");
    const b = await onlineContentHash("librivox", "1");
    expect(a).not.toBe(b);
  });
});
