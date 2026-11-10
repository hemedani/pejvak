/**
 * The slider's contract.
 *
 * The gesture is not exercised here — a pan in a test proves nothing about a
 * finger on glass — but the *accessible* control is: it must announce its range
 * and current value, and the increment/decrement actions must move it by more
 * than a single half-decibel step, or a screen-reader user would need forty taps
 * to cross the range.
 */

import { fireEvent, render, screen } from "@testing-library/react-native";

import { Slider } from "@/components/ui/slider";

describe("Slider", () => {
  it("announces its range and current value", async () => {
    await render(
      <Slider value={3} min={-12} max={12} step={0.5} label="Bass" onChange={() => {}} tint="#1FB6A6" />,
    );

    const slider = screen.getByLabelText("Bass");
    expect(slider.props.accessibilityValue).toEqual({ min: -12, max: 12, now: 3 });
    expect(slider.props.accessibilityRole).toBe("adjustable");
  });

  it("moves by several steps per accessibility action", async () => {
    const onChange = jest.fn();
    await render(
      <Slider value={0} min={-12} max={12} step={0.5} label="Treble" onChange={onChange} tint="#1FB6A6" />,
    );

    const slider = screen.getByLabelText("Treble");
    await fireEvent(slider, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(onChange).toHaveBeenCalledWith(2);

    await fireEvent(slider, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(onChange).toHaveBeenLastCalledWith(-2);
  });

  it("cannot be nudged past its own limits", async () => {
    const onChange = jest.fn();
    await render(
      <Slider value={12} min={0} max={12} step={0.5} label="Boost" onChange={onChange} tint="#1FB6A6" />,
    );

    await fireEvent(screen.getByLabelText("Boost"), "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(onChange).toHaveBeenCalledWith(12);
  });
});
