"use server";

/**
 * The payment ledger, newest first.
 *
 * `pending` is the manual-provider work queue, not an error state. The page
 * filters on it rather than inventing a date range.
 */

import { requireSupport } from "@/lib/admin/guard";
import {
  parseTransaction,
  TRANSACTION_GET,
  type AdminTransaction,
} from "@/lib/admin/domain/transactions";
import { parsePaged, type Paged } from "@/lib/admin/domain/common";
import {
  boundedLimit,
  boundedPage,
  oneOf,
  TRANSACTION_STATUSES,
  trimmed,
  type AdminTransactionQuery,
} from "@/lib/admin/query";
import { callAct } from "@/lib/call-act";
import { ok, type ActResult } from "@/lib/result";

export async function adminListTransactions(
  query: AdminTransactionQuery = {},
): Promise<ActResult<Paged<AdminTransaction>>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const status = oneOf(query.status, TRANSACTION_STATUSES);
  const provider = trimmed(query.provider);
  const planCode = trimmed(query.planCode);
  const userId = trimmed(query.userId);
  const search = trimmed(query.search);

  const result = await callAct("billingTransaction", "adminListTransactions", {
    set: {
      page: boundedPage(query.page),
      limit: boundedLimit(query.limit),
      ...(status === undefined ? {} : { status }),
      ...(provider === undefined ? {} : { provider }),
      ...(planCode === undefined ? {} : { planCode }),
      ...(userId === undefined ? {} : { userId }),
      ...(search === undefined ? {} : { search }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
    },
    get: TRANSACTION_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parsePaged(result.body, parseTransaction));
}
