"use server";

/**
 * Remove a collection from the saved shelf.
 *
 * Distinct from un-favouriting, which is `saveOnlineCollection({ isFavorite:
 * false })`: the listener may want to keep a collection in Continue without a
 * heart on it. Removal deletes the saved row, so the UI asks first.
 */

import { callAct } from "@/lib/call-act";
import { findSource } from "@/lib/online/catalogue";
import { fail, ok, type ActResult } from "@/lib/result";

export async function removeOnlineCollection(input: {
  sourceId: string;
  externalId: string;
}): Promise<ActResult<null>> {
  if (!findSource(input.sourceId) || !input.externalId.trim()) {
    return fail("validation", "That collection is not one this app can remove.", {
      code: "not_found",
    });
  }

  const result = await callAct("onlineCollection", "removeOnlineCollection", {
    set: { sourceId: input.sourceId, externalId: input.externalId },
    get: { success: 1 },
  });

  if (!result.success) {
    return result;
  }
  return ok(null);
}
