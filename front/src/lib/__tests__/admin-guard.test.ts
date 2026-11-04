/**
 * The frontend guard is a convenience, not the authority — but it must still
 * never turn a permission refusal into a sign-out.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMe } from "@/app/actions/auth/get-me";
import type { CurrentUser } from "@/lib/domain/user";
import { fail, ok } from "@/lib/result";

import { requireAdmin, requireSupport } from "../admin/guard";

vi.mock("@/app/actions/auth/get-me", () => ({ getMe: vi.fn() }));

const mocked = vi.mocked(getMe);

function user(role: CurrentUser["role"]): CurrentUser {
  return {
    id: "6512a1f4c2b3d4e5f6a7b8c9",
    username: "operator",
    email: "operator@pejvak.app",
    displayName: null,
    avatarUrl: null,
    role,
    status: "active",
  };
}

describe("requireSupport", () => {
  beforeEach(() => mocked.mockReset());

  it("admits support and admin", async () => {
    mocked.mockResolvedValue(ok(user("support")));
    expect((await requireSupport()).success).toBe(true);

    mocked.mockResolvedValue(ok(user("admin")));
    expect((await requireSupport()).success).toBe(true);
  });

  it("refuses a listener as validation, not unauthorized", async () => {
    mocked.mockResolvedValue(ok(user("user")));
    const result = await requireSupport();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.message).toContain("requires an admin account");
    }
  });

  it("passes a real auth failure through unchanged", async () => {
    mocked.mockResolvedValue(fail("unauthorized", "No session token."));
    const result = await requireSupport();

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.kind).toBe("unauthorized");
  });
});

describe("requireAdmin", () => {
  beforeEach(() => mocked.mockReset());

  it("refuses support as validation", async () => {
    mocked.mockResolvedValue(ok(user("support")));
    const result = await requireAdmin();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.kind).not.toBe("unauthorized");
    }
  });

  it("admits an admin", async () => {
    mocked.mockResolvedValue(ok(user("admin")));
    expect((await requireAdmin()).success).toBe(true);
  });
});
