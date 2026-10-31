"use server";

/**
 * The listener's runs, newest first.
 *
 * `getMyPlaybackContexts` returns a bare array already sorted newest-first;
 * re-sorting here would make Continue disagree with the act about what "recent"
 * means. The projection asks for exactly the fields the shelf and the resume
 * rule read.
 */

import { callAct } from "@/lib/call-act";
import {
  parsePlaybackContextRows,
  PLAYBACK_CONTEXT_GET,
} from "@/lib/domain/online";
import type { PlaybackContextRow } from "@/lib/online/types";
import { ok, type ActResult } from "@/lib/result";

export type ContextsInput = {
  contextType?: "online" | "playlist";
  contextKey?: string;
  page?: number;
  limit?: number;
};

const DEFAULT_LIMIT = 36;

export async function getMyContexts(
  input: ContextsInput = {},
): Promise<ActResult<PlaybackContextRow[]>> {
  const result = await callAct("playbackContext", "getMyPlaybackContexts", {
    set: {
      page: Math.max(1, Math.floor(input.page ?? 1)),
      limit: Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)),
      ...(input.contextType === undefined ? {} : { contextType: input.contextType }),
      ...(input.contextKey === undefined ? {} : { contextKey: input.contextKey }),
    },
    get: PLAYBACK_CONTEXT_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parsePlaybackContextRows(result.body));
}
