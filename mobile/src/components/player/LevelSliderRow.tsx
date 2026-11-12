/**
 * One level control on the player: a glyph and a name on the left, a slider in
 * the middle, the value on the right.
 *
 * Shared by the volume and the background tone because they are the same
 * control with different nouns. The listener learns the shape once — where the
 * track starts, where the thumb sits, how far a finger travels for a step — and
 * the second row costs nothing to read. Two hand-built rows would drift apart
 * on the first change to either.
 *
 * The name on the left is a fixed width so the track's two ends do not move as
 * the figure beside it grows from "Off" to "100%".
 */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/ui/icon";
import { Slider } from "@/components/ui/slider";
import { useTheme } from "@/hooks/use-theme";
import { spacing } from "@/theme/tokens";

export type LevelSliderRowProps = {
  icon: IconName;
  /** What the level is called. Short: the row is 44 pt tall and 92 pt wide. */
  label: string;
  /** 0–100, the slider's own scale. */
  level: number;
  /** The readout: "Off", "42%". */
  value: string;
  tint: string;
  /** Spoken name for the whole control. */
  accessibilityLabel: string;
  /** Spoken explanation of what the level does. */
  hint?: string;
  onChange: (level: number) => void;
  /**
   * Makes the name a button. Used by the tone row, where the name *is* the
   * choice and tapping it opens the list of sounds.
   */
  onPressLabel?: () => void;
  /** Drawn after the slider, for anything a row needs on the right. */
  children?: ReactNode;
};

export function LevelSliderRow({
  icon,
  label,
  level,
  value,
  tint,
  accessibilityLabel,
  hint,
  onChange,
  onPressLabel,
  children,
}: LevelSliderRowProps) {
  const theme = useTheme();

  const name = (
    <>
      <Icon name={icon} size={14} color={theme.textSecondary} />
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.name}>
        {label}
      </ThemedText>
      {onPressLabel ? <Icon name="chevronDown" size={13} color={theme.textTertiary} /> : null}
    </>
  );

  return (
    <View style={styles.root}>
      {onPressLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${accessibilityLabel}. Choose a different sound.`}
          onPress={onPressLabel}
          hitSlop={spacing.xs}
          style={styles.label}>
          {name}
        </Pressable>
      ) : (
        <View style={styles.label}>{name}</View>
      )}

      <Slider
        value={level}
        min={0}
        max={100}
        step={1}
        label={accessibilityLabel}
        hint={hint}
        tint={tint}
        onChange={onChange}
      />

      <ThemedText type="numeric" themeColor="textTertiary" style={styles.value}>
        {value}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    width: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  /** Yields before the chevron does: a long tone name truncates, the arrow stays. */
  name: {
    flexShrink: 1,
  },
  value: {
    width: 40,
    textAlign: "right",
  },
});
