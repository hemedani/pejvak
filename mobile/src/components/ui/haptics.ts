/**
 * Tactile feedback. Haptics are a finishing touch, never a failure mode — every
 * call is wrapped so a device without a taptic engine (or the web) simply does
 * nothing.
 *
 * Callers ask for an *intent* (`select`, `press`, `success`) rather than a
 * strength, so the physical mapping can change in one place. `scrub` is
 * throttled because a timeline drag can emit far more ticks than a finger can
 * distinguish.
 */

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { isHapticsEnabled } from "@/lib/hapticsPreference";

export type HapticIntent =
  | "none"
  | "tap"
  | "select"
  | "press"
  | "success"
  | "warning"
  | "error"
  | "scrub";

/** Fastest repeated scrub tick, in milliseconds. */
const SCRUB_FLOOR_MS = 40;

let lastScrubAt = 0;

export function triggerHaptic(intent: HapticIntent = "tap"): void {
  if (intent === "none" || Platform.OS === "web" || !isHapticsEnabled()) {
    return;
  }

  if (intent === "scrub") {
    const now = Date.now();
    if (now - lastScrubAt < SCRUB_FLOOR_MS) {
      return;
    }
    lastScrubAt = now;
  }

  try {
    switch (intent) {
      case "select":
      case "scrub":
        void Haptics.selectionAsync();
        break;
      case "press":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "success":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "warning":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "error":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case "tap":
      default:
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
    }
  } catch {
    // No taptic engine, or the module is unavailable — carry on silently.
  }
}
