/**
 * The enhancer sheet.
 *
 * The cases here are about what the sheet refuses to say. A control that moves
 * and changes nothing is worse than an honest refusal, so the unavailable case
 * must show no sliders at all; and a switch that is on with a flat curve must
 * not claim the audio is being shaped.
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AudioEnhancerSheet } from "@/components/player/AudioEnhancerSheet";
import { DEFAULT_ENHANCER } from "@/lib/audioEffects";
import * as AudioEffectsService from "@/services/AudioEffectsService";
import { useAudioEffectsStore } from "@/store/audioEffectsStore";

/**
 * `GestureHandlerRootView` calls the native module's `install()` as it renders,
 * and there is no native module here. It is stood in for by a plain view with a
 * testID, which keeps the assertion — "the sheet gives its sliders a gesture root
 * of their own" — meaningful without pretending the mock is the real thing.
 */
jest.mock("react-native-gesture-handler", () => {
  // A `jest.mock` factory is hoisted above the imports, so these cannot be
  // module-level imports: they would be `undefined` by the time it runs.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const actual = jest.requireActual("react-native-gesture-handler");

  return {
    ...actual,
    GestureHandlerRootView: (props: Record<string, unknown>) =>
      React.createElement(View, { ...props, testID: "enhancer-gesture-root" }),
  };
});

jest.mock("@/services/AudioEffectsService", () => ({
  probe: jest.fn(),
  setEnhancer: jest.fn(),
}));

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120, quick: 180, base: 260 },
  press: { rest: 1, down: 0.92, overshoot: 1.05 },
  spring: {
    damping: 0.6,
    stiffness: 400,
    sheet: { damping: 20, stiffness: 180 },
    snappy: { damping: 18, stiffness: 320 },
  },
  easing: { outQuint: [0.22, 1, 0.36, 1] },
  curve: (_easing: unknown, ms: number) => ({ duration: ms }),
  useMotionEnabled: () => false,
}));

const service = AudioEffectsService as unknown as {
  probe: jest.Mock;
  setEnhancer: jest.Mock;
};

function renderSheet() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}>
      <AudioEnhancerSheet tint="#1FB6A6" onClose={() => {}} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAudioEffectsStore.getState().reset();
});

describe("AudioEnhancerSheet", () => {
  it("offers the three bands and asks the device about itself on the way in", async () => {
    useAudioEffectsStore.getState().patch({ enhancerAvailable: true });
    await renderSheet();

    expect(service.probe).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Boost")).toBeTruthy();
    expect(screen.getByLabelText("Bass")).toBeTruthy();
    expect(screen.getByLabelText("Treble")).toBeTruthy();
  });

  it("sends a band move to the service", async () => {
    useAudioEffectsStore.getState().patch({ enhancerAvailable: true });
    await renderSheet();

    await fireEvent(screen.getByLabelText("Bass"), "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });

    expect(service.setEnhancer).toHaveBeenCalledWith({ bassDb: 2 });
  });

  /**
   * A `Modal` is a window of its own, and a gesture handler only receives touches
   * from a root view inside that window. Without this the sliders draw correctly
   * and never move, while the switch — a plain native `Switch` — keeps working,
   * which is exactly how the bug was reported.
   */
  it("carries a gesture root of its own, so the sliders can be dragged", async () => {
    useAudioEffectsStore.getState().patch({ enhancerAvailable: true });
    await renderSheet();

    expect(screen.getByTestId("enhancer-gesture-root")).toBeTruthy();
  });

  it("switches the whole curve off from the switch", async () => {
    useAudioEffectsStore.getState().patch({
      enhancerAvailable: true,
      enhancer: { enabled: true, boostDb: 3, bassDb: 0, trebleDb: 0 },
    });
    await renderSheet();

    await fireEvent(screen.getByLabelText("Audio enhancer"), "valueChange", false);

    expect(service.setEnhancer).toHaveBeenCalledWith({ enabled: false });
  });

  it("offers no slider when the device cannot run the effect", async () => {
    useAudioEffectsStore.getState().patch({
      enhancerAvailable: false,
      enhancerReason: "This device refused the audio effect.",
      enhancer: DEFAULT_ENHANCER,
    });
    await renderSheet();

    expect(screen.queryByLabelText("Bass")).toBeNull();
    expect(screen.getByText("This device refused the audio effect.")).toBeTruthy();
  });

  it("does not claim to be shaping the sound while every band is flat", async () => {
    useAudioEffectsStore.getState().patch({
      enhancerAvailable: true,
      enhancer: { enabled: true, boostDb: 0, bassDb: 0, trebleDb: 0 },
    });
    await renderSheet();

    expect(screen.getByText("Every band is flat")).toBeTruthy();
  });

  it("resets a curve back to nothing", async () => {
    useAudioEffectsStore.getState().patch({
      enhancerAvailable: true,
      enhancer: { enabled: true, boostDb: 4, bassDb: -2, trebleDb: 1 },
    });
    await renderSheet();

    await fireEvent.press(screen.getByText("Reset"));

    expect(service.setEnhancer).toHaveBeenCalledWith(DEFAULT_ENHANCER);
  });
});
