/**
 * One smart-playlist recipe as a list row.
 *
 * Two states, both honest: a recipe with picks shows how many and how long, and
 * a recipe with none shows *why* it is empty rather than a bare "0 tracks". An
 * empty recommendation is a fact about the library, and the listener can only
 * act on it if the row says what is missing.
 */

import { PaletteTile } from "@/components/motion/PaletteTile";
import { Icon } from "@/components/ui/icon";
import { ListRow, type ListRowPosition } from "@/components/ui/row";
import { useTheme } from "@/hooks/use-theme";
import { formatDuration } from "@/lib/history";
import { paletteFor } from "@/lib/palette";
import type { SmartPlaylist } from "@/lib/smartPlaylists";
import { tile, tileRadius } from "@/theme/tokens";

export type SmartPlaylistRowProps = {
  playlist: SmartPlaylist;
  onPress: () => void;
  /** Set by `ListGroup`; a row outside a group is its own whole card. */
  position?: ListRowPosition;
};

export function SmartPlaylistRow({ playlist, onPress, position }: SmartPlaylistRowProps) {
  const theme = useTheme();
  const { rule, picks, totalDurationSec, emptyReason, summary } = playlist;
  const empty = picks.length === 0;

  // A summary is a sentence ("… where you stopped."), so its full stop is
  // dropped before the duration is appended — otherwise the row reads
  // "… stopped. 3h 12m".
  const detail = empty
    ? (emptyReason ?? rule.tagline)
    : [summary.replace(/\.$/, ""), formatDuration(totalDurationSec)].filter(Boolean).join(" · ");

  return (
    <ListRow
      position={position}
      leading={
        <PaletteTile
          ramp={paletteFor(rule.id)}
          label={rule.title}
          size={tile.md}
          radius={tileRadius(tile.md)}
          recyclingKey={rule.id}
          dense
        />
      }
      leadingWidth={tile.md}
      title={rule.title}
      meta={detail}
      disabled={empty}
      disabledReason={empty ? (emptyReason ?? rule.tagline) : undefined}
      onPress={onPress}
      accessibilityLabel={`Open smart playlist ${rule.title}`}
      accessibilityHint={empty ? (emptyReason ?? rule.tagline) : undefined}
      trailing={<Icon name="chevronRight" size={16} color={theme.textTertiary} />}
    />
  );
}
