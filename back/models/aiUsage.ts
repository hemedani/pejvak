import { coreApp } from "../mod.ts";
import {
  defaulted,
  number,
  optional,
  type RelationDataType,
  type RelationSortOrderType,
  string,
} from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";
import { user_excludes } from "./excludes.ts";

/**
 * One meter per listener per billing period.
 *
 * AI features are sold by allowance rather than per request, so what has to be
 * counted is "credits spent this month". The period is stored as a key
 * (`2026-11`) rather than derived from a timestamp: a request that lands at
 * 23:59:59 on the last day of a month must be charged to that month even if the
 * write commits a second later.
 *
 * `bonusCredits` is separate from the plan allowance so a goodwill grant can be
 * added by an admin without editing the plan, and so a plan change does not
 * erase credits already paid for.
 */
export const aiUsage_pure = {
  /** `YYYY-MM`, UTC. The meter resets by opening a new row, never by $set 0. */
  periodKey: string(),
  creditsUsed: defaulted(number(), 0),
  bonusCredits: defaulted(number(), 0),
  requestCount: defaulted(number(), 0),
  lastUsedAt: optional(number()),
  ...createUpdateAt,
};

export const aiUsage_relations = {
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      aiUsage: {
        type: "multiple" as RelationDataType,
        limit: 24,
        sort: {
          field: "periodKey",
          order: "desc" as RelationSortOrderType,
        },
      },
    },
  },
};

export const aiUsages = () =>
  coreApp.odm.newModel("aiUsage", aiUsage_pure, aiUsage_relations, {
    createIndex: {
      // One row per listener per period; a double write must not double-charge.
      indexSpec: { "user._id": 1, periodKey: 1 },
      options: { unique: true },
    },
  });
