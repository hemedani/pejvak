"use server";

/**
 * Upsert one collection onto the listener's shelf.
 *
 * Three rules come straight from the backend validator, and each is a bug the
 * web would otherwise ship:
 *
 *   · **`updatedAt` is the server's clock.** A browser whose clock is an hour
 *     fast would win last-write-wins over a fresh edit from the phone.
 *   · **`clientId` is never sent.** The backend derives it from `sourceId` and
 *     `externalId`; a client-chosen one could disagree with the run's
 *     `contextKey`.
 *   · **It is an upsert.** Favouriting twice leaves one row.
 *
 * `lastOpenedAt` is omitted when the caller did not ask to touch it. Sending
 * "now" on every save would move a favourite to the top of Continue merely
 * because the heart was tapped.
 */

import { callAct } from "@/lib/call-act";
import { ONLINE_COLLECTION_GET, parseOnlineCollectionRow } from "@/lib/domain/online";
import { findSource } from "@/lib/online/catalogue";
import { isValidExternalId } from "@/lib/online/registry";
import type { OnlineCollection, OnlineCollectionRow } from "@/lib/online/types";
import { fail, ok, type ActResult } from "@/lib/result";

export type SaveOnlineCollectionInput = {
  collection: Pick<
    OnlineCollection,
    "sourceId" | "externalId" | "title" | "languageCode" | "trackCount"
  > &
    Partial<Pick<OnlineCollection, "subtitle" | "artworkUrl" | "pageUrl">>;
  isFavorite?: boolean;
  /** Defaults to the moment the action runs. Do not send a client clock. */
  lastOpenedAt?: number;
};

export async function saveOnlineCollection(
  input: SaveOnlineCollectionInput,
): Promise<ActResult<OnlineCollectionRow>> {
  const { collection } = input;
  if (!findSource(collection.sourceId)) {
    return fail("validation", "That source is not registered.", { code: "not_found" });
  }
  if (!isValidExternalId(collection.sourceId, collection.externalId)) {
    return fail("validation", "That collection id is not one this source issues.", {
      code: "not_found",
    });
  }
  if (!collection.title.trim() || !collection.languageCode) {
    return fail("validation", "A saved collection needs a title and a language.");
  }

  const result = await callAct("onlineCollection", "saveOnlineCollection", {
    set: {
      sourceId: collection.sourceId,
      externalId: collection.externalId,
      title: collection.title,
      languageCode: collection.languageCode,
      trackCount: Math.max(0, Math.round(collection.trackCount)),
      ...(collection.subtitle ? { subtitle: collection.subtitle } : {}),
      ...(collection.artworkUrl ? { artworkUrl: collection.artworkUrl } : {}),
      ...(collection.pageUrl ? { pageUrl: collection.pageUrl } : {}),
      ...(input.isFavorite === undefined ? {} : { isFavorite: input.isFavorite }),
      ...(input.lastOpenedAt === undefined ? {} : { lastOpenedAt: input.lastOpenedAt }),
      updatedAt: Date.now(),
    },
    get: ONLINE_COLLECTION_GET,
  });

  if (!result.success) {
    return result;
  }

  const row = parseOnlineCollectionRow(result.body);
  if (!row) {
    return fail("server", "The backend accepted the save but returned no collection.");
  }
  return ok(row);
}
