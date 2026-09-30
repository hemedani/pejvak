/**
 * One row inside a card.
 *
 * ## The hierarchy, in one place
 *
 * A settings row carries three things and they are *not* interchangeable:
 *
 *   · **label** — what this row is. `body` in `text`. This is the primary read.
 *   · **detail** — supporting context, a unit, a breakdown. `caption` in
 *     `textTertiary`. Third.
 *   · **value** — the answer. `numeric` in `textSecondary`, right-aligned and
 *     tabular.
 *
 * The layout this replaces drew the label at 13px grey and the value at 16px
 * bold, so the eye landed on the value and skipped the label — on a row reading
 * *"Last synced — Never"*, you saw **Never** and had no idea what it meant.
 * Label first, value quiet, always.
 *
 * ## The badge
 *
 * The leading glyph badge is the highest beauty-per-line decision in the file.
 * It gives the eye something to anchor on, it is what makes a settings list read
 * as designed rather than as a form, and it is why the rows are scannable at
 * arm's length without reading a single word.
 *
 * ## Dividers
 *
 * A divider is inset to the start of the text, never to the card's edge: a line
 * that runs the full width of the card cuts the group into unrelated pieces,
 * while a line that starts where the words start reads as a list.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { card as cardTokens, hairline, radius as radii, spacing } from "@/theme/tokens";

/** Where a row sits in its group — drives the divider above it. */
export type CardRowPosition = "only" | "first" | "middle" | "last";

export type CardRowProps = {
  /** The primary read. What this row is. */
  label: string;
  /** Optional second line, third in the hierarchy. */
  detail?: string | null;
  /** The answer, right-aligned. Kept quiet on purpose. */
  value?: string | null;
  /** Leading glyph, drawn in a tinted badge. */
  icon?: IconName;
  /** Tints the badge and the label — for a row that reports state. */
  tone?: "neutral" | "accent" | "danger";
  /** Trailing control: a switch, a checkmark, a chevron. */
  trailing?: React.ReactNode;
  /** Draws a chevron and makes the whole row a press target. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Position in the group. Anything but `first` draws a divider above. */
  position?: CardRowPosition;
  /** Skip the badge and pull the text to the card's leading edge. */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function CardRow({
  label,
  detail,
  value,
  icon,
  tone = "neutral",
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  position = "only",
  flush = false,
  style,
}: CardRowProps) {
  const theme = useTheme();

  const accent = tone === "danger" ? theme.danger : theme.accent;
  const wash = tone === "danger" ? "rgba(176, 47, 69, 0.12)" : theme.accentSoft;

  const body = (
    <>
      {icon && !flush ? (
        <View style={[styles.badge, { backgroundColor: wash }]}>
          <Icon name={icon} size={cardTokens.badgeIcon} color={tone === "neutral" ? theme.icon : accent} />
        </View>
      ) : null}

      <View style={styles.copy}>
        <ThemedText
          type="body"
          numberOfLines={1}
          style={tone === "neutral" ? undefined : { color: accent }}>
          {label}
        </ThemedText>
        {detail ? (
          <ThemedText type="caption" themeColor="textTertiary" numberOfLines={2}>
            {detail}
          </ThemedText>
        ) : null}
      </View>

      {value ? (
        <ThemedText type="numeric" themeColor="textSecondary" numberOfLines={1}>
          {value}
        </ThemedText>
      ) : null}

      {trailing}
      {onPress ? <Icon name="chevronRight" size={18} color={theme.textTertiary} /> : null}
    </>
  );

  return (
    <View
      style={[
        styles.row,
        // Every row but the first carries the divider, so the card has no stray
        // line against its own top edge.
        position !== "first" && position !== "only"
          ? { borderTopWidth: hairline, borderTopColor: theme.outlineVariant }
          : null,
        style,
      ]}>
      {onPress ? (
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
          accessibilityHint={accessibilityHint}
          scaleTo={0.985}
          haptic="light"
          onPress={onPress}
          style={styles.content}>
          {body}
        </ElasticPressable>
      ) : (
        <View style={styles.content}>{body}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: cardTokens.rowMinHeight,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: cardTokens.rowMinHeight,
    paddingVertical: spacing.md,
    paddingHorizontal: cardTokens.padding,
  },
  badge: {
    width: cardTokens.badge,
    height: cardTokens.badge,
    borderRadius: radii.badge,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
});
