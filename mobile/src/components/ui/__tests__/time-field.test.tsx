import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import { TimeField } from "@/components/ui/field";

jest.mock("@/components/ui/keyboard-scroll-view", () => ({
  useFieldRegistrar: () => null,
}));

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120 },
  press: { rest: 1, down: 0.92, overshoot: 1.05 },
  spring: { damping: 0.6, stiffness: 400 },
  easing: { outQuint: [0.22, 1, 0.36, 1] },
  curve: (_easing: unknown, ms: number) => ({ duration: ms }),
  useMotionEnabled: () => false,
}));

function Harness({ maxSec }: { maxSec?: number }) {
  const [seconds, setSeconds] = useState(0);
  return (
    <TimeField
      testID="time-input"
      label="Jump to"
      valueSec={seconds}
      onChangeSec={setSeconds}
      maxSec={maxSec}
    />
  );
}

function input() {
  return screen.getByTestId("time-input");
}

describe("TimeField", () => {
  it("shows the raw digits while it is being typed", async () => {
    await render(<Harness />);

    await fireEvent(input(), "focus");
    await fireEvent.changeText(input(), "1234");

    expect(input().props.value).toBe("1234");
  });

  it("reports each change as clamped integer seconds", async () => {
    await render(<Harness maxSec={300} />);

    await fireEvent(input(), "focus");
    await fireEvent.changeText(input(), "999");

    expect(input().props.value).toBe("999");
    await fireEvent(input(), "blur");
    expect(input().props.value).toBe("5:00");
  });

  it("formats the committed time on blur", async () => {
    await render(<Harness />);

    await fireEvent(input(), "focus");
    await fireEvent.changeText(input(), "1234");
    await fireEvent(input(), "blur");

    expect(input().props.value).toBe("12:34");
  });

  it("adopts an external value while it is not focused", async () => {
    const view = await render(
      <TimeField
        testID="time-input"
        label="Jump to"
        valueSec={0}
        onChangeSec={() => {}}
      />,
    );

    await view.rerender(
      <TimeField
        testID="time-input"
        label="Jump to"
        valueSec={3600}
        onChangeSec={() => {}}
      />,
    );

    expect(input().props.value).toBe("1:00:00");
  });
});
