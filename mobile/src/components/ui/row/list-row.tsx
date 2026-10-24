/**
 * One dense row inside a `ListGroup`.
 *
 * The divider is drawn here rather than as a border on the row because it must
 * start at the text, not at the card's edge: a full-bleed line across a tile
 * cuts the leading image in half. It is an absolutely positioned hairline, so
 * it adds no height and cannot shift the row when the text wraps.
 */

import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { RowShell, type RowShellProps } from "@/components/ui/row/row-shell";
import { useTheme } from "@/hooks/use-theme";
import type { ListRowPosition } from "@/lib/listSurface";
import { hairline, list as listTokens, listDividerInset } from "@/theme/tokens";

export type { ListRowPosition };

export type ListRowProps = Omit<RowShellProps, "density"> & {
  position?: ListRowPosition;
  /** Defaults to the 40pt dense tile. Pass the real leading width. */
  leadingWidth?: number;
};

export const ListRow = memo(function ListRow({
  position = "only",
  leadingWidth = 0,
  ...rest
}: ListRowProps) {
  const theme = useTheme();
  const divided = position !== "only" && position !== "first";

  return (
    <View style={styles.row}>
      {divided ? (
        <View
          testID="list-row-divider"
          pointerEvents="none"
          style={[
            styles.divider,
            {
              left: listDividerInset(leadingWidth),
              backgroundColor: theme.outlineVariant,
            },
          ]}
        />
      ) : null}
      <RowShell density="dense" leadingWidth={leadingWidth} {...rest} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    position: "relative",
    minHeight: listTokens.rowMinHeight,
  },
  divider: {
    position: "absolute",
    top: 0,
    right: 0,
    height: hairline,
  },
});
