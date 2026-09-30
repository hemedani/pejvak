/**
 * A listen, drawn as a bar.
 *
 * The strip is a sequence of segments — one per track the listen covered, each
 * as wide as that track is long — and each segment is filled across the part
 * that was actually heard. So the picture answers "how much of this did I get
 * through, and where" in one glance, which a percentage cannot: twenty tracks
 * with four played is a strip with four filled segments, not "20%".
 *
 * Two details carry meaning rather than decoration:
 *
 *   - **The marker is the resume point**, placed by the same number the Resume
 *     button seeks to. It is drawn in the text colour rather than the accent
 *     because it is a position, not a quantity — the accent is already saying
 *     "heard".
 *   - **A scrubbed segment is drawn lighter.** A seek makes the fill a *span*
 *     rather than a record of what was heard through, and pretending otherwise
 *     would be the bar claiming something the session row explicitly flagged as
 *     unknown.
 */

import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { formatDuration } from "@/lib/history";
import type { ListeningTimeline } from "@/lib/listeningTimeline";
import { withAlpha } from "@/lib/palette";
import { formatClock } from "@/lib/time";
import { radius as radii, spacing } from "@/theme/tokens";

/** Height of the strip. Tall enough that a 30-second fill is still visible. */
const STRIP_HEIGHT = 28;

export type ListeningTimelineBarProps = {
  timeline: ListeningTimeline;
  /** The listen's own colour, so the bar matches the card that opened the sheet. */
  tint: string;
};

/** A fraction as a percentage string, for `left`/`right`. */
function pct(value: number): `${number}%` {
  return `${Math.max(0, Math.min(1, value)) * 100}%`;
}

export function ListeningTimelineBar({ timeline, tint }: ListeningTimelineBarProps) {
  const theme = useTheme();
  const { segments, totalDurationSec, heardSec, markerRatio, seeked } = timeline;
  const empty = segments.length === 0;

  /**
   * The caption states the two numbers the bar cannot: how much time that was,
   * and whether any of it was jumped. "42m of 1h 10m" is the figure a listener
   * repeats to themselves; the strip is only the shape of it.
   */
  const caption = empty
    ? "Nothing was heard in this session."
    : `${formatDuration(heardSec)} heard of ${formatDuration(totalDurationSec)}${
        segments.length > 1 ? ` · ${segments.length} tracks` : ""
      }${seeked ? " · includes a jump" : ""}`;

  return (
    <View style={styles.wrap}>
      {empty ? null : (
        <>
          <View style={styles.strip}>
            {segments.map((segment) => (
              <View
                key={segment.key}
                style={[
                  styles.segment,
                  { flex: segment.durationSec, backgroundColor: withAlpha(tint, 0.14) },
                ]}>
                <View
                  style={[
                    styles.fill,
                    {
                      left: pct(segment.from),
                      right: pct(1 - segment.to),
                      backgroundColor: tint,
                      opacity: segment.seeked ? 0.55 : 1,
                    },
                  ]}
                />
              </View>
            ))}
            <View
              pointerEvents="none"
              style={[
                styles.marker,
                { left: pct(markerRatio), backgroundColor: theme.text },
              ]}
            />
          </View>

          <View style={styles.scale}>
            <ThemedText type="numeric" themeColor="textTertiary">
              {formatClock(0)}
            </ThemedText>
            <ThemedText type="numeric" themeColor="textTertiary">
              {formatClock(totalDurationSec)}
            </ThemedText>
          </View>
        </>
      )}

      <ThemedText type="caption" themeColor="textSecondary">
        {caption}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  strip: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 3,
    height: STRIP_HEIGHT,
  },
  segment: {
    borderRadius: radii.xs,
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  marker: {
    position: "absolute",
    top: -4,
    bottom: -4,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  scale: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -spacing.xs,
  },
});
