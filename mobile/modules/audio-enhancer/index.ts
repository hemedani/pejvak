/**
 * The typed face of the `AudioEnhancer` native module.
 *
 * Loaded optionally, because it is native code and therefore absent in Expo Go
 * and on any build made before it was added. A missing module is a *state* the
 * enhancer sheet draws, not an error: everything else in the player — including
 * the room tone, which needs no native code — keeps working.
 */

import { requireOptionalNativeModule } from "expo-modules-core";

export type AudioEnhancerAttachResult = {
  /** Whether an equalizer could be attached to the output mix. */
  available: boolean;
  /** Why it could not, when `available` is false. */
  reason: string | null;
  /** How many bands this device exposes. Zero when unavailable. */
  bands: number;
  /** Whether a loudness enhancer is also available (the boost control). */
  boost: boolean;
};

export type AudioEnhancerNative = {
  attach(): AudioEnhancerAttachResult;
  setEnabled(enabled: boolean): void;
  /** Gains in dB. Applied whether or not the master switch is on. */
  setGains(boostDb: number, bassDb: number, trebleDb: number): void;
  detach(): void;
};

const AudioEnhancer = requireOptionalNativeModule<AudioEnhancerNative>("AudioEnhancer");

export default AudioEnhancer;
