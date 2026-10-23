import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { TextArea } from "@/components/ui/field";

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

describe("TextArea", () => {
  it("is multiline, top-aligned, and bounded by its line count", async () => {
    await render(
      <TextArea
        testID="text-area-input"
        label="Notes"
        value=""
        onChangeText={() => {}}
        minLines={3}
        maxLines={8}
      />,
    );

    const input = screen.getByTestId("text-area-input");
    expect(input.props.multiline).toBe(true);
    expect(input.props.textAlignVertical).toBe("top");

    const style = StyleSheet.flatten(input.props.style);
    expect(style.minHeight).toBe(72);
    expect(style.maxHeight).toBe(184);
  });
});
