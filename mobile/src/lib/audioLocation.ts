/**
 * Where a track's audio actually lives.
 *
 * One question, asked in more than one place, answered once: *is this a stream,
 * or a file on this device?*
 *
 * `readAsStringAsync` — and therefore everything built on it, from the tag
 * reader to the artwork extractor — is a **file** reader. The native module
 * accepts `file://`, a SAF `content://` URI, an asset, or a null-scheme resource
 * path, and throws `IOException("Unsupported scheme for location …")` for
 * anything else. An `http(s)` URL is therefore not a slow read; it is not a read
 * at all.
 *
 * That matters because an online track that has not been downloaded keeps its
 * source's URL in `file_uri` — the same column a local file's path lives in. So
 * code that treats `file_uri` as "the file to open" is asking the wrong question
 * of exactly those rows, and asking it costs a native call that can only fail.
 * A caller that retries on failure then retries forever.
 *
 * The scheme is what decides, never a substring: a folder may be called
 * anything, and `file:///…/http notes.mp3` is a file on this device.
 *
 * The same rule is written a second time, in SQL, by
 * `LocalDBService.getTracksMissingArtwork` — it has to exclude streams from its
 * worklist without loading every row first, and a `LIKE` clause cannot call this
 * function. Change one, change the other.
 */

/** True when `uri` points at a stream rather than at a file on this device. */
export function isStreamUri(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://");
}
