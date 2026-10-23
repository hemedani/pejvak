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
 * that do nothing. The hairline starts at the text, not at the card's edge.
 *
 * ## Reading order
 *
 * The label leads — `body` in the primary text colour — and the value follows in
 * `numeric`/`textSecondary`. That is the shared tier contract, and the inverse
 * of what this file used to draw: a `caption`/`textTertiary` label above a
 * `body` value made the answer louder than the question, which is exactly the
 * inversion the design system forbids. A stacked technical value keeps the
 * numeric face because it is read as a sequence of digits, but the label still
 * comes first.
 */

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/hooks/use-theme";
import type { Fact } from "@/lib/trackFacts";
import { card as cardTokens, hairline, spacing } from "@/theme/tokens";

export type FactListProps = {
  facts: Fact[];
  /** Drawn above the first fact, inside the same card. */
  header?: ReactNode;
};

export function FactList({ facts, header }: FactListProps) {
  const theme = useTheme();

  if (facts.length === 0) {
    return null;
  }

  return (
    <Card padded={false}>
      {header ? <View style={styles.header}>{header}</View> : null}
      {facts.map((fact, index) => (
        <View key={fact.label} style={styles.group}>
          {/* Every row but the first carries the divider, so the card has no
              stray line against its own border. The header counts as a row. */}
          {index > 0 || header ? (
            <View
              pointerEvents="none"
              style={[styles.divider, { backgroundColor: theme.outlineVariant }]}
            />
          ) : null}
          <View style={fact.technical ? styles.stackedRow : styles.row}>
            <ThemedText type="body">{fact.label}</ThemedText>
            {fact.technical ? (
              <ThemedText type="numeric" themeColor="textSecondary" selectable>
                {fact.value}
              </ThemedText>
            ) : (
              <ThemedText
                type="numeric"
                themeColor="textSecondary"
                numberOfLines={1}
                style={styles.value}>
                {fact.value}
              </ThemedText>
            )}
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  group: {
    position: "relative",
  },
  divider: {
    position: "absolute",
    top: 0,
    left: cardTokens.padding,
    right: 0,
    height: hairline,
  },
  header: {
    paddingHorizontal: cardTokens.padding,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
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
});
