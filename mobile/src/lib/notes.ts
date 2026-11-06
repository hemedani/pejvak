/**
 * What the Notes screen can find, and how a note reads.
 *
 * A note is a piece of text anchored to a position inside a track, so "can I
 * find this note?" has four honest answers: by what it says, by the track it is
 * in, by the folder or collection that track sits in, and by its tags. All four
 * are indexed — a listener who remembers writing *something* about a lecture
 * has as much right to find it by the lecture as by the words.
 *
 * Tags are folded into one string because a query is a set of terms that must
 * all hit, and `#history #lecture` should be reachable by typing "history
 * lecture" in either order. The `#` itself is not searchable: the fold drops
 * punctuation-free text only, so typing one would simply match nothing.
 */

import type { AnnotationWithTrack } from "@/lib/db/types";
import type { SearchFieldName } from "@/lib/search";

export const NOTE_TITLE_FIELD = "title" as const;

export type NoteSearchField = { field: SearchFieldName; value: string | null };

export function noteSearchFields(note: AnnotationWithTrack): NoteSearchField[] {
  return [
    { field: "title", value: note.annotation.text },
    { field: "track", value: note.track.title },
    { field: "description", value: note.annotation.tags.join(" ") },
    { field: "folder", value: note.track.folderName ?? note.track.collectionTitle },
  ];
}

/** "#history #lecture", or null when the note carries no tags. */
export function describeNoteTags(tags: readonly string[]): string | null {
  const cleaned = tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  return cleaned.length > 0 ? cleaned.map((tag) => `#${tag}`).join(" ") : null;
}

/**
 * The line that says where the note lives: the track, and its container when
 * the track is inside one.
 *
 * The track always comes first — it is the thing the clock belongs to. A folder
 * that is already the track's name is not repeated.
 */
export function describeNoteOrigin(note: AnnotationWithTrack): string {
  const container = note.track.folderName ?? note.track.collectionTitle;
  if (!container || container === note.track.title) {
    return note.track.title;
  }
  return `${note.track.title} · ${container}`;
}
