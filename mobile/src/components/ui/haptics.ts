/**
 * Tactile feedback. Haptics are a finishing touch, never a failure mode — every
 * call is wrapped so a device without a taptic engine (or the web) simply does
 * nothing.
 */

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type HapticStyle = "none" | "selection" | "light" | "medium" | "heavy" | "success";

export function triggerHaptic(style: HapticStyle = "light"): void {
  if (Platform.OS === "web" || style === "none") {
    return;
  }
  try {
    switch (style) {
      case "selection":
        void Haptics.selectionAsync();
        break;
      case "success":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "medium":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "heavy":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case "light":
      default:
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
    }
  } catch {
    // No taptic engine, or the module is unavailable — carry on silently.
  }
}
