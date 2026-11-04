import { type ActFn, ObjectId } from "lesan";
import { aiUsage, user } from "../../../../mod.ts";
import { pickByGet, throwError } from "@lib";
import { recordAudit } from "../../audit.ts";
import { currentPeriodKey } from "../../../ai/period.ts";

/**
 * Adds credits to a listener's month, outside their plan.
 *
 * A bonus pool rather than an edit to `creditsUsed`: lowering the used count
 * would make the meter say they consumed less than they did, and the next
 * report would be wrong. Adding to the pool keeps consumption as a fact and the
 * grant as a separate fact, which is also what makes it auditable.
 *
 * The row is created if this is the listener's first AI activity in the period;
 * a unique index on (user, period) means two concurrent grants cannot create
 * two rows — the loser falls back to the increment.
 */
export const adminGrantAiCreditsFn: ActFn = async (body) => {
  const { set } = body.details;
  const userId = new ObjectId(set.userId);
  const periodKey = set.periodKey ?? currentPeriodKey();
  const credits = Math.trunc(set.credits);

  if (credits <= 0) throwError("Credits must be a positive whole number");

  const target = await user.findOne({
    filters: { _id: userId },
    projection: { _id: 1, email: 1 },
  });
  if (!target) throwError("User not found");

  const existing = await aiUsage.findOne({
    filters: { "user._id": userId, periodKey },
    projection: { _id: 1, bonusCredits: 1 },
  });

  if (existing) {
    await aiUsage.findOneAndUpdate({
      filter: { _id: existing._id },
      update: {
        $inc: { bonusCredits: credits },
        $set: { updatedAt: new Date() },
      },
      projection: { _id: 1 },
    });
  } else {
    try {
      await aiUsage.insertOne({
        doc: {
          periodKey,
          creditsUsed: 0,
          bonusCredits: credits,
          requestCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        relations: {
          user: { _ids: userId, relatedRelations: { aiUsage: true } },
        } as never,
        projection: { _id: 1 },
      });
    } catch {
      // Another grant created the row first; add to it instead of failing.
      await aiUsage.findOneAndUpdate({
        filter: { "user._id": userId, periodKey },
        update: {
          $inc: { bonusCredits: credits },
          $set: { updatedAt: new Date() },
        },
        projection: { _id: 1 },
      });
    }
  }

  const after = await aiUsage.findOne({
    filters: { "user._id": userId, periodKey },
    projection: { creditsUsed: 1, bonusCredits: 1 },
  });

  await recordAudit({
    action: "ai.grantCredits",
    targetType: "aiUsage",
    targetId: String(userId),
    summary: `Granted ${credits} AI credits to ${
      target!.email
    } for ${periodKey}`,
    metadata: {
      credits,
      periodKey,
      note: set.note ?? null,
      bonusCreditsAfter: after?.bonusCredits ?? credits,
    },
  });

  return pickByGet({
    userId: String(userId),
    periodKey,
    granted: credits,
    bonusCredits: after?.bonusCredits ?? credits,
    creditsUsed: after?.creditsUsed ?? 0,
  }, body.details.get);
};
