/**
 * A labelled list of facts inside a card.
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
 *
 * The label is the quieter half of the row on purpose. A fact's *value* is the
 * answer, so the value carries the contrast and the label recedes — the inverse
 * of the settings row, where the label names the thing and the value is a
 * footnote.
 */

import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/hooks/use-theme";
import type { Fact } from "@/lib/trackFacts";
import { card as cardTokens, hairline, spacing } from "@/theme/tokens";

export type FactListProps = {
  facts: Fact[];
};

export function FactList({ facts }: FactListProps) {
  const theme = useTheme();

  if (facts.length === 0) {
    return null;
  }

  return (
    <Card padded={false}>
      {facts.map((fact, index) => (
        <View
          key={fact.label}
          style={[
            fact.technical ? styles.stackedRow : styles.row,
            // Every row but the first carries the divider, so the card has no
            // stray line against its own border.
            index > 0 ? { borderTopWidth: hairline, borderTopColor: theme.outlineVariant } : null,
          ]}>
          <ThemedText type="caption" themeColor="textTertiary">
            {fact.label}
          </ThemedText>
          {fact.technical ? (
            <ThemedText type="numeric" selectable style={styles.technicalValue}>
              {fact.value}
            </ThemedText>
          ) : (
            <ThemedText type="body" numberOfLines={1} style={styles.value}>
              {fact.value}
            </ThemedText>
          )}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    minHeight: cardTokens.rowMinHeight,
    paddingHorizontal: cardTokens.padding,
    paddingVertical: spacing.md,
  },
  stackedRow: {
    gap: spacing.xxs,
    paddingHorizontal: cardTokens.padding,
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
