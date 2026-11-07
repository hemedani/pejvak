/**
 * A track's length, with its notes on it.
 *
 * The History sheet's bar answers "how much of this did I get through, and
 * where"; this one answers "where in this am I, and what else did I notice
 * around here". Same strip, different question — which is why it is a separate
 * component rather than a mode of the other one: nothing on the listening bar
 * means anything here (there is no fill, because a note is not a quantity of
 * listening) and inventing a zero-length "heard" segment to reuse it would be a
 * lie drawn in the accent colour.
 *
 * The open note's tick is drawn in the note's own colour and taller than its
 * neighbours, so the sheet's marker is the same colour as the row's tile and as
 * the marker the player draws. A tick that matched neither would read as a
 * different note.
 */

import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import type { NoteMarker } from "@/lib/noteDetail";
import { describeNoteTimeline } from "@/lib/noteDetail";
import { withAlpha } from "@/lib/palette";
import { formatClock } from "@/lib/time";
import { radius as radii, spacing } from "@/theme/tokens";

/** Matches the listening bar, so the two sheets look like one app. */
const STRIP_HEIGHT = 28;

export type NoteTimelineProps = {
  markers: readonly NoteMarker[];
  durationSec: number;
  /** The note's own colour. */
  tint: string;
};

function pct(value: number): `${number}%` {
  return `${Math.max(0, Math.min(1, value)) * 100}%`;
}

export function NoteTimeline({ markers, durationSec, tint }: NoteTimelineProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.strip, { backgroundColor: withAlpha(tint, 0.14) }]}>
        {markers.map((marker) => (
          <View
            key={marker.id}
            pointerEvents="none"
            style={[
              marker.current ? styles.current : styles.sibling,
              {
                left: pct(marker.ratio),
                backgroundColor: marker.current ? tint : theme.textTertiary,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.scale}>
        <ThemedText type="numeric" themeColor="textTertiary">
          {formatClock(0)}
        </ThemedText>
        <ThemedText type="numeric" themeColor="textTertiary">
          {formatClock(durationSec)}
        </ThemedText>
      </View>

      <ThemedText type="caption" themeColor="textSecondary">
        {describeNoteTimeline(markers.length)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  strip: {
    height: STRIP_HEIGHT,
    borderRadius: radii.xs,
  },
  /** The open note: full height, plus a little over, so it reads as the subject. */
  current: {
    position: "absolute",
    top: -4,
    bottom: -4,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  /** The others: shorter, so a crowded track stays readable. */
  sibling: {
    position: "absolute",
    top: 6,
    bottom: 6,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
    opacity: 0.6,
  },
  scale: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -spacing.xs,
  },
});
