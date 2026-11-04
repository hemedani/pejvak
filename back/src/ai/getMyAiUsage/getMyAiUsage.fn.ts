import { type ActFn, ObjectId } from "lesan";
import { aiUsage } from "../../../mod.ts";
import { currentUser, pickByGet } from "@lib";
import { readPlatformSetting } from "../../platform/setting.ts";
import { resolveEntitlement } from "../../entitlements/entitlement.ts";
import { currentPeriodKey } from "../period.ts";

/**
 * The meter the AI features will spend against.
 *
 * Shipped before the features themselves on purpose: a paid allowance that is
 * introduced in the same release as the feature has no history, and no way to
 * answer "how many credits did this person have left when they complained?".
 * The row is created on first spend, so a listener who never uses AI costs
 * nothing here.
 *
 * `enabled` comes from the platform switch, not from the plan: the plan says
 * how much you bought, the switch says whether the feature exists yet.
 */
export const getMyAiUsageFn: ActFn = async (body) => {
  const user = currentUser();
  const userId = new ObjectId(user._id);
  const periodKey = body.details.set.periodKey ?? currentPeriodKey();

  const [entitlement, setting, row] = await Promise.all([
    resolveEntitlement(userId),
    readPlatformSetting(),
    aiUsage.findOne({
      filters: { "user._id": userId, periodKey },
      projection: {
        creditsUsed: 1,
        bonusCredits: 1,
        requestCount: 1,
        lastUsedAt: 1,
      },
    }),
  ]);

  const allowance = entitlement.limits.aiCreditsPerMonth;
  const bonusCredits = row?.bonusCredits ?? 0;
  const used = row?.creditsUsed ?? 0;

  return pickByGet({
    periodKey,
    enabled: setting.aiEnabled,
    planCode: entitlement.planCode,
    allowance,
    bonusCredits,
    used,
    remaining: Math.max(0, allowance + bonusCredits - used),
    requestCount: row?.requestCount ?? 0,
    lastUsedAt: row?.lastUsedAt ?? null,
  }, body.details.get);
};
