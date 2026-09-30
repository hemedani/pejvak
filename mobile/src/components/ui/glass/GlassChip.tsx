/**
 * A small pill control for secondary actions and single-choice groups
 * (playback speed, sleep timer, appearance).
 *
 * Selected state is carried by the accent tint plus a soft accent wash rather
 * than by a heavy fill, so a row of chips stays quiet on top of artwork.
 *
 * ## The count, and why it replaces the icon
 *
 * A chip that is also a filter has to answer "how many are in there?" — that is
 * what tells a listener whose query matched nothing in this tab that it matched
 * something in another one. Showing the number *instead of* the icon is a
 * deliberate trade: the icon is decoration and the count is information, they
 * occupy the same slot, and swapping them keeps the chip exactly as wide as it
 * was so a row of them cannot start clipping the moment a query is typed.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

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
  /**
   * How many results this chip would show, or `null` when it is not a filter.
   * Zero is a real answer and is rendered — it is the one that sends the
   * listener somewhere else.
   */
  count?: number | null;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Caps the badge at three characters.
 *
 * A single Persian letter is a plausible keystroke and would match most of a
 * large library, so the number really can run to four digits — and a chip
 * reading "2847" is unreadable noise that also breaks the layout. "99+" says
 * the same thing at a glance.
 */
function formatCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function GlassChip({
  label,
  icon,
  selected = false,
  onPress,
  count,
  accessibilityLabel,
  style,
}: GlassChipProps) {
  const theme = useTheme();
  const counting = count !== null && count !== undefined;

  return (
    <ElasticPressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (counting ? `${label}, ${count} result${count === 1 ? "" : "s"}` : label)
      }
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
      {icon && !counting ? (
        <Icon name={icon} size={15} color={selected ? theme.accent : theme.icon} />
      ) : null}
      <ThemedText type="label" style={{ color: selected ? theme.accent : theme.text }}>
        {label}
      </ThemedText>
      {counting ? (
        <View
          style={[
            styles.count,
            { backgroundColor: selected ? theme.accent : theme.glassStrong },
          ]}>
          <ThemedText
            type="caption"
            style={{
              color: selected
                ? theme.onAccent
                : count === 0
                  ? theme.textTertiary
                  : theme.textSecondary,
            }}>
            {formatCount(count)}
          </ThemedText>
        </View>
      ) : null}
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
  count: {
    minWidth: 24,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
