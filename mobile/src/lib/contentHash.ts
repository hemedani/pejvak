/**
 * Pure content-hash helpers.
 *
 * A track's identity is `SHA-256(first 1 MB of audio bytes || decimal file size)`.
 * Keeping the byte-building and hex encoding pure makes the algorithm testable
 * without native modules; the file/reader wiring lives in `ContentHashService`.
 */
export type Sha256 = (data: Uint8Array) => Promise<Uint8Array>;

export const CONTENT_HASH_CHUNK_BYTES = 1024 * 1024;

export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** The exact bytes that get hashed: the chunk followed by the decimal file size. */
export function buildHashInput(chunk: Uint8Array, fileSizeBytes: number): Uint8Array {
  const sizeBytes = new TextEncoder().encode(String(fileSizeBytes));
  const input = new Uint8Array(chunk.length + sizeBytes.length);
  input.set(chunk, 0);
  input.set(sizeBytes, chunk.length);
  return input;
}

export async function computeContentHashFromChunk(
  chunk: Uint8Array,
  fileSizeBytes: number,
  sha256: Sha256,
): Promise<string> {
  const digest = await sha256(buildHashInput(chunk, fileSizeBytes));
  return toHex(digest);
}
