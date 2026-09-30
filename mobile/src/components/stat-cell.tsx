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
 *
 * ## Reading order
 *
 * The figure is set in `figure` (26/32, tabular) because it is the reason the
 * cell exists, and the label sits under it in `text` — not above it in grey.
 * The layout this replaces put a 13px `textSecondary` label above a 20px value,
 * so the eye hit the label first and had to read it to know what the number
 * meant; here the number is the first thing the cell says and the label is the
 * plain-English gloss underneath.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { card as cardTokens, radius as radii, spacing } from "@/theme/tokens";

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
    <Card
      style={[
        styles.cell,
        // The open cell wears the accent so the detail panel below it is
        // obviously *its* panel, not a new section.
        expanded ? { borderColor: theme.accent } : null,
      ]}>
      <View style={styles.head}>
        {icon ? (
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <Icon name={icon} size={17} color={theme.accent} />
          </View>
        ) : (
          <View />
        )}
        {affordance ? <Icon name={caret} size={16} color={theme.textTertiary} /> : null}
      </View>

      <ThemedText type="figure" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </ThemedText>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
    </Card>
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
    gap: spacing.xxs,
    minHeight: 104,
    justifyContent: "space-between",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: cardTokens.badge,
  },
  badge: {
    width: cardTokens.badge,
    height: cardTokens.badge,
    borderRadius: radii.badge,
    alignItems: "center",
    justifyContent: "center",
  },
});
