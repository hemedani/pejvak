/**
 * What the Library's search can find, in the app's own terms.
 *
 * `lib/search.ts` is deliberately generic — it knows about folding, ranking and
 * highlighting, and nothing about tracks. This module is the other half: it says
 * which of a row's fields are worth searching and what to call them, so the
 * screen only has to hand over its data.
 *
 * It lives apart from the screen for one reason: "can I find this file by the
 * folder it sits in?" is a product decision, and a product decision buried in a
 * `renderItem` cannot be tested. Here it is one exported function per entity,
 * and a test asserts the answers.
 */

import type { FolderSummary, LocalPlaylist, LocalTrack } from "@/lib/db/types";
import type { RecentPlay } from "@/lib/recentPlays";
import type { SearchFieldName } from "@/lib/search";

/**
 * The field a row *displays*.
 *
 * A folder's name and a track's title are the same slot on screen, so they are
 * the same field here — which is what lets one ranking rule serve both, and
 * lets a title match always outrank a match the listener cannot see.
 */
export const TITLE_FIELD = "title" as const;

export type SearchableField = { field: SearchFieldName; value: string | null };

/**
 * A track, by everything a listener might remember about it.
 *
 * The brief asks for "music *and files*", so this is not just the tags: a file
 * whose tags were never filled in is still findable by its name on disk and by
 * the folder it lives in. `sourcePath` is the full device path, which is what
 * someone who copied the file in themselves will recognise.
 *
 * Two fields are deliberately absent. `streamUrl` is signed and expiring — it
 * is how to reach the audio right now, not what the audio is, so indexing it
 * would put a changing token in the results. And an online track's own
 * `collectionKey` (`manahej:190`) is a key the listener has never seen; its
 * *title* is indexed instead, under `folder`.
 */
export function trackSearchFields(track: LocalTrack): SearchableField[] {
  return [
    { field: "title", value: track.title },
    { field: "author", value: track.author },
    { field: "album", value: track.album },
    { field: "narrator", value: track.narrator },
    { field: "fileName", value: track.fileName },
    // A downloaded course keeps its `folderName` empty and knows its collection
    // instead, so the container is whichever of the two exists.
    { field: "folder", value: track.folderName ?? track.collectionTitle },
    { field: "path", value: track.folderKey ?? track.sourcePath },
  ];
}

/**
 * A folder, by its name and its path.
 *
 * The path matters more than it looks: a listener with `Lectures/Physics` and
 * `Lectures/Chemistry` on the device sees two rows both named `Lectures` in
 * some views, and the path is the only thing that tells them apart. The storage
 * root's key is `""` — an empty string, not a name — and `createSearchIndex`
 * drops it, so the root folder is found by its name alone.
 */
export function folderSearchFields(folder: FolderSummary): SearchableField[] {
  return [
    { field: "title", value: folder.name },
    { field: "path", value: folder.key },
  ];
}

/** A playlist, by its title and the description the listener wrote for it. */
export function playlistSearchFields(playlist: LocalPlaylist): SearchableField[] {
  return [
    { field: "title", value: playlist.title },
    { field: "description", value: playlist.description },
  ];
}

/**
 * A Recent row, by whatever that row actually is.
 *
 * The Recent tab is a union of three kinds, and each branch carries a different
 * thing: a folder has progress, a playlist has a description, a track has tags.
 * Searching it by the *other* branches' fields would be searching fields the
 * row does not have.
 */
export function recentSearchFields(play: RecentPlay): SearchableField[] {
  switch (play.kind) {
    case "folder":
      return folderSearchFields(play.folder);
    case "playlist":
      return playlistSearchFields(play.playlist);
    case "track":
      return trackSearchFields(play.track);
  }
}
