import { afterEach, describe, expect, it, vi } from "vitest";

import { backendUrl } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("backendUrl", () => {
  it("targets the Lesan endpoint from a bare base URL", () => {
    vi.stubEnv("BACKEND_URL", "http://localhost:1405");

    expect(backendUrl()).toBe("http://localhost:1405/lesan");
  });

  it("tolerates a trailing slash", () => {
    vi.stubEnv("BACKEND_URL", "http://localhost:1405/");

    expect(backendUrl()).toBe("http://localhost:1405/lesan");
  });

  it("does not double the path when the endpoint is already there", () => {
    vi.stubEnv("BACKEND_URL", "http://localhost:1405/lesan");

    expect(backendUrl()).toBe("http://localhost:1405/lesan");
  });

  it("names the missing variable", () => {
    vi.stubEnv("BACKEND_URL", "");

    expect(() => backendUrl()).toThrow(/BACKEND_URL/);
  });
});
