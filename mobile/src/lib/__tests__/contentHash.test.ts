import {
  CONTENT_HASH_CHUNK_BYTES,
  buildHashInput,
  computeContentHashFromChunk,
  toHex,
  type Sha256,
} from "@/lib/contentHash";

describe("content hash", () => {
  it("encodes bytes as lowercase hex", () => {
    expect(toHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff");
    expect(toHex(new Uint8Array([]))).toBe("");
  });

  it("appends the decimal file size to the chunk", () => {
    const chunk = new Uint8Array([1, 2, 3]);
    const input = buildHashInput(chunk, 4567);

    expect(Array.from(input.slice(0, 3))).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(input.slice(3))).toBe("4567");
  });

  it("hashes the chunk + size and returns hex", async () => {
    const seen: number[] = [];
    const fakeSha256: Sha256 = async (data) => {
      seen.push(data.length);
      return new Uint8Array([0xab, 0xcd]);
    };

    const result = await computeContentHashFromChunk(
      new Uint8Array([9, 9]),
      1200,
      fakeSha256,
    );

    expect(result).toBe("abcd");
    // 2 chunk bytes + length of "1200"
    expect(seen).toEqual([6]);
  });

  it("is deterministic for identical inputs", async () => {
    const fakeSha256: Sha256 = async (data) => new Uint8Array([data.length & 0xff]);
    const a = await computeContentHashFromChunk(new Uint8Array([1]), 10, fakeSha256);
    const b = await computeContentHashFromChunk(new Uint8Array([1]), 10, fakeSha256);
    expect(a).toBe(b);
  });

  it("exposes a 1 MB chunk size", () => {
    expect(CONTENT_HASH_CHUNK_BYTES).toBe(1024 * 1024);
  });
});
