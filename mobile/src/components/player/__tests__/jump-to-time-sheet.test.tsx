import { fireEvent, render, screen } from "@testing-library/react-native";

import { JumpToTimeSheet } from "@/components/player/JumpToTimeSheet";

jest.mock("@/components/ui/keyboard-scroll-view", () => ({
  useFieldRegistrar: () => null,
}));

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120, quick: 180, base: 260 },
  press: { rest: 1, down: 0.92, overshoot: 1.05 },
  spring: {
    damping: 0.6,
    stiffness: 400,
    sheet: { damping: 20, stiffness: 180 },
    snappy: { damping: 18, stiffness: 320 },
  },
  easing: { outQuint: [0.22, 1, 0.36, 1] },
  curve: (_easing: unknown, ms: number) => ({ duration: ms }),
  useMotionEnabled: () => false,
}));

describe("JumpToTimeSheet", () => {
  it("clamps to the track and seeks there", async () => {
    const onSeek = jest.fn();
    const onClose = jest.fn();
    await render(
      <JumpToTimeSheet
        positionSec={30}
        durationSec={300}
        onSeek={onSeek}
        onClose={onClose}
      />,
    );

    await fireEvent.changeText(screen.getByTestId("jump-time"), "999");
    await fireEvent.press(screen.getByText("Go"));

    expect(onSeek).toHaveBeenCalledWith(300);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("seeks to the typed time", async () => {
    const onSeek = jest.fn();
    await render(
      <JumpToTimeSheet
        positionSec={30}
        durationSec={900}
        onSeek={onSeek}
        onClose={() => {}}
      />,
    );

    await fireEvent.changeText(screen.getByTestId("jump-time"), "1234");
    await fireEvent.press(screen.getByText("Go"));

    expect(onSeek).toHaveBeenCalledWith(754);
  });
});
