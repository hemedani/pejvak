import type { MotionPreference } from "@/lib/settings";

/**
 * Resolve the app's effective motion setting.
 *
 * `system` follows the OS, `full` is an explicit override for a listener who
 * wants motion even when the OS asks for less, and `reduced` never animates.
 */
export function resolveMotionEnabled(
  preference: MotionPreference,
  osReduced: boolean,
): boolean {
  if (preference === "reduced") {
    return false;
  }
  if (preference === "full") {
    return true;
  }
  return !osReduced;
}
