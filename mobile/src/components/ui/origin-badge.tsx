/**
 * The local / online marker on a card or a row.
 *
 * A badge rather than a status line: status is a *state* a row reaches (finished,
 * downloading, missing) and a row may carry only one. Provenance is a property
 * of the thing itself and never changes, so it rides on the meta line where the
 * counts already are — present on every row that has one, and never competing
 * with the one status the row is allowed.
 *
 * The glyph carries the meaning at a glance (a phone, a cloud, a stack) and the
 * word carries it for anyone who cannot see the glyph, so the two never have to
 * be read together.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { describeOrigin, type ItemOrigin } from "@/lib/origin";
import { radius as radii, spacing } from "@/theme/tokens";

const GLYPHS: Record<ItemOrigin, IconName> = {
  local: "device",
  online: "stream",
  mixed: "layers",
};

export type OriginBadgeProps = {
  origin?: ItemOrigin | null;
  style?: StyleProp<ViewStyle>;
};

export function OriginBadge({ origin, style }: OriginBadgeProps) {
  const theme = useTheme();
  if (!origin) {
    return null;
  }

  const spec = describeOrigin(origin);
  // Local is the quiet case — most of a library is local, and a badge that
  // shouts on every row stops marking anything. Online is the one that changes
  // what the listener can do with the item, so it gets the accent.
  const tint =
    origin === "online"
      ? theme.accent
      : origin === "mixed"
        ? theme.textSecondary
        : theme.textTertiary;

  return (
    <View
      accessible
      accessibilityLabel={spec.description}
      style={[
        styles.badge,
        { backgroundColor: theme.surfaceSunken, borderColor: theme.outlineVariant },
        style,
      ]}>
      <Icon name={GLYPHS[origin]} size={10} color={tint} />
      <ThemedText type="overline" style={[styles.label, { color: tint }]}>
        {spec.label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 16,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.badge,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  label: {
    // The overline's tracking is tuned for an eyebrow above a title; inside a
    // 16pt pill it pushes the word past the edge.
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.4,
  },
});
