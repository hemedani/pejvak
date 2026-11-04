import { plan } from "../../mod.ts";
import { FREE_PLAN_CODE, PRO_PLAN_CODE } from "./codes.ts";

/**
 * The two plans every deployment starts with.
 *
 * They are rows, not constants: pricing and limits are meant to be changed from
 * the admin panel. This list is only what a fresh database is seeded with, and
 * `ensureDefaultPlans` inserts a row **only when its code is absent**, so an
 * admin who reprices Pro or archives Free is never undone by a restart.
 *
 * Free is capped at 500 stored history rows and keeps cross-device sync on:
 * the cap is what the paywall sells, not the sync itself, and switching sync
 * off for free listeners would break the product's promise that history
 * survives a reinstall.
 */
export const DEFAULT_PLANS = [
  {
    code: FREE_PLAN_CODE,
    title: "Free",
    description: "Your library, 500 history entries and sync across devices.",
    priceCents: 0,
    currency: "USD",
    billingInterval: "month" as const,
    isActive: true,
    isDefault: true,
    sortOrder: 0,
    limits: {
      historyEntries: 500,
      crossDeviceSync: true,
      playlists: 10,
      maxTracks: -1,
      aiCreditsPerMonth: 0,
    },
    features: [
      "Unlimited local playback",
      "500 synced history entries",
      "Annotations and playlists",
    ],
  },
  {
    code: PRO_PLAN_CODE,
    title: "Pro",
    description: "Unlimited history, unlimited playlists and AI credits.",
    priceCents: 399,
    currency: "USD",
    billingInterval: "month" as const,
    isActive: true,
    isDefault: false,
    sortOrder: 10,
    limits: {
      historyEntries: -1,
      crossDeviceSync: true,
      playlists: -1,
      maxTracks: -1,
      aiCreditsPerMonth: 100,
    },
    features: [
      "Unlimited synced history",
      "Unlimited playlists",
      "100 AI credits per month",
      "Priority support",
    ],
  },
];

export const ensureDefaultPlans = async () => {
  for (const definition of DEFAULT_PLANS) {
    const existing = await plan.findOne({
      filters: { code: definition.code },
      projection: { _id: 1 },
    });

    // Never update: a reprice or an archived plan is an admin decision, and a
    // restart must not silently revert it.
    if (existing) continue;

    await plan.insertOne({
      doc: { ...definition, createdAt: new Date(), updatedAt: new Date() },
      projection: { _id: 1 },
    });
  }
};
