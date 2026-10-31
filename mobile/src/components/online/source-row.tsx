/**
 * One provider, as a dense row.
 *
 * Shared by the language screen and the Library's language tab: both answer
 * "who has audio in this language?", and a second copy of this row would let
 * the two drift until the same provider looked different depending on where it
 * was reached from.
 *
 * The mark is a gradient square rather than the provider's logo: we do not
 * hotlink their assets, and a deterministic tile keeps the row recognisable
 * without borrowing someone else's brand.
 */

import { StyleSheet, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { ListRow, type ListRowPosition } from "@/components/ui/row";
import { useTheme } from "@/hooks/use-theme";
import type { OnlineSource } from "@/lib/online";
import { paletteFor } from "@/lib/palette";
import { tile, tileRadius } from "@/theme/tokens";

export type SourceRowProps = {
  source: OnlineSource;
  onPress: () => void;
  /** Supplied by `ListGroup`; not part of the row's own API. */
  position?: ListRowPosition;
};

export function SourceRow({ source, onPress, position }: SourceRowProps) {
  const theme = useTheme();
  const ramp = paletteFor(source.id);

  return (
    <ListRow
      position={position}
      leading={
        <View style={[styles.mark, { backgroundColor: ramp[1] }]}>
          <Icon name="radio" size={20} color={theme.onAccent} />
        </View>
      }
      leadingWidth={tile.md}
      title={source.name}
      titleLines={1}
      meta={source.nativeName}
      detail={source.description}
      trailing={<Icon name="chevronRight" size={16} color={theme.textTertiary} />}
      onPress={onPress}
      accessibilityLabel={`${source.name}, ${source.nativeName}`}
      accessibilityHint="Opens this source's collections"
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    width: tile.md,
    height: tile.md,
    borderRadius: tileRadius(tile.md),
    alignItems: "center",
    justifyContent: "center",
  },
});
