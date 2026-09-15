/**
 * A small pill control for secondary actions and single-choice groups
 * (playback speed, sleep timer, appearance).
 *
 * Selected state is carried by the accent tint plus a soft accent wash rather
 * than by a heavy fill, so a row of chips stays quiet on top of artwork.
 */

import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { hairline, radius as radii, spacing } from "@/theme/tokens";

export type GlassChipProps = {
  label: string;
  icon?: IconName;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function GlassChip({
  label,
  icon,
  selected = false,
  onPress,
  accessibilityLabel,
  style,
}: GlassChipProps) {
  const theme = useTheme();

  return (
    <ElasticPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      haptic="selection"
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.accentSoft : theme.glass,
          borderColor: selected ? theme.accent : theme.glassBorder,
        },
        style,
      ]}>
      {icon ? (
        <Icon name={icon} size={15} color={selected ? theme.accent : theme.icon} />
      ) : null}
      <ThemedText type="label" style={{ color: selected ? theme.accent : theme.text }}>
        {label}
      </ThemedText>
    </ElasticPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: hairline,
  },
});
