"use server";

/**
 * The operator activity feed, newest first.
 *
 * Filters are exact matches, not a search box: `action` is a closed vocabulary
 * and `targetId` is how a user page answers "what was done to this account?".
 * `metadata` stays a JSON string on the wire and is parsed for display only.
 */

import { requireSupport } from "@/lib/admin/guard";
import { parseAuditLog, AUDIT_GET, type AdminAuditLog } from "@/lib/admin/domain/audit";
import { parsePaged, type Paged } from "@/lib/admin/domain/common";
import {
  boundedLimit,
  boundedPage,
  trimmed,
  type AdminAuditQuery,
} from "@/lib/admin/query";
import { callAct } from "@/lib/call-act";
import { ok, type ActResult } from "@/lib/result";

export async function adminListAuditLogs(
  query: AdminAuditQuery = {},
): Promise<ActResult<Paged<AdminAuditLog>>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const actorId = trimmed(query.actorId);
  const action = trimmed(query.action);
  const targetType = trimmed(query.targetType);
  const targetId = trimmed(query.targetId);

  const result = await callAct("adminAuditLog", "adminListAuditLogs", {
    set: {
      page: boundedPage(query.page),
      limit: boundedLimit(query.limit),
      ...(actorId === undefined ? {} : { actorId }),
      ...(action === undefined ? {} : { action }),
      ...(targetType === undefined ? {} : { targetType }),
      ...(targetId === undefined ? {} : { targetId }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
    },
    get: AUDIT_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parsePaged(result.body, parseAuditLog));
}
