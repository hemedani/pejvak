"use server";

/**
 * A listener's history, as an operator reads it.
 *
 * The act sorts by `startedAt`, not `_id`: an offline week uploads as one batch,
 * so insertion order says when the phone synced, not when the listening
 * happened. `from`/`to` and `contentHash` are the act's own filters.
 */

import { requireSupport } from "@/lib/admin/guard";
import {
  parseUserHistoryRow,
  USER_HISTORY_GET,
  type UserSessionRow,
} from "@/lib/admin/domain/users";
import { parsePaged, type Paged } from "@/lib/admin/domain/common";
import { boundedLimit, boundedPage, trimmed } from "@/lib/admin/query";
import { callAct } from "@/lib/call-act";
import { ok, type ActResult } from "@/lib/result";

export type UserHistoryInput = {
  page?: number;
  limit?: number;
  from?: number;
  to?: number;
  contentHash?: string;
};

export async function adminGetUserHistory(
  userId: string,
  input: UserHistoryInput = {},
): Promise<ActResult<Paged<UserSessionRow>>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const contentHash = trimmed(input.contentHash);

  const result = await callAct("user", "adminGetUserHistory", {
    set: {
      userId,
      page: boundedPage(input.page),
      limit: boundedLimit(input.limit),
      ...(input.from === undefined ? {} : { from: input.from }),
      ...(input.to === undefined ? {} : { to: input.to }),
      ...(contentHash === undefined ? {} : { contentHash }),
    },
    get: USER_HISTORY_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parsePaged(result.body, parseUserHistoryRow));
}
