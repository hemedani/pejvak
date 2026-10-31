"use server";

/**
 * A new, empty playlist.
 *
 * Identity is `_id`, so two playlists may share a title — nothing here dedupes
 * by name, and the list will happily show «صبح‌ها» twice. That is correct: a
 * listener who names two things the same has two things.
 *
 * `isPublic` and `description` are never sent. The model has both, mobile never
 * offers either, and this phase does not invent a publishing surface.
 */

import { revalidatePath } from "next/cache";

import { callAct } from "@/lib/call-act";
import { parsePlaylist, PLAYLIST_GET, type Playlist } from "@/lib/domain/playlist";
import { PLAYLIST_TITLE_MAX } from "@/lib/domain/playlist-query";
import { fail, ok, type ActResult } from "@/lib/result";

export async function createPlaylist(
  input: { title: string },
): Promise<ActResult<Playlist | null>> {
  const title = input.title.trim();

  // Checked before the call: a round trip to be told the field is empty is a
  // slow way to say something the form already knew.
  if (title.length === 0) {
    return fail("validation", "playlist title is required");
  }
  if (title.length > PLAYLIST_TITLE_MAX) {
    return fail("validation", "playlist title is too long");
  }

  const result = await callAct("playlist", "createPlaylist", {
    set: { title },
    get: PLAYLIST_GET,
  });

  if (!result.success) {
    return result;
  }

  const playlist = parsePlaylist(result.body);

  revalidatePath("/playlists");

  if (playlist === null) {
    // The act answered, but the row it returned cannot be read. Reporting that
    // is honest; inventing a row would make the card and the next list read
    // disagree about what exists.
    return fail("server", "created playlist could not be read");
  }

  return ok(playlist);
}
