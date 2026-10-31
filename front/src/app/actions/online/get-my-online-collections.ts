"use server";

/**
 * The listener's saved shelf.
 *
 * A bare array, no total (the act ends in `.toArray()`), so "is there another
 * page?" is answered by a full page — the same honest rule the library list
 * uses. A total would need a second act and would become a second source of
 * truth for how many rows exist.
 *
 * The row's `key` is rebuilt from `sourceId:externalId`; `clientId` is not
 * trusted for it, because the key is what the player puts into a run.
 */

import { callAct } from "@/lib/call-act";
import {
  ONLINE_COLLECTION_GET,
  parseOnlineCollectionRows,
} from "@/lib/domain/online";
import type { OnlineCollectionRow } from "@/lib/online/types";
import { ok, type ActResult } from "@/lib/result";

export type SavedCollectionsInput = {
  isFavorite?: boolean;
  sourceId?: string;
  languageCode?: string;
  sortBy?: "updatedAt" | "lastOpenedAt" | "title";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type SavedCollectionsPage = {
  collections: OnlineCollectionRow[];
  page: number;
  limit: number;
  hasMore: boolean;
};

const DEFAULT_LIMIT = 24;

export async function getMyOnlineCollections(
  input: SavedCollectionsInput = {},
): Promise<ActResult<SavedCollectionsPage>> {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));

  const result = await callAct("onlineCollection", "getMyOnlineCollections", {
    set: {
      page,
      limit,
      ...(input.isFavorite === undefined ? {} : { isFavorite: input.isFavorite }),
      ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
      ...(input.languageCode === undefined ? {} : { languageCode: input.languageCode }),
      ...(input.sortBy === undefined ? {} : { sortBy: input.sortBy }),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
    },
    get: ONLINE_COLLECTION_GET,
  });

  if (!result.success) {
    return result;
  }

  const collections = parseOnlineCollectionRows(result.body);
  return ok({
    collections,
    page,
    limit,
    hasMore: collections.length >= limit,
  });
}
