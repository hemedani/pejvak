import { fireEvent, render, screen } from "@testing-library/react-native";

import { TextField } from "@/components/ui/text-field";

const mockReveal = jest.fn();

jest.mock("@/components/ui/keyboard-scroll-view", () => ({
  useFieldRegistrar: () => ({ reveal: mockReveal }),
}));

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120 },
  useMotionEnabled: () => false,
}));

beforeEach(() => {
  mockReveal.mockClear();
});

function input() {
  return screen.getByTestId("text-field-input");
}

describe("TextField", () => {
  it("links the visible label to the input", async () => {
    await render(
      <TextField
        testID="text-field-input"
        label="Email"
        value=""
        onChangeText={() => {}}
      />,
    );

    const label = screen.getByText("Email");
    expect(label.props.nativeID).toBeTruthy();
    expect(input().props.accessibilityLabelledBy).toBe(label.props.nativeID);
  });

  it("renders a hint under the track", async () => {
    await render(
      <TextField
        testID="text-field-input"
        label="Email"
        hint="We never share it"
      />,
    );

    expect(screen.getByText("We never share it")).toBeTruthy();
  });

  it("replaces the hint with a politely announced error", async () => {
    await render(
      <TextField
        testID="text-field-input"
        label="Email"
        hint="We never share it"
        error="That address is not valid"
        value="nope"
        onChangeText={() => {}}
      />,
    );

    expect(screen.queryByText("We never share it")).toBeNull();
    const error = screen.getByText("That address is not valid");
    expect(error.props.accessibilityLiveRegion).toBe("polite");
    expect(input().props.accessibilityHint).toBe("That address is not valid");
  });

  it("counts characters when a maxLength is set", async () => {
    await render(
      <TextField
        testID="text-field-input"
        label="Title"
        value={"a".repeat(12)}
        onChangeText={() => {}}
        maxLength={120}
      />,
    );

    expect(screen.getByText("12/120")).toBeTruthy();
  });

  it("reveals the whole field on focus and forwards the caller's handler", async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(
      <TextField
        testID="text-field-input"
        label="Email"
        value=""
        onChangeText={() => {}}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );

    await fireEvent(input(), "focus");
    expect(mockReveal).toHaveBeenCalledWith(expect.anything());
    expect(onFocus).toHaveBeenCalledTimes(1);

    const focusedRing = screen.getByTestId("field-focus-ring");
    expect(focusedRing.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 1 })]),
    );

    await fireEvent(input(), "blur");
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("field-focus-ring").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0 })]),
    );
  });

  it("exposes a disabled field to accessibility and keeps the hint", async () => {
    await render(
      <TextField
        testID="text-field-input"
        label="Username"
        value="syd"
        onChangeText={() => {}}
        editable={false}
        hint="Set once at registration"
      />,
    );

    expect(input().props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(input().props.accessibilityHint).toBe("Set once at registration");
  });
});
