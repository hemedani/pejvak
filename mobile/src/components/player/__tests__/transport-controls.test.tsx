import { fireEvent, render, screen } from "@testing-library/react-native";

import { TransportControls } from "@/components/player/TransportControls";

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120, quick: 180, base: 260 },
  press: { rest: 1, down: 0.92, overshoot: 1.05 },
  spring: {
    damping: 0.6,
    stiffness: 400,
    sheet: { damping: 20, stiffness: 180 },
    snappy: { damping: 18, stiffness: 320 },
  },
  easing: { outQuint: [0.22, 1, 0.36, 1], linear: [0, 0, 1, 1] },
  curve: (_easing: unknown, ms: number) => ({ duration: ms }),
  useMotionEnabled: () => false,
}));

async function renderControls(
  overrides: Partial<React.ComponentProps<typeof TransportControls>> = {},
) {
  const props = {
    isPlaying: false,
    onToggle: jest.fn(),
    onNext: jest.fn(),
    onPrevious: jest.fn(),
    onRewind: jest.fn(),
    onForward: jest.fn(),
    ...overrides,
  };
  return { props, ...(await render(<TransportControls {...props} />)) };
}

/**
 * The wait has to be a *control*, not a picture. A stream that has not arrived
 * yet still has one thing the listener can do about it, and a spinner that
 * replaced the button would take that away.
 */
describe("TransportControls", () => {
  it("keeps the play button pressable while the player waits", async () => {
    const { props } = await renderControls({ waiting: true });

    const button = screen.getByLabelText("Stop waiting");
    expect(button.props.accessibilityState).toEqual({ disabled: false, busy: true });

    await fireEvent.press(button);
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it("names the action as stopping the wait rather than pausing", async () => {
    // The audio is not there yet, so "Pause" would promise something to pause.
    await renderControls({ isPlaying: false, waiting: true });
    expect(screen.queryByLabelText("Pause")).toBeNull();
    expect(screen.queryByLabelText("Play")).toBeNull();
  });

  it("goes back to the play glyph once the wait ends", async () => {
    await renderControls({ isPlaying: false, waiting: false });

    const button = screen.getByLabelText("Play");
    // No `busy` at all, rather than `busy: false`: React Native fills in the
    // rest of the state shape as soon as the key is present, and every other
    // control in the app would start carrying empty fields.
    expect(button.props.accessibilityState).toEqual({ disabled: false });
  });

  it("says Pause while audio is actually playing", async () => {
    await renderControls({ isPlaying: true, waiting: false });
    expect(screen.getByLabelText("Pause")).toBeTruthy();
  });
});
