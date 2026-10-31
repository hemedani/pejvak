"use server";

/**
 * Update a synced note in place.
 *
 * The backend names the row `annotationId` (not `_id`) — a field rename that is
 * invisible until the call fails. The id is validated before the round trip so a
 * stale local id becomes a clean validation result rather than a page error.
 */

import { callAct } from "@/lib/call-act";
import { ANNOTATION_GET, parseAnnotation, type Annotation } from "@/lib/domain/annotation";
import { fail, ok, type ActResult } from "@/lib/result";

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export async function updateNote(input: {
  annotationId: string;
  text: string;
  tags: string[];
  color: string | null;
  updatedAt: number;
}): Promise<ActResult<Annotation | null>> {
  if (!OBJECT_ID.test(input.annotationId)) {
    return fail("validation", "A note needs a server id before it can be edited.");
  }

  const result = await callAct("annotation", "updateAnnotation", {
    set: {
      annotationId: input.annotationId,
      text: input.text,
      tags: input.tags,
      ...(input.color === null ? {} : { color: input.color }),
      updatedAt: Math.round(input.updatedAt),
    },
    get: ANNOTATION_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parseAnnotation(result.body));
}
