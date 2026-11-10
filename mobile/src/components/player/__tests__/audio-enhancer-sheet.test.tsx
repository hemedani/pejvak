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
