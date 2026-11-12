import { create } from "zustand";

import { DEFAULT_TONE_ID, type AmbientToneId } from "@/lib/ambientTones";
import { DEFAULT_ENHANCER, type AudioEnhancerSettings } from "@/lib/audioEffects";

/**
 * What the two audio treatments are set to, as the screens read them.
 *
 * State only, like `playerStore`: `AudioEffectsService` is the single writer and
 * the single owner of the engine behind it, and a screen changes a value by
 * asking the service, never by setting it here. That is what keeps the sliders
 * and the audio from ever disagreeing — a slider that moved without the effect
 * moving would be the one bug this shape makes impossible.
 */
type AudioEffectsState = {
  enhancer: AudioEnhancerSettings;
  /**
   * The room tone's level, 0–100.
   *
   * Kept on the device rather than synced: whether a speaker drops its link
   * during silence is a fact about *this* pair of headphones, and a level that
   * followed the listener to a phone that did not need it would be noise they
   * never asked for.
   */
  roomTone: number;
  /**
   * Which sound the noise floor is made of.
   *
   * Device-local for the same reason as the level: the sink that needs a floor
   * is this pair of headphones, and the sound a listener wants under a lecture
   * is a preference about this room, not about their account.
   */
  tone: AmbientToneId;
  /**
   * Whether the native effects module is present and accepted the output mix.
   *
   * `null` until it has been asked. The sheet needs the third state: "not yet
   * known" must not render as "unavailable", or the controls flash an apology
   * on the way in.
   */
  enhancerAvailable: boolean | null;
  /** One sentence explaining an unavailable enhancer, or null. */
  enhancerReason: string | null;

  patch: (partial: AudioEffectsPatch) => void;
  reset: () => void;
};

export type AudioEffectsPatch = Partial<
  Omit<AudioEffectsState, "patch" | "reset">
>;

const initialState = {
  enhancer: DEFAULT_ENHANCER,
  roomTone: 0,
  tone: DEFAULT_TONE_ID as AmbientToneId,
  enhancerAvailable: null as boolean | null,
  enhancerReason: null as string | null,
};

export const useAudioEffectsStore = create<AudioEffectsState>((set) => ({
  ...initialState,

  patch: (partial) => set(partial),

  reset: () => set(initialState),
}));
