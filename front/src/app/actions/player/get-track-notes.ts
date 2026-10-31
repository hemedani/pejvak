"use server";

/**
 * This track's notes, through `getTrackDetail`'s embedded relation.
 *
 * `getMyAnnotations` takes no `trackId`, so it cannot answer this question
 * (plan §8). The relation is bounded at 1000 and sorted by `positionSec`, which
 * is exactly a marker row, and this action asks for those fields only.
 */

import { callAct } from "@/lib/call-act";
import { ANNOTATION_GET, parseAnnotationList, type Annotation } from "@/lib/domain/annotation";
import { ok, type ActResult } from "@/lib/result";

/** Mongo's ObjectId as it appears in a URL. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export async function getTrackNotes(trackId: string): Promise<ActResult<Annotation[]>> {
  if (!OBJECT_ID.test(trackId)) {
    return ok([]);
  }

  const result = await callAct("track", "getTrackDetail", {
    set: { trackId },
    get: { annotations: ANNOTATION_GET },
  });

  if (!result.success) {
    return result;
  }

  const body = result.body;
  const annotations =
    body && typeof body === "object" && "annotations" in body
      ? parseAnnotationList((body as { annotations?: unknown }).annotations)
      : [];

  return ok(annotations);
}
