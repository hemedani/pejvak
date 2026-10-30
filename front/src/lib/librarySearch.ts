/**
 * What the library's search can find, in the app's own terms.
 *
 * `lib/search.ts` is deliberately generic — folding, ranking, highlighting, and
 * nothing about tracks. This module is the other half: it says which of a
 * track's fields are worth searching and what to call them, so the screen only
 * has to hand over its data.
 *
 * Ported from `mobile/src/lib/librarySearch.ts`, narrowed to the fields the
 * *server* actually has. The phone can search `fileName` and `sourcePath`
 * because it owns the files; a web track row has neither (plan §2 C2), and
 * indexing a field that is always `null` would be a filter that silently does
 * nothing.
 */

import type { TrackSummary } from "./domain/track";
import type { SearchFieldName } from "./search";

/**
 * The field a row *displays*.
 *
 * A track's title is the same slot on screen as a folder's name, so they are the
 * same field here — which is what lets one ranking rule serve both, and lets a
 * title match always outrank a match the listener cannot see.
 */
export const TITLE_FIELD = "title" as const;

export type SearchableField = { field: SearchFieldName; value: string | null };

/**
 * A track, by everything a listener might remember about it.
 *
 * `collectionTitle` stands in for the folder: a downloaded course keeps its
 * collection instead of a directory, and "which course was this in" is the
 * question the field answers. A track's `contentHash` is deliberately absent —
 * it is how the app identifies a track, not how a person does.
 */
export function trackSearchFields(track: TrackSummary): SearchableField[] {
  return [
    { field: "title", value: track.title },
    { field: "author", value: track.author },
    { field: "narrator", value: track.narrator },
    { field: "folder", value: track.collectionTitle },
  ];
}
