/**
 * One figure in the Stats grid.
 *
 * A cell is either **navigable** or **expandable**, and the affordance says
 * which without needing a legend:
 *
 *   · `navigate` — a chevron. The tap leaves this screen for a list.
 *   · `expand`   — a disclosure caret that flips when open. The tap reveals
 *                  detail in place.
 *
 * That distinction is the point: a streak or a running total has no list behind
 * it, so a chevron there would promise a destination that does not exist.
 *
 * Without `onPress` the cell is a plain display card, which keeps it usable
 * anywhere a non-interactive figure is wanted.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/ui/icon";
import { GlassSurface } from "@/components/ui/glass";
import { useTheme } from "@/hooks/use-theme";
import { spacing } from "@/theme/tokens";

export type StatCellProps = {
  label: string;
  value: string;
  icon?: IconName;
  /** Position in its grid, for the staggered entrance. */
  index?: number;
  /** What a tap does — and therefore which affordance is drawn. */
  affordance?: "navigate" | "expand";
  /** Only meaningful with `affordance="expand"`. */
  expanded?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function StatCell({
  label,
  value,
  icon,
  index = 0,
  affordance,
  expanded = false,
  onPress,
  style,
}: StatCellProps) {
  const theme = useTheme();

  // Only rendered for interactive cells; a plain display card carries no caret.
  const caret: IconName =
    affordance === "navigate" ? "chevronRight" : expanded ? "chevronUp" : "chevronDown";

  const cell = (
    <GlassSurface
      flat
      style={[
        styles.cell,
        // The open cell wears the accent so the detail panel below it is
        // obviously *its* panel, not a new section.
        expanded ? { borderColor: theme.accent } : null,
      ]}>
      <View style={styles.head}>
        {icon ? <Icon name={icon} size={16} color={theme.accent} /> : null}
        {affordance ? <Icon name={caret} size={15} color={theme.textTertiary} /> : null}
      </View>
      <ThemedText type="heading" numberOfLines={1}>
        {value}
      </ThemedText>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
    </GlassSurface>
  );

  return (
    <Reveal index={index} style={style}>
      {onPress ? (
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel={`${value} ${label}`}
          accessibilityHint={
            affordance === "expand"
              ? expanded
                ? "Collapses the detail"
                : "Shows more detail"
              : "Opens the matching list"
          }
          accessibilityState={affordance === "expand" ? { expanded } : undefined}
          haptic="selection"
          onPress={onPress}>
          {cell}
        </ElasticPressable>
      ) : (
        cell
      )}
    </Reveal>
  );
}

const styles = StyleSheet.create({
  cell: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: 20,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
