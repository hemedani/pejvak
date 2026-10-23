import { fireEvent, render, screen } from "@testing-library/react-native";

import { SleepTimerSheet } from "@/components/player/SleepTimerSheet";

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

describe("SleepTimerSheet", () => {
  it("starts a timer from a preset", async () => {
    const onStart = jest.fn();
    await render(
      <SleepTimerSheet
        active={false}
        remainingMs={0}
        onStart={onStart}
        onCancel={() => {}}
        onClose={() => {}}
      />,
    );

    await fireEvent.press(screen.getByLabelText("15 min"));
    expect(onStart).toHaveBeenCalledWith(15);
  });

  it("starts a custom duration", async () => {
    const onStart = jest.fn();
    await render(
      <SleepTimerSheet
        active={false}
        remainingMs={0}
        onStart={onStart}
        onCancel={() => {}}
        onClose={() => {}}
      />,
    );

    await fireEvent.changeText(screen.getByTestId("sleep-custom"), "20");
    await fireEvent.press(screen.getByText("Start"));
    expect(onStart).toHaveBeenCalledWith(20);
  });

  it("cancels only when a timer is active", async () => {
    const onCancel = jest.fn();
    const view = await render(
      <SleepTimerSheet
        active={false}
        remainingMs={0}
        onStart={() => {}}
        onCancel={onCancel}
        onClose={() => {}}
      />,
    );

    await fireEvent.press(screen.getByText("Close"));
    expect(onCancel).not.toHaveBeenCalled();

    await view.rerender(
      <SleepTimerSheet
        active
        remainingMs={60_000}
        onStart={() => {}}
        onCancel={onCancel}
        onClose={() => {}}
      />,
    );

    await fireEvent.press(screen.getByText("Cancel timer"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
