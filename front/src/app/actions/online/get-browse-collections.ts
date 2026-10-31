"use server";

/**
 * One page of a source's shelf.
 *
 * Two search paths, on purpose. A source with its own search endpoint (the
 * archive, LibriVox, Radio Browser, aminikhaah's HTML search) answers the query
 * itself, because it knows its catalogue better than a filter over one page
 * does. A source without one is filtered locally, and that filter **folds**
 * (`lib/search.ts`) — a raw `includes()` would miss «كتاب» for «کتاب», which is
 * the same word typed on a different keyboard.
 *
 * The adapter's order is kept when there is no query. Manahej sorts by
 * episode count, the archive by downloads, aminikhaah by the site's own order;
 * re-sorting by title would replace an editorial decision with an accident.
 */

import { collectionSearchFields } from "@/lib/online/catalogue";
import { toOnlineFailure } from "@/lib/online/errors";
import { listCollections, requireSource, searchCollections } from "@/lib/online/server";
import type { OnlineCollection } from "@/lib/online/types";
import { ok, type ActResult } from "@/lib/result";
import { createSearchIndex, foldQuery, searchIndex } from "@/lib/search";

export type BrowseCollectionsInput = {
  sourceId: string;
  languageCode?: string;
  page?: number;
  limit?: number;
  query?: string;
};

export type BrowseCollectionsPage = {
  collections: OnlineCollection[];
  page: number;
  limit: number;
  hasMore: boolean;
};

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 96;
const FIELD = "title" as const;

export async function getBrowseCollections(
  input: BrowseCollectionsInput,
): Promise<ActResult<BrowseCollectionsPage>> {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)));
  const query = input.query?.trim() ?? "";

  try {
    const source = requireSource(input.sourceId);

    let collections: OnlineCollection[];
    if (query.length > 0) {
      const searched = await searchCollections(input.sourceId, query, input.languageCode);
      if (searched === null) {
        const shelf = await listCollections(input.sourceId, input.languageCode);
        const index = createSearchIndex(
          shelf,
          (collection) => collectionSearchFields(collection, source.name),
          FIELD,
        );
        collections = searchIndex(index, foldQuery(query)).map((hit) => hit.item);
      } else {
        collections = searched;
      }
    } else {
      collections = await listCollections(input.sourceId, input.languageCode);
    }

    const start = (page - 1) * limit;
    return ok({
      collections: collections.slice(start, start + limit),
      page,
      limit,
      hasMore: page * limit < collections.length,
    });
  } catch (error) {
    return toOnlineFailure(error);
  }
}

// A source that is not registered is a bad URL, not a server fault. `requireSource`
// throws `not_found`, which `toOnlineFailure` maps to `validation`; keeping the
// explicit guard here documents the one case a caller may hit by hand.
export async function isKnownSource(sourceId: string): Promise<boolean> {
  try {
    requireSource(sourceId);
    return true;
  } catch {
    return false;
  }
}
