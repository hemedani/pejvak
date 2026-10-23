import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { RecordRow } from "@/components/ui/row/record-row";

jest.mock("@/theme/motion", () => ({
  press: { down: 0.92, overshoot: 1.05, rest: 1 },
  spring: { press: {}, release: {}, bouncy: {} },
  useMotionEnabled: () => false,
}));

describe("RecordRow", () => {
  it("draws one record line and opens it on tap", async () => {
    const onPress = jest.fn();

    await render(
      <RecordRow
        title="Chapter one"
        meta="09:00 – 09:42"
        detail="0:00 – 42:00 · Lectures"
        status={{ kind: "finished", label: "Finished" }}
        trailing={<Text>42m</Text>}
        onPress={onPress}
        accessibilityLabel="Details for Chapter one"
        accessibilityHint="Opens the timeline"
        cardWidth={360}
      />,
    );

    expect(screen.getByText("Chapter one")).toBeTruthy();
    expect(screen.getByText("09:00 – 09:42")).toBeTruthy();
    expect(screen.getByText("0:00 – 42:00 · Lectures")).toBeTruthy();
    expect(screen.getByText("Finished")).toBeTruthy();
    expect(screen.getByText("42m")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Details for Chapter one"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows the one status the domain supplied, not a status vocabulary", async () => {
    await render(
      <RecordRow
        title="Chapter one"
        status={{ kind: "interrupted", label: "Interrupted" }}
        accessibilityLabel="Details for Chapter one"
        cardWidth={360}
      />,
    );

    expect(screen.getByText("Interrupted")).toBeTruthy();
    expect(screen.queryByText("Finished")).toBeNull();
    expect(screen.queryByText("Complete")).toBeNull();
  });
});
