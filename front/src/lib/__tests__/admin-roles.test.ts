/**
 * The role predicates.
 *
 * Every check is written as an inclusion — `role === "admin"` or
 * `role === "support"` — never `role !== "user"`. A future role, or a missing
 * one that slipped through, must not gain operator access by not being the
 * listener role.
 */

import { describe, expect, it } from "vitest";

import { canMutate, isOperatorRole } from "../admin/roles";

describe("admin role predicates", () => {
  it("keeps a listener out of the panel and its mutations", () => {
    expect(isOperatorRole("user")).toBe(false);
    expect(canMutate("user")).toBe(false);
  });

  it("lets support read but not mutate", () => {
    expect(isOperatorRole("support")).toBe(true);
    expect(canMutate("support")).toBe(false);
  });

  it("lets an admin read and mutate", () => {
    expect(isOperatorRole("admin")).toBe(true);
    expect(canMutate("admin")).toBe(true);
  });
});
