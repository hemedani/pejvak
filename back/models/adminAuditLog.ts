import { coreApp } from "../mod.ts";
import { optional, string } from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";

/**
 * An append-only record of what an operator did.
 *
 * The actor and the target are stored as **strings, not relations**, for two
 * reasons that both matter more than referential tidiness:
 *
 * 1. A relation would cascade-delete the log when an account is deleted, which
 *    is exactly the moment the log is needed most.
 * 2. Lesan keeps a reverse array of every related id on the parent document, so
 *    an audit relation would make `User` grow without bound.
 *
 * `metadata` is a JSON string rather than an embedded object: the shape differs
 * per action, and a strict schema would either reject legitimate detail or
 * force a union of every action's fields.
 */
export const adminAuditLog_pure = {
  actorId: string(),
  /** Snapshot: the actor may later change their email or be deleted. */
  actorEmail: optional(string()),
  actorRole: optional(string()),
  /** Dotted, stable, greppable: `user.update`, `subscription.grant`, … */
  action: string(),
  /** `user` | `plan` | `subscription` | `transaction` | `platformSetting`. */
  targetType: string(),
  targetId: optional(string()),
  /** One human sentence, written for the panel's activity list. */
  summary: optional(string()),
  /** JSON string: changed fields, previous values, refusal reasons. */
  metadata: optional(string()),
  ...createUpdateAt,
};

export const adminAuditLog_relations = {};

export const adminAuditLogs = () =>
  coreApp.odm.newModel(
    "adminAuditLog",
    adminAuditLog_pure,
    adminAuditLog_relations,
    {
      createIndex: {
        indexSpec: { createdAt: -1 },
        options: {},
      },
    },
  );
