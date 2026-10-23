import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { TimeField } from "@/components/ui/field";
import { GlassSheet } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { clampSeconds } from "@/lib/time";
import { spacing } from "@/theme/tokens";

export type JumpToTimeSheetProps = {
  positionSec: number;
  durationSec: number;
  onSeek: (seconds: number) => void;
  onClose: () => void;
};

/**
 * A jump box beside the scrubber, not a replacement for it.
 *
 * Scrubbing is for the neighbourhood; a listener who knows the timestamp wants
 * to type four digits and land there. The field clamps to the track's duration
 * while typing, so Go can never seek past the end.
 */
export function JumpToTimeSheet({
  positionSec,
  durationSec,
  onSeek,
  onClose,
}: JumpToTimeSheetProps) {
  const [seconds, setSeconds] = useState(() =>
    clampSeconds(positionSec, durationSec),
  );

  return (
    <GlassSheet open tone="surfaceStrong" style={styles.sheet}>
      <View style={styles.group}>
        <ThemedText type="bodyStrong">Go to time</ThemedText>

        <TimeField
          testID="jump-time"
          label="Timecode"
          valueSec={seconds}
          onChangeSec={setSeconds}
          maxSec={durationSec}
          autoFocus
        />

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onClose}>
            <ThemedText type="linkPrimary">Cancel</ThemedText>
          </Pressable>
          <PrimaryButton
            label="Go"
            onPress={() => {
              onSeek(clampSeconds(seconds, durationSec));
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
