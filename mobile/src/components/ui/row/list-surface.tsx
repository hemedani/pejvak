/**
 * A card surface drawn across virtualised rows.
 *
 * `ListGroup` can draw one `Card` around a whole sequence because the sequence
 * is rendered as children in one view. A `FlatList` cannot: each row is its own
 * cell, and wrapping every row in a card turns one list into thirty panels.
 *
 * So the surface is split the same way the data is. Every cell carries the fill
 * and the two side hairlines; the first carries the top edge and the two top
 * corners, the last the bottom edge and the two bottom corners. `ListRow` still
 * draws the inset divider, so the result is visually identical to `ListGroup` —
 * including the rule that no line sits against the card's outer edge.
 *
 * The position is passed in, never cloned in. That is what lets a virtualised
 * section skip `ListGroup`'s child-cloning pass entirely.
 */

import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import type { ListRowPosition } from "@/lib/listSurface";
import { hairline, radius as radii } from "@/theme/tokens";

export type ListSurfaceProps = {
  position: ListRowPosition;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ListSurface({
  position,
  children,
  style,
  testID = "list-surface",
}: ListSurfaceProps) {
  const theme = useTheme();
  const first = position === "first" || position === "only";
  const last = position === "last" || position === "only";

  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          backgroundColor: theme.surface,
          borderColor: theme.outline,
          borderLeftWidth: hairline,
          borderRightWidth: hairline,
          borderTopWidth: first ? hairline : 0,
          borderBottomWidth: last ? hairline : 0,
          borderTopLeftRadius: first ? radii.card : 0,
          borderTopRightRadius: first ? radii.card : 0,
          borderBottomLeftRadius: last ? radii.card : 0,
          borderBottomRightRadius: last ? radii.card : 0,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    position: "relative",
  },
});
