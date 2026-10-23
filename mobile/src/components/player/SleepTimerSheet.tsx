import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { SegmentedControl } from "@/components/ui/card/segmented-control";
import { NumberField } from "@/components/ui/field";
import { GlassSheet } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { formatRemaining, SLEEP_TIMER_CHOICES } from "@/lib/sleepTimer";
import { spacing } from "@/theme/tokens";

export type SleepTimerSheetProps = {
  active: boolean;
  remainingMs: number;
  onStart: (minutes: number) => void;
  onCancel: () => void;
  onClose: () => void;
};

const PRESETS = SLEEP_TIMER_CHOICES.map((minutes) => ({
  value: minutes,
  label: `${minutes} min`,
}));

/**
 * The sleep timer, as a sheet instead of a six-button system dialog.
 *
 * `Alert.alert` lists every action at the same weight and Android caps how many
 * it will show, which made the last preset unreachable on a small screen. A
 * segmented control states the common choice, and the number field covers the
 * rest without a scroll. Picking a preset starts it immediately — the timer is
 * the whole point of the sheet — while a custom duration needs its Start.
 */
export function SleepTimerSheet({
  active,
  remainingMs,
  onStart,
  onCancel,
  onClose,
}: SleepTimerSheetProps) {
  const [customMinutes, setCustomMinutes] = useState(20);
  const [preset, setPreset] = useState<number>(15);

  const startPreset = (minutes: number) => {
    setPreset(minutes);
    onStart(minutes);
    onClose();
  };

  return (
    <GlassSheet open tone="surfaceStrong" style={styles.sheet}>
      <View style={styles.group}>
        <View style={styles.header}>
          <ThemedText type="bodyStrong">Sleep timer</ThemedText>
          {active ? (
            <ThemedText type="caption" themeColor="textSecondary">
              Pauses in {formatRemaining(remainingMs)}
            </ThemedText>
          ) : null}
        </View>

        <SegmentedControl
          options={PRESETS}
          value={preset}
          onChange={startPreset}
          accessibilityLabel="Sleep timer duration"
        />

        <NumberField
          testID="sleep-custom"
          label="Or a custom duration"
          unit="min"
          value={customMinutes}
          onChange={setCustomMinutes}
          min={1}
          max={180}
          hint="Between 1 and 180 minutes"
        />

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (active) {
                onCancel();
              }
              onClose();
            }}>
            <ThemedText type="linkPrimary">
              {active ? "Cancel timer" : "Close"}
            </ThemedText>
          </Pressable>
          <PrimaryButton
            label="Start"
            onPress={() => {
              onStart(customMinutes);
              onClose();
            }}
            style={styles.action}
          />
        </View>
      </View>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    padding: spacing.lg,
  },
  group: {
    gap: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  action: {
    flex: 1,
  },
});
