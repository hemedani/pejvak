"use server";

/**
 * Delete a synced note.
 *
 * A failed call is not fatal: the client keeps a tombstone with `deleted: true`
 * and the same `clientId`, and `syncLocalData` resolves it. This action is the
 * fast path, not the only path.
 */

import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export async function deleteNote(annotationId: string): Promise<ActResult<boolean>> {
  if (!OBJECT_ID.test(annotationId)) {
    return fail("validation", "A note needs a server id before it can be deleted.");
  }

  const result = await callAct("annotation", "deleteAnnotation", {
    set: { annotationId },
    get: { success: 1 },
  });

  if (!result.success) {
    return result;
  }

  return ok(true);
}
