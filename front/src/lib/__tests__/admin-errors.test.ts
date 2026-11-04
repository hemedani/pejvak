/**
 * Admin refusals are payload problems, not session problems.
 *
 * The distinction is load-bearing: `callAct` signs the operator out on
 * `unauthorized`. If "This action requires an admin account" were classified
 * that way, a support token calling a mutation would be logged out instead of
 * being told it may not do that.
 */

import { describe, expect, it } from "vitest";

import { classifyActFailure } from "../errors";
import { failureMessage } from "../messages";

describe("classifyActFailure for admin messages", () => {
  it("classifies a permission refusal as validation, never unauthorized", () => {
    const failure = classifyActFailure("This action requires an admin account");

    expect(failure.kind).toBe("validation");
    expect(failure.kind).not.toBe("unauthorized");
  });

  it("keeps a missing account a validation failure", () => {
    expect(classifyActFailure("User not found").kind).toBe("validation");
  });

  it("keeps guard and grant refusals as validation", () => {
    const messages = [
      "There must be at least one active admin",
      "You cannot change your own role",
      "This account has no active subscription to revoke",
      "This plan still has 2 active subscriber(s). Move or revoke them before archiving it.",
      "A usage grant needs at least one cap",
      "A forever grant does not take a duration or caps",
      "Credits must be a positive whole number",
      "Only a paid transaction can be refunded",
    ];

    for (const message of messages) {
      expect(classifyActFailure(message).kind, message).toBe("validation");
    }
  });

  it("still treats a dead token as unauthorized", () => {
    expect(classifyActFailure("User not exist").kind).toBe("unauthorized");
  });
});

describe("failureMessage for admin refusals", () => {
  it("surfaces the last-admin refusal instead of the generic sentence", () => {
    const text = failureMessage({
      kind: "validation",
      message: "There must be at least one active admin",
    });

    expect(text).toContain("at least one active admin");
  });

  it("surfaces a permission refusal as a sentence", () => {
    expect(
      failureMessage({ kind: "validation", message: "This action requires an admin account" }),
    ).toBe("This action requires an admin account.");
  });
});
