import { coreApp } from "../mod.ts";
import {
  boolean,
  defaulted,
  enums,
  number,
  object,
  optional,
  type RelationDataType,
  type RelationSortOrderType,
  string,
} from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";
import { user_excludes } from "./excludes.ts";

/**
 * A listener's entitlement to a plan.
 *
 * This row is the single source of truth for "is this account paid?". Nothing
 * denormalises the plan onto `User`: a copy would have to be kept in step with
 * every grant, refund and expiry, and the first missed update would leave a
 * listener with two answers.
 *
 * A listener with **no row** is on the default (free) plan — absence is the
 * free tier, not a missing record to be repaired. That keeps registration free
 * of billing writes and means a plan change needs no backfill.
 *
 * `status` is not trusted on its own: `resolveEntitlement` also compares
 * `currentPeriodEnd` with the clock, so a row that was never swept still
 * expires. Expiry is written lazily on the next read rather than by a cron,
 * because there is no scheduler in this deployment.
 */
export const subscription_pure = {
  planCode: string(),
  status: defaulted(
    enums(["active", "trialing", "past_due", "canceled", "expired"]),
    "active",
  ),
  /** Epoch ms. Periods are stored as numbers everywhere in this project. */
  startedAt: number(),
  currentPeriodStart: number(),
  /** Absent for a lifetime grant — there is nothing to expire. */
  currentPeriodEnd: optional(number()),
  /** Set by `cancelMySubscription`: the paid time is honoured to the end. */
  cancelAtPeriodEnd: defaulted(boolean(), false),
  canceledAt: optional(number()),
  /** `manual` for an admin grant, otherwise the payment provider's name. */
  provider: defaulted(string(), "manual"),
  /** The provider's own id, kept for reconciliation with their dashboard. */
  providerRef: optional(string()),
  autoRenew: defaulted(boolean(), true),
  /** Free text an admin may attach to a grant ("support goodwill", …). */
  note: optional(string()),
  /**
   * How an admin comped this account.
   *
   * Absent on a normal purchase. `forever` never expires; `duration` expires at
   * `currentPeriodEnd`; `usage` ends as soon as one of `usageCaps` is reached.
   */
  grantMode: optional(enums(["forever", "duration", "usage"])),
  /**
   * Absolute ceilings on individual resources for a `usage` grant. A cap
   * replaces that resource's plan limit; resources without a cap keep the
   * plan's limit. Caps are stock thresholds, not deltas: `historyEntries: 15000`
   * means 15,000 stored sessions in total.
   */
  usageCaps: optional(
    object({
      historyEntries: optional(number()),
      playlists: optional(number()),
      maxTracks: optional(number()),
    }),
  ),
  ...createUpdateAt,
};

export const subscription_relations = {
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      subscriptions: {
        type: "multiple" as RelationDataType,
        limit: 20,
        sort: {
          field: "_id",
          order: "desc" as RelationSortOrderType,
        },
      },
    },
  },
};

export const subscriptions = () =>
  coreApp.odm.newModel(
    "subscription",
    subscription_pure,
    subscription_relations,
    {
      createIndex: {
        // Looked up by listener on every entitlement check.
        indexSpec: { "user._id": 1 },
        options: {},
      },
    },
  );
