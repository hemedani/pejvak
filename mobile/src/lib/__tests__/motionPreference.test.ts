import { resolveMotionEnabled } from "@/lib/motionPreference";

describe("resolveMotionEnabled", () => {
  it("follows the OS when the preference is system", () => {
    expect(resolveMotionEnabled("system", true)).toBe(false);
    expect(resolveMotionEnabled("system", false)).toBe(true);
  });

  it("lets full override the OS reduced-motion setting", () => {
    expect(resolveMotionEnabled("full", true)).toBe(true);
    expect(resolveMotionEnabled("full", false)).toBe(true);
  });

  it("never animates when the preference is reduced", () => {
    expect(resolveMotionEnabled("reduced", false)).toBe(false);
    expect(resolveMotionEnabled("reduced", true)).toBe(false);
  });
});
