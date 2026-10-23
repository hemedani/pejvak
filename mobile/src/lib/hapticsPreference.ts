/**
 * The in-memory haptics switch.
 *
 * Kept outside the settings store so `triggerHaptic` can be called from plain
 * functions and UI-thread bridges without importing the store, the database, or
 * `expo-sqlite`. `settingsStore` owns the persisted value and mirrors it here.
 */
let enabled = true;

export function isHapticsEnabled(): boolean {
  return enabled;
}

export function setHapticsPreference(value: boolean): void {
  enabled = value;
}
