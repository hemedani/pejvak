import { adminAuditLog } from "../../mod.ts";
import { currentUser } from "@lib";

export type AuditInput = {
  /** Dotted and stable: `user.update`, `subscription.grant`, `plan.upsert`. */
  action: string;
  targetType:
    | "user"
    | "plan"
    | "subscription"
    | "transaction"
    | "platformSetting"
    | "aiUsage";
  targetId?: string;
  /** One sentence for the panel's activity list — no ids, no JSON. */
  summary?: string;
  /** Structured detail (before/after, reason). Stored as JSON. */
  metadata?: Record<string, unknown>;
};

/**
 * Writes one audit line for the calling admin.
 *
 * Every mutating admin act calls this **after** the change succeeded, so the log
 * records what happened rather than what was attempted. Refusals are not logged:
 * a rejected request changed nothing, and logging them would bury the real
 * actions in noise.
 *
 * The write is best-effort — an audit failure must never fail the operation the
 * operator asked for — but it is awaited so a response is never sent before the
 * line exists.
 */
export const recordAudit = async (input: AuditInput) => {
  const actor = currentUser();

  try {
    await adminAuditLog.insertOne({
      doc: {
        actorId: String(actor._id),
        ...(actor.email !== undefined ? { actorEmail: actor.email } : {}),
        actorRole: actor.role ?? "user",
        action: input.action,
        targetType: input.targetType,
        ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.metadata !== undefined
          ? { metadata: JSON.stringify(input.metadata) }
          : {}),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      projection: { _id: 1 },
    });
  } catch (error) {
    console.error("audit log write failed", error);
  }
};
