import { coreApp } from "../mod.ts";
import {
  array,
  boolean,
  defaulted,
  enums,
  number,
  object,
  optional,
  string,
} from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";

/**
 * What a plan allows.
 *
 * These are the only limits the backend enforces, and each one has an
 * enforcement point named beside it. A limit with no enforcement is a paywall
 * that can be walked around, so nothing is added here speculatively.
 *
 * `-1` means unlimited. It is used instead of `null` so a comparison never has
 * to special-case a missing value, and so an admin form can show a number.
 */
export const planLimits_pure = object({
  /** Stored history rows per listener — enforced by `syncLocalData`. */
  historyEntries: defaulted(number(), 500),
  /** Whether history leaves the device at all — enforced by `syncLocalData`. */
  crossDeviceSync: defaulted(boolean(), true),
  /** Stored playlists — enforced by `createPlaylist` and `syncLocalData`. */
  playlists: defaulted(number(), 10),
  /** Stored tracks — enforced by `registerTrack`. */
  maxTracks: defaulted(number(), -1),
  /** Monthly AI credits — spent by the AI service, shown by `getMyAiUsage`. */
  aiCreditsPerMonth: defaulted(number(), 0),
});

/**
 * A purchasable tier.
 *
 * Plans live in the database rather than in code so pricing and limits can be
 * changed from the admin panel without a deploy. The two seeded rows (`free`,
 * `pro`) are a bootstrap convenience, not a hard-coded catalogue: an admin may
 * rename, reprice or archive them, and `ensureDefaultPlans` never overwrites a
 * row that already exists.
 *
 * There are no relations here. A plan is global; the link to a listener lives
 * on `subscription`, which is the only place a purchase is recorded.
 */
export const plan_pure = {
  /** Stable key the clients and subscriptions refer to: `free`, `pro`, … */
  code: string(),
  title: string(),
  description: optional(string()),
  /** Minor units (cents). `399` is $3.99. Never a float. */
  priceCents: defaulted(number(), 0),
  currency: defaulted(string(), "USD"),
  billingInterval: defaulted(
    enums(["month", "year", "lifetime"]),
    "month",
  ),
  /** Archived plans stay readable for existing subscribers but cannot be bought. */
  isActive: defaulted(boolean(), true),
  /** The plan a listener without a subscription is entitled to. */
  isDefault: defaulted(boolean(), false),
  sortOrder: defaulted(number(), 0),
  limits: planLimits_pure,
  /** Marketing copy, shown as-is by the clients. */
  features: defaulted(array(string()), []),
  ...createUpdateAt,
};

export const plan_relations = {};

export const plans = () =>
  coreApp.odm.newModel("plan", plan_pure, plan_relations, {
    createIndex: {
      indexSpec: { code: 1 },
      options: { unique: true },
    },
  });
