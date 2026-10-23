import { fireEvent, render, screen } from "@testing-library/react-native";

import { ColorField } from "@/components/ui/field";

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120 },
  press: { rest: 1, down: 0.92, overshoot: 1.05 },
  spring: { damping: 0.6, stiffness: 400 },
  easing: { outQuint: [0.22, 1, 0.36, 1] },
  curve: (_easing: unknown, ms: number) => ({ duration: ms }),
  useMotionEnabled: () => false,
}));

describe("ColorField", () => {
  it("offers six named radios and reports the chosen colour", async () => {
    const onChange = jest.fn();
    await render(
      <ColorField value="#208AEF" onChange={onChange} />,
    );

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(6);

    expect(
      screen.getByLabelText("Blue").props.accessibilityState,
    ).toEqual(expect.objectContaining({ checked: true }));

    await fireEvent.press(screen.getByLabelText("Red"));
    expect(onChange).toHaveBeenCalledWith("#E5484D");
  });
});
