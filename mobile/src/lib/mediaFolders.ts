/**
 * Folder identity and folder playback order.
 *
 * A "folder" is a normalised container path with the storage volume stripped
 * off (`Lectures/Physics`), never a raw filesystem path — a raw path changes
 * when the same library is reached through a different mount, and it embeds a
 * volume id that means nothing to the user.
 */

export const STORAGE_ROOT_FOLDER_NAME = "Internal storage";

/** `/storage/emulated/0/…`, `/storage/self/primary/…`, `/sdcard/…`, `/storage/1A2B-3C4D/…`. */
const STORAGE_ROOT = /^\/storage\/(?:emulated\/\d+|self\/primary|[A-Za-z0-9-]+)\/?/;
const SDCARD_ROOT = /^\/sdcard\/?/;

function stripFileScheme(value: string): string {
  return value.startsWith("file://") ? value.slice("file://".length) : value;
}

function collapseSlashes(value: string): string {
  return value.replace(/\/{2,}/g, "/");
}

/**
 * Derives the folder key from a device file path. Returns null when the path
 * is not a usable filesystem path at all (a `content://` URI, for instance) —
 * the caller then falls back to the media index's album name.
 *
 * Files sitting directly in the storage root yield `""`, which is a real
 * folder ("Internal storage") rather than an absence of one.
 */
export function deriveFolderKey(path: string | null): string | null {
  if (!path) {
    return null;
  }
  const withoutScheme = stripFileScheme(path);
  if (!withoutScheme.startsWith("/")) {
    return null;
  }

  const relative = collapseSlashes(
    withoutScheme.replace(STORAGE_ROOT, "/").replace(SDCARD_ROOT, "/"),
  ).replace(/^\//, "");

  const lastSlash = relative.lastIndexOf("/");
  if (lastSlash < 0) {
    // The file is at the root of whatever volume it lives on.
    return "";
  }
  return relative.slice(0, lastSlash);
}

/**
 * Last path segment, or a friendly name for the storage root.
 */
export function folderNameFromKey(key: string): string {
  const trimmed = key.replace(/\/+$/, "");
  if (trimmed.length === 0) {
    return STORAGE_ROOT_FOLDER_NAME;
  }
  const segments = trimmed.split("/");
  return segments[segments.length - 1] || STORAGE_ROOT_FOLDER_NAME;
}

/**
 * Stand-in for the storage-root folder in a URL.
 *
 * The root folder's key is the empty string — a real folder, not an absence of
 * one — and expo-router substitutes params into the path with
 * `encodeURIComponent`, so an empty key would build `/folder/`. A trailing empty
 * segment does not match `/folder/[key]`, which would turn the root folder's
 * card into a dead tap. A visible placeholder keeps the segment non-empty and
 * cannot collide with a real key, because `~` is not a character a folder name
 * on a normalised path starts with.
 */
export const ROOT_FOLDER_ROUTE_SEGMENT = "~root";

/** Folder key → the single path segment used to open it. */
export function folderKeyToRouteSegment(key: string): string {
  return key === "" ? ROOT_FOLDER_ROUTE_SEGMENT : key;
}

/** The inverse of `folderKeyToRouteSegment`; null when the route had no key. */
export function folderKeyFromRouteSegment(segment: string | undefined): string | null {
  if (segment === undefined) {
    return null;
  }
  return segment === ROOT_FOLDER_ROUTE_SEGMENT ? "" : segment;
}

/**
 * Extracts a folder key from a SAF URI.
 *
 * `content://com.android.externalstorage.documents/tree/primary%3AMusic%2FLectures`
 * decodes to `primary:Music/Lectures`, whose volume prefix is dropped to leave
 * `Music/Lectures`. Providers that use a bare name instead of a volume prefix
 * (`…/tree/downloads`) keep it as-is.
 */
export function deriveFolderKeyFromTreeUri(treeUri: string): string | null {
  const marker = treeUri.includes("/tree/") ? "/tree/" : "/document/";
  const index = treeUri.indexOf(marker);
  if (index < 0) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(treeUri.slice(index + marker.length));
  } catch {
    // A malformed escape sequence is not worth failing the grant over.
    return null;
  }

  // Some providers append `/document/<child>` to a tree URI.
  const documentIndex = decoded.indexOf("/document/");
  if (documentIndex >= 0) {
    decoded = decoded.slice(0, documentIndex);
  }

  const colon = decoded.indexOf(":");
  const relative = colon >= 0 ? decoded.slice(colon + 1) : decoded;
  return collapseSlashes(relative).replace(/^\/+|\/+$/g, "");
}

