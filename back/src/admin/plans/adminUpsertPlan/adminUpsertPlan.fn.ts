import { type ActFn } from "lesan";
import { plan, subscription } from "../../../../mod.ts";
import { throwError } from "@lib";
import { recordAudit } from "../../audit.ts";
import { canonicalLimits } from "../../../entitlements/entitlement.ts";

const assertLimit = (value: number, name: string) => {
  if (value < -1) {
    throwError(`${name} must be -1 (unlimited) or a number of zero or more`);
  }
};

/**
 * Creates or edits a plan.
 *
 * Limits are merged rather than replaced, and `-1` is the only negative value
 * allowed: the entitlement layer treats a negative limit as "unlimited", so a
 * typo like `-5` would silently mean the same thing as `-1` and hide the
 * mistake. Refusing it keeps one meaning per number.
 *
 * Marking a plan as default clears the flag on the others in the same request.
 * Exactly one default matters: it is what a listener with no subscription is
 * entitled to, and two defaults would make that answer depend on document
 * order.
 */
export const adminUpsertPlanFn: ActFn = async (body) => {
  const { set, get } = body.details;

  if (set.priceCents !== undefined && set.priceCents < 0) {
    throwError("priceCents cannot be negative");
  }

  const existing = await plan.findOne({
    filters: { code: set.code },
    projection: { _id: 1, isDefault: 1, limits: 1, title: 1 },
  });

  const providedLimits = set.limits ?? {};
  for (const [name, value] of Object.entries(providedLimits)) {
    if (typeof value === "number") assertLimit(value, `limits.${name}`);
  }

  const mergedLimits = {
    ...canonicalLimits(existing?.limits),
    ...providedLimits,
  };

  if (!existing && !set.title) {
    throwError("A new plan needs a title");
  }

  if (existing?.isDefault && set.isDefault === false) {
    throwError("Mark another plan as the default before unsetting this one");
  }

  // Archiving a plan that still has subscribers would leave those listeners on
  // a tier that can no longer be described. They have to be moved or revoked
  // first — the same reasoning as refusing to delete the last admin.
  if (existing && set.isActive === false) {
    const subscribers = await subscription.countDocument({
      filter: {
        planCode: set.code,
        status: { $in: ["active", "trialing"] },
        $or: [
          { currentPeriodEnd: { $exists: false } },
          { currentPeriodEnd: { $gt: Date.now() } },
        ],
      },
    });

    if (subscribers > 0) {
      throwError(
        `This plan still has ${subscribers} active subscriber(s). Move or revoke them before archiving it.`,
      );
    }
  }

  const now = new Date();
  const fields: Record<string, unknown> = {
    limits: mergedLimits,
    updatedAt: now,
  };

  for (
    const key of [
      "title",
      "description",
      "priceCents",
      "currency",
      "billingInterval",
      "isActive",
      "isDefault",
      "sortOrder",
      "features",
    ] as const
  ) {
    if (set[key] !== undefined) fields[key] = set[key];
  }

  if (existing) {
    await plan.findOneAndUpdate({
      filter: { _id: existing._id },
      update: { $set: fields },
      projection: { _id: 1 },
    });
  } else {
    await plan.insertOne({
      doc: {
        code: set.code,
        title: set.title,
        ...fields,
        createdAt: now,
      } as never,
      projection: { _id: 1 },
    });
  }

  if (set.isDefault === true) {
    const others = await plan
      .aggregation({
        pipeline: [
          { $match: { code: { $ne: set.code }, isDefault: true } },
          { $project: { _id: 1 } },
        ],
      })
      .toArray();

    for (const other of others) {
      await plan.findOneAndUpdate({
        filter: { _id: other._id },
        update: { $set: { isDefault: false, updatedAt: now } },
        projection: { _id: 1 },
      });
    }
  }

  await recordAudit({
    action: existing ? "plan.update" : "plan.create",
    targetType: "plan",
    targetId: set.code,
    summary: `${existing ? "Updated" : "Created"} plan ${set.code}`,
    metadata: { fields, limits: mergedLimits },
  });

  const projection = get && Object.keys(get).length > 0 ? get : {
    code: 1,
    title: 1,
    description: 1,
    priceCents: 1,
    currency: 1,
    billingInterval: 1,
    isActive: 1,
    isDefault: 1,
    sortOrder: 1,
    limits: 1,
    features: 1,
  };

  return await plan.findOne({
    filters: { code: set.code },
    projection,
  });
};
