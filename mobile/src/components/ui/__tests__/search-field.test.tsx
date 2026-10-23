import { fireEvent, render, screen } from "@testing-library/react-native";

import { SearchField } from "@/components/ui/search-field";

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

describe("SearchField", () => {
  it("shows the clear control only when there is a query", async () => {
    const view = await render(
      <SearchField value="" onChangeText={() => {}} />,
    );

    expect(screen.queryByLabelText("Clear search")).toBeNull();

    await view.rerender(
      <SearchField value="persian" onChangeText={() => {}} />,
    );
    expect(screen.getByLabelText("Clear search")).toBeTruthy();
  });

  it("clears the query when the control is pressed", async () => {
    const onChangeText = jest.fn();
    await render(
      <SearchField value="persian" onChangeText={onChangeText} />,
    );

    await fireEvent.press(screen.getByLabelText("Clear search"));
    expect(onChangeText).toHaveBeenCalledWith("");
  });

  it("announces the result hint politely", async () => {
    await render(
      <SearchField
        value="persian"
        onChangeText={() => {}}
        hint="3 tracks found"
      />,
    );

    const hint = screen.getByText("3 tracks found");
    expect(hint.props.accessibilityLiveRegion).toBe("polite");
  });

  it("keeps an accessibility label on the input and searches on submit", async () => {
    const onSubmit = jest.fn();
    await render(
      <SearchField
        value="persian"
        onChangeText={() => {}}
        accessibilityLabel="Search your library"
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByLabelText("Search your library");
    expect(input.props.returnKeyType).toBe("search");

    await fireEvent(input, "submitEditing");
    expect(onSubmit).toHaveBeenCalledWith("persian");
  });
});
