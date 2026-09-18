/**
 * A labelled list of facts inside a glass card.
 *
 * Two row shapes, because a fact list holds two kinds of thing. A short value —
 * "44.1 kHz", "Stereo" — sits opposite its label on one line. A long exact
 * value — a file path, a 64-character hash — is stacked under its label and made
 * selectable, because the only reason to show a hash is to let someone copy it,
 * and right-aligning one across three wrapped lines is unreadable.
 *
 * Rows are separated by a hairline rather than given their own cards: a fact is
 * a line in a list, not a destination, and twenty cards would be twenty taps
 * that do nothing.
 */

import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { useTheme } from "@/hooks/use-theme";
import type { Fact } from "@/lib/trackFacts";
import { hairline, spacing } from "@/theme/tokens";

export type FactListProps = {
  facts: Fact[];
};

export function FactList({ facts }: FactListProps) {
  const theme = useTheme();

  if (facts.length === 0) {
    return null;
  }

  return (
    <GlassSurface flat style={styles.card}>
      {facts.map((fact, index) => (
        <View
          key={fact.label}
          style={[
            fact.technical ? styles.stackedRow : styles.row,
            // Every row but the first carries the divider, so the card has no
            // stray line against its own border.
            index > 0 ? { borderTopWidth: hairline, borderTopColor: theme.glassBorder } : null,
          ]}>
          <ThemedText type="caption" themeColor="textSecondary">
            {fact.label}
          </ThemedText>
          {fact.technical ? (
            <ThemedText type="numeric" selectable style={styles.technicalValue}>
              {fact.value}
            </ThemedText>
          ) : (
            <ThemedText type="bodyStrong" numberOfLines={1} style={styles.value}>
              {fact.value}
            </ThemedText>
          )}
        </View>
      ))}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  stackedRow: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  value: {
    flexShrink: 1,
    textAlign: "right",
  },
  technicalValue: {
    lineHeight: 19,
  },
});
