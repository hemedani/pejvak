import * as Haptics from "expo-haptics";

import { triggerHaptic } from "@/components/ui/haptics";
import { setHapticsPreference } from "@/lib/hapticsPreference";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

describe("triggerHaptic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setHapticsPreference(true);
  });

  it("maps tap to a light impact", () => {
    triggerHaptic("tap");
    expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
  });

  it("maps press to a medium impact", () => {
    triggerHaptic("press");
    expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
  });

  it("maps select to a selection haptic", () => {
    triggerHaptic("select");
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("maps success to a success notification", () => {
    triggerHaptic("success");
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
  });

  it("does nothing when the master switch is off", () => {
    setHapticsPreference(false);
    triggerHaptic("select");
    triggerHaptic("tap");
    triggerHaptic("success");
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it("does nothing for the none intent", () => {
    triggerHaptic("none");
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it("throttles scrub ticks", () => {
    let now = 10_000;
    const spy = jest.spyOn(Date, "now").mockImplementation(() => now);
    triggerHaptic("scrub");
    now += 10;
    triggerHaptic("scrub");
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    now += 40;
    triggerHaptic("scrub");
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
