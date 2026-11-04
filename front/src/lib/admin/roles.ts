/**
 * Role predicates, kept pure and tested.
 *
 * Every check is an inclusion. `role !== "user"` would grant operator access to
 * any future role, and to anything that slipped through the parser — the exact
 * failure the fail-closed `parseUser` exists to prevent.
 */

import type { UserRole } from "../domain/user";

export function isOperatorRole(role: UserRole): role is "admin" | "support" {
  return role === "admin" || role === "support";
}

export function canMutate(role: UserRole): role is "admin" {
  return role === "admin";
}
