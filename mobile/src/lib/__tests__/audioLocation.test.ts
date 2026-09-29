import { isStreamUri } from "@/lib/audioLocation";

/**
 * The predicate exists because `readAsStringAsync` is a *file* reader: the
 * native module accepts `file://`, a SAF `content://` URI, an asset or a
 * null-scheme resource path, and throws `IOException("Unsupported scheme for
 * location …")` for anything else. So "is this a stream?" has to be answered
 * *before* a read is attempted, not learned from a failed one — a caller that
 * treats failure as retryable would otherwise retry forever.
 */
describe("isStreamUri", () => {
  it.each([
    "https://cdn.manahej.ir/audio/1.mp3",
    "http://archive.org/download/item/track.mp3",
    "https://example.com/a.mp3?md5=abc&expires=1700000000",
  ])("is true for %s", (uri) => {
    expect(isStreamUri(uri)).toBe(true);
  });

  it.each([
    "file:///data/user/0/audio/chapter%20one.mp3",
    "content://media/external/audio/media/42",
    "content://com.android.externalstorage.documents/tree/primary%3AMusic",
    "asset:///audio/tone.mp3",
  ])("is false for %s", (uri) => {
    expect(isStreamUri(uri)).toBe(false);
  });

  it("does not mistake a local file whose name begins with http for a stream", () => {
    // The scheme decides, never a substring: a folder may be called anything,
    // and this is a file on this device.
    expect(isStreamUri("file:///storage/emulated/0/http%20notes.mp3")).toBe(false);
  });

  it("is false for a path with no scheme, which the native reader resolves as a resource", () => {
    expect(isStreamUri("res/raw/tone.mp3")).toBe(false);
  });
});
