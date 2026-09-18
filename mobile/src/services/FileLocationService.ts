/**
 * Whether a track's recorded location still resolves to a file.
 *
 * This is the one question that separates "you already have this" from "this is
 * the file you lost". A scan only ever sees files that *exist*, so a library row
 * whose file moved or was deleted is invisible to it: the planner can match the
 * incoming file's content hash against the row, but nothing in that comparison
 * says whether the row's own path is still good. The only way to find out is to
 * go and look.
 *
 * Without it, a moved file is indistinguishable from a second copy — the planner
 * says "duplicate" and skips it, which strands the sessions and notes hanging off
 * the row that should have been re-pointed.
 */

import { getInfoAsync } from "expo-file-system/legacy";

/**
 * `false` only when the location is positively known to be gone.
 *
 * Conservative on purpose. `getInfoAsync` resolves `{ exists: false }` for a
 * missing item, so a *throw* means the check itself failed — an unavailable
 * native module, a revoked grant, a URI shape this platform will not stat —
 * rather than that the file is missing. Reporting "gone" there would re-point
 * rows on a device where the check is simply broken, so an error is reported as
 * reachable and the row is left alone. The cost of that choice is a relink the
 * listener has to trigger by scanning again; the cost of the other is silently
 * moving rows that were never lost.
 *
 * A null URI is the one case that is not a guess: there is nothing to reach.
 */
async function isLocationReachable(uri: string | null | undefined): Promise<boolean> {
  if (!uri) {
    return false;
  }
  try {
    const info = await getInfoAsync(uri);
    return info.exists;
  } catch {
    return true;
  }
}

export const FileLocationService = {
  isLocationReachable,
};

export { isLocationReachable };
