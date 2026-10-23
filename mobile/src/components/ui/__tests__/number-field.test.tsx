import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import { NumberField } from "@/components/ui/field";

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

function Harness() {
  const [value, setValue] = useState(3);
  return (
    <NumberField
      testID="number-input"
      label="Timer"
      value={value}
      onChange={setValue}
      min={1}
      max={5}
      unit="min"
    />
  );
}

describe("NumberField", () => {
  it("steps by one and clamps at the bounds", async () => {
    await render(<Harness />);
    const input = () => screen.getByTestId("number-input");

    await fireEvent.press(screen.getByLabelText("Increase"));
    expect(input().props.value).toBe("4");

    await fireEvent.press(screen.getByLabelText("Increase"));
    expect(input().props.value).toBe("5");
    expect(
      screen.getByLabelText("Increase").props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));

    await fireEvent.press(screen.getByLabelText("Decrease"));
    await fireEvent.press(screen.getByLabelText("Decrease"));
    await fireEvent.press(screen.getByLabelText("Decrease"));
    expect(input().props.value).toBe("2");
  });

  it("clamps a typed value and reverts an empty draft on blur", async () => {
    await render(<Harness />);
    const input = () => screen.getByTestId("number-input");

    await fireEvent.changeText(input(), "9");
    expect(input().props.value).toBe("5");

    await fireEvent.changeText(input(), "");
    expect(input().props.value).toBe("");

    await fireEvent(input(), "blur");
    expect(input().props.value).toBe("5");
  });
});
