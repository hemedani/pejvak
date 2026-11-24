import { type ObjectId } from "lesan";
import { coreApp } from "../../mod.ts";
import { type MyContext, roleOf, throwError } from "@lib";

/**
 * One route per operation, role-aware inside it — instead of a parallel
 * `admin*` act for every action (backend prompt D15).
 *
 * Lesan's act pipeline is `preValidation → validator → preAct → fn`. The
 * **validator** carries data validity (shape, enums, ranges); the **tenant
 * boundary and business rules** are enforced here and in the act's own query.
 * The whole point is that these are *not* two acts that could drift — they are
 * one query whose scope is chosen by the caller's role, so an operator and a
 * creator exercise the same code path with the same validation.
 *
 * The invariants this exists to protect, and which a naive
 * `if (isAdmin) skip all checks` would violate:
 *
 * - A **creator** is always scoped to `"user._id": theirId` — they can never
 *   reach another account's row, and can never set `status` (that is a takedown,
 *   not an edit).
 * - An **operator** (`admin`) may act across tenants and may set `status`, but a
 *   cross-tenant *destructive* call still demands a confirmation token, and every
 *   operator mutation is audited.
 * - A **support** agent may read across tenants but mutates nothing.
 */

export type Actor = {
  userId: ObjectId;
  /** Admin: may mutate any tenant and flip moderation status. */
  isAdmin: boolean;
  /** Admin or support: may read rows hidden from the public. */
  canReadAll: boolean;
};

/** The authenticated caller, or `null` for an anonymous (optional-auth) read. */
export const actorOrNull = (): Actor | null => {
  const ctx = coreApp.contextFns.getContextModel() as MyContext;
  if (!ctx.user?._id) return null;
  const role = roleOf(ctx.user);
  return {
    userId: ctx.user._id as ObjectId,
    isAdmin: role === "admin",
    canReadAll: role === "admin" || role === "support",
  };
};

/** The authenticated caller for a write act (must be present + active). */
export const actor = (): Actor => {
  const found = actorOrNull();
  if (!found) throwError("This act needs an authenticated account");
  return found!;
};

/**
 * The filter that scopes a single row to the caller's authority.
 *
 * Operators pass the global branch (they may reach any tenant); everyone else is
 * pinned to their own `user._id`. This is the one line that replaces an entire
 * `admin*` act: the *query* encodes the boundary, so forgetting it is not
 * possible the way a forgotten `requireAdmin` on a duplicate act would be.
 */
export const rowScope = (
  who: Actor,
  id: ObjectId,
  opts: { write?: boolean } = {},
): Record<string, unknown> => {
  const privileged = opts.write ? who.isAdmin : who.canReadAll;
  return privileged ? { _id: id } : { _id: id, "user._id": who.userId };
};

/**
 * The `status` predicate for a public-vs-operator read.
 *
 * Anonymous and creator callers only ever see `active` rows (prompt D9); an
 * operator may see everything or filter to `removed`. A creator who passes a
 * `status` it is not allowed to request simply does not get it — the branch is
 * chosen by role, never by the request body.
 */
export const statusScope = (
  who: Actor | null,
  requested?: "active" | "removed",
): Record<string, unknown> => {
  if (!who?.canReadAll) return { status: "active" };
  return requested ? { status: requested } : {};
};
