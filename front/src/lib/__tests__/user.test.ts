/**
 * `getMe` is the admin gate's only input.
 *
 * The rule that matters is fail-closed: a legacy account has no `role` field,
 * and an absent field must read as `user` — never as something that could be
 * mistaken for an operator. The same goes for `status`: an absent one is active,
 * because that is how every pre-RBAC row behaves.
 */

import { describe, expect, it } from "vitest";

import { parseUser } from "../domain/user";

const base = {
  _id: "6512a1f4c2b3d4e5f6a7b8c9",
  username: "operator",
  email: "operator@pejvak.app",
};

describe("parseUser role and status", () => {
  it("reads an operator role and a suspended status", () => {
    const user = parseUser({ ...base, role: "admin", status: "suspended" });

    expect(user?.role).toBe("admin");
    expect(user?.status).toBe("suspended");
  });

  it("accepts support without turning it into admin", () => {
    expect(parseUser({ ...base, role: "support" })?.role).toBe("support");
  });

  it("fails closed when role and status are absent", () => {
    const user = parseUser(base);

    expect(user?.role).toBe("user");
    expect(user?.status).toBe("active");
  });

  it("fails closed on an unrecognised role or status", () => {
    const user = parseUser({ ...base, role: "owner", status: "paused" });

    expect(user?.role).toBe("user");
    expect(user?.status).toBe("active");
  });
});
