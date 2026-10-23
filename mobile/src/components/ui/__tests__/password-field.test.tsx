import { fireEvent, render, screen } from "@testing-library/react-native";

import { PasswordField } from "@/components/ui/field";

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

describe("PasswordField", () => {
  it("toggles visibility without touching the value", async () => {
    await render(
      <PasswordField
        testID="password-input"
        label="Password"
        value="correct horse"
        onChangeText={() => {}}
      />,
    );

    const input = screen.getByTestId("password-input");
    expect(input.props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByLabelText("Show password"));

    expect(screen.getByTestId("password-input").props.secureTextEntry).toBe(
      false,
    );
    expect(screen.getByTestId("password-input").props.value).toBe(
      "correct horse",
    );
    expect(screen.getByLabelText("Hide password")).toBeTruthy();
  });
});
