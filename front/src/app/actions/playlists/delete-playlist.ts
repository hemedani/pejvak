"use server";

/**
 * Removing a playlist.
 *
 * The act hard-deletes the row, scoped to the signed-in user, and returns
 * `{ success: true }`. There is no tombstone and no undo, which is why the UI
 * asks twice and says what survives: the tracks stay in the library, and their
 * history and annotations stay attached to those tracks. A run that was started
 * from this playlist keeps the title it captured at play time — history is not
 * rewritten to point at something that no longer exists.
 *
 * An invalid id is `ok(true)`: there is nothing to delete, and the page that
 * called this is already a 404.
 */

import { revalidatePath } from "next/cache";

import { callAct } from "@/lib/call-act";
import { isPlaylistId } from "@/lib/domain/playlist";
import { asRecord } from "@/lib/parse";
import { fail, ok, type ActResult } from "@/lib/result";

export async function deletePlaylist(playlistId: string): Promise<ActResult<boolean>> {
  if (!isPlaylistId(playlistId)) {
    return ok(true);
  }

  const result = await callAct("playlist", "deletePlaylist", {
    set: { playlistId },
    get: { success: 1 },
  });

  if (!result.success) {
    return result;
  }

  if (asRecord(result.body)?.success !== true) {
    // The envelope said success and the body did not confirm the deletion.
    // Treating that as done would send the listener to a list that still has
    // the card, with no explanation.
    return fail("server", "delete was not confirmed");
  }

  revalidatePath("/playlists");
  revalidatePath(`/playlists/${playlistId}`);

  return ok(true);
}
