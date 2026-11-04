import { coreApp } from "../mod.ts";
import type { MyContext } from "./context.ts";
import { throwError } from "./throwError.ts";

export type UserRole = "user" | "admin" | "support";
export type UserStatus = "active" | "suspended" | "deleted";

/**
 * The account fields are defaulted in the schema, but 55 accounts predate them,
 * so every reader normalises rather than trusting the document. One place to do
 * it keeps `role ?? "user"` from being spelled differently in twenty acts.
 */
export const roleOf = (user?: { role?: unknown } | null): UserRole =>
  user?.role === "admin" || user?.role === "support" ? user.role : "user";

export const statusOf = (user?: { status?: unknown } | null): UserStatus =>
  user?.status === "suspended" || user?.status === "deleted"
    ? user.status
    : "active";

export const isAdmin = (user?: { role?: unknown } | null): boolean =>
  roleOf(user) === "admin";

/** Reads the caller that `setUser` put in the request context. */
export const currentUser = (): MyContext["user"] => {
  const ctx = coreApp.contextFns.getContextModel() as MyContext;
  if (!ctx.user?._id) {
    throwError("This act needs an authenticated account");
  }
  return ctx.user;
};

/**
 * Refuses every write from a suspended account.
 *
 * Suspension is deliberately **read-only rather than signed-out**: the listener
 * can still open their library, read their history and see the reason on their
 * account page, but nothing is written. That is friendlier than a silent 401
 * loop in a client that retries sync forever, and it makes "why is my account
 * frozen?" answerable inside the app.
 */
export const requireActive = () => {
  const user = currentUser();
  const status = statusOf(user);

  if (status === "suspended") {
    throwError(
      user.suspendedReason
        ? `Your account is read-only: ${user.suspendedReason}`
        : "Your account is read-only. Please contact support.",
    );
  }

  if (status === "deleted") {
    throwError("This account has been deleted");
  }
};

/**
 * Admin-panel reads: `support` and `admin` both pass.
 *
 * Every admin act that only reads uses this, because a support agent needs to
 * see a listener's history and payments to answer a ticket, and nothing more.
 */
export const requireSupport = () => {
  const role = roleOf(currentUser());
  if (role !== "admin" && role !== "support") {
    throwError("This action requires an admin account");
  }
};

/**
 * Admin-panel writes: only `admin` passes.
 *
 * The distinction is the whole point of having two roles — granting a
 * subscription or deleting an account is not a support action, and a support
 * token should not be able to do it even if the panel offers the button.
 */
export const requireAdmin = () => {
  if (!isAdmin(currentUser())) {
    throwError("This action requires an admin account");
  }
};