/**
 * The file or directory name inside a SAF document URI.
 *
 * `…/tree/primary%3AMusic/document/primary%3AMusic%2FLectures%2F03.mp3` decodes
 * to `primary:Music/Lectures/03.mp3`, whose volume prefix is dropped and whose
 * last segment is the name. `readDirectoryAsync` only returns URIs, so this is
 * the only way to recover a name without a second native call.
 */
export function safDocumentName(uri: string): string | null {
  const marker = "/document/";
  const index = uri.indexOf(marker);
  const raw =
    index >= 0 ? uri.slice(index + marker.length) : uri.slice(uri.lastIndexOf("/") + 1);

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  const colon = decoded.indexOf(":");
  const relative = colon >= 0 ? decoded.slice(colon + 1) : decoded;
  const slash = relative.lastIndexOf("/");
  const name = (slash >= 0 ? relative.slice(slash + 1) : relative).trim();
  return name.length > 0 ? name : null;
}

/**
 * Compares two strings so that embedded numbers order numerically: `lecture 2`
 * sorts before `lecture 10`, which a plain lexicographic compare gets wrong and
 * which is exactly the case a lecture folder hits.
 */
export function naturalCompare(left: string, right: string): number {
  const leftParts = left.toLowerCase().match(/(\d+|\D+)/g) ?? [];
  const rightParts = right.toLowerCase().match(/(\d+|\D+)/g) ?? [];
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index];
    const b = rightParts[index];
    if (a === undefined) {
      return -1;
    }
    if (b === undefined) {
      return 1;
    }

    const aNumeric = a.charCodeAt(0) >= 48 && a.charCodeAt(0) <= 57;
    const bNumeric = b.charCodeAt(0) >= 48 && b.charCodeAt(0) <= 57;

    if (aNumeric && bNumeric) {
      const difference = Number.parseInt(a, 10) - Number.parseInt(b, 10);
      if (difference !== 0) {
        return difference;
      }
      // `02` and `2` are the same number; keep the shorter form first so the
      // result stays stable rather than depending on input order.
      if (a.length !== b.length) {
        return a.length - b.length;
      }
    } else {
      const difference = a < b ? -1 : a > b ? 1 : 0;
      if (difference !== 0) {
        return difference;
      }
    }
  }
  return 0;
}

type OrderableTrack = {
  discNumber: number | null;
  trackNumber: number | null;
  fileName: string | null;
  title: string;
};

/**
 * Playback order for a folder.
 *
 * Track numbers are used only when *every* track has one. A partially tagged
 * folder would otherwise interleave numbered and unnumbered files arbitrarily;
 * falling back to a natural filename sort keeps the whole folder coherent, and
 * is what a person who named files `03 - Foo.mp3` actually expects.
 */
export function orderFolderTracks<T extends OrderableTrack>(tracks: T[]): T[] {
  const fullyNumbered = tracks.length > 0 && tracks.every((track) => track.trackNumber !== null);
  const byName = (left: T, right: T) =>
    naturalCompare(left.fileName ?? left.title, right.fileName ?? right.title);

  return [...tracks].sort((left, right) => {
    if (fullyNumbered) {
      const disc = (left.discNumber ?? 1) - (right.discNumber ?? 1);
      if (disc !== 0) {
        return disc;
      }
      const track = (left.trackNumber ?? 0) - (right.trackNumber ?? 0);
      if (track !== 0) {
        return track;
      }
    }
    return byName(left, right);
  });
}

/**
 * Where a folder play should drop the needle: the first track that is not
 * finished. When everything is finished the folder replays from the top, which
 * is friendlier than refusing to play.
 */
export function pickFolderStartIndex(finished: readonly boolean[]): number {
  const index = finished.findIndex((isFinished) => !isFinished);
  return index < 0 ? 0 : index;
}
