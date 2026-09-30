/**
 * A titled group of rows inside a card.
 *
 * The pattern every reference settings screen converges on: an overline heading,
 * one card holding several hairline-separated rows, and an optional footer that
 * explains the group in a sentence.
 *
 * ## Why the footer
 *
 * The heading alone says *what* the group is. The footer says *why a row in it
 * behaves the way it does*, which is the question a settings screen actually
 * gets asked — "why is it still saying 14 things to sync?". A heading cannot
 * answer it and a row cannot either, because the answer belongs to the group.
 *
 * ## The entrance index
 *
 * `index` is on the section rather than on each row, and the stagger is
 * arithmetic rather than bookkeeping. The layout this replaces numbered its
 * `Reveal`s by hand across five sections (`1,2 / 3,4 / 5,6 / 7,8 / 9,10`), so
 * adding a group silently reordered every entrance on the screen.
 */

import { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Reveal } from "@/components/motion/Reveal";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card/card";
import { spacing } from "@/theme/tokens";

export type CardSectionProps = {
  /** All-caps group heading. */
  title: string;
  /** A sentence under the card, in the quietest tier on the screen. */
  footer?: string | null;
  /** The rows. */
  children: ReactNode;
  /** Position in the screen's section list; drives the entrance stagger. */
  index?: number;
  style?: StyleProp<ViewStyle>;
};

export function CardSection({
  title,
  footer,
  children,
  index = 0,
  style,
}: CardSectionProps) {
  return (
    <View style={[styles.section, style]}>
      <Reveal index={index}>
        <ThemedText type="overline" themeColor="textTertiary">
          {title}
        </ThemedText>
      </Reveal>

      <Reveal index={index + 1}>
        {/* Unpadded: the rows own their own insets, so a divider can start
            where the words start instead of at the card's edge. */}
        <Card padded={false}>{children}</Card>
      </Reveal>

      {footer ? (
        <Reveal index={index + 2}>
          <ThemedText type="caption" themeColor="textTertiary" style={styles.footer}>
            {footer}
          </ThemedText>
        </Reveal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.xs,
  },
});
