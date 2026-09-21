/**
 * One listening stretch in the History list.
 *
 * A stretch is every track the player got through without the listener
 * deliberately changing track, so this card has to say two things a per-track
 * card cannot: which track the listen *started* on, and which one it *ended* on.
 * The headline therefore carries both ends joined by an arrow whenever the
 * stretch covered more than one file — "chapter 4" alone would not tell anyone
 * whether chapter 7 was reached.
 *
 * The one row that gets a marker is the stretch heard from the first second of
 * its first track through to the end of its last. It gets an accented border, an
 * accent wash and a "Complete" chip, because it is the only entry in this list
 * that means "you finished this" — everything else is a listen that stopped
 * somewhere. A marker that needed reading the captions to find would be no use.
 *
 * Tapping the body resumes playback; the trailing button removes the whole
 * stretch. Both trailing controls are deliberately *siblings* of the pressable
 * rather than children of it — nested, the card would run its press animation
 * and fire its own `onPress` while the finger is on the other glyph.
 */

import { StyleSheet, View } from "react-native";

import { AddToPlaylistButton } from "@/components/add-to-playlist";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import {
  describeSpeed,
  describeStretchTitle,
  formatDuration,
  formatPositionRange,
  formatTimeRange,
  stretchResumeTarget,
  type HistoryStretch,
} from "@/lib/history";
import {
  describeStretchOutcome,
  describeStretchTracks,
  type StretchOutcome,
} from "@/lib/listeningStretch";
import { paletteFor } from "@/lib/palette";
import { formatClock } from "@/lib/time";
import { spacing } from "@/theme/tokens";

export type StretchCardProps = {
  entry: HistoryStretch;
  onPress?: (entry: HistoryStretch) => void;
  /** Omit to hide the remove button — a stretch still in progress has no
   *  tombstone to write, since the tracker is still finalising it. */
  onDelete?: (entry: HistoryStretch) => void;
};

type Outcome = {
  label: string;
  icon: IconName;
  /** The complete marker is the only outcome drawn in the accent colour. */
  marked: boolean;
};

const OUTCOMES: Record<StretchOutcome, Outcome | null> = {
  complete: { label: "Complete", icon: "check", marked: true },
  finished: { label: "Finished", icon: "check", marked: false },
  interrupted: { label: "Interrupted", icon: "cloudOffline", marked: false },
  open: null,
};

export function StretchCard({ entry, onPress, onDelete }: StretchCardProps) {
  const theme = useTheme();
  const { stretch } = entry;
  const outcome = OUTCOMES[describeStretchOutcome(stretch)];
  const target = stretchResumeTarget(entry);
  const complete = stretch.isComplete;
  const title = describeStretchTitle(entry);

  const body = (
    <>
      <View style={styles.main}>
        <ThemedText type="bodyStrong" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {formatTimeRange(stretch.startedAt, stretch.endedAt)}
          {/* Only worth saying when it is more than one: "1 track" is noise on
              a card whose headline is already a single title. */}
          {stretch.trackCount > 1 ? ` · ${describeStretchTracks(stretch)}` : ""}
        </ThemedText>
        <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
          {/* First second of the first track, to the second the last one
              stopped at — the span the stretch actually covered. */}
          {formatPositionRange(stretch.startPositionSec, stretch.endPositionSec)}
          {/* Which collection the stretch was part of, on the same line — the
              row already carries three lines, and a fourth would grow every card
              in a 200-entry list. */}
          {entry.start.contextTitle ? ` · ${entry.start.contextTitle}` : ""}
        </ThemedText>
      </View>

      <View style={styles.meta}>
        <ThemedText type="bodyStrong" style={{ color: theme.accent }}>
          {formatDuration(stretch.listenedSec)}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {describeSpeed(stretch.playbackSpeed)}
        </ThemedText>
        {outcome ? (
          <View style={styles.outcome}>
            <Icon
              name={outcome.icon}
              size={12}
              color={outcome.marked ? theme.accent : theme.textTertiary}
            />
            <ThemedText
              type="caption"
              themeColor={outcome.marked ? "accent" : "textTertiary"}>
              {outcome.label}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <GlassSurface
      flat
      style={complete ? [styles.card, styles.complete, { borderColor: theme.accent }] : styles.card}>
      {/* First child, so it sits above the glass fill and below the content —
          the wash has to tint the panel without washing out the text on it. */}
      {complete ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.wash, { backgroundColor: theme.accentSoft }]}
        />
      ) : null}

      {onPress ? (
        <ElasticPressable
          accessibilityRole="button"
          // A stretch heard through replays from where it began, so the label has
          // to say "replay" rather than promise a resume that would instantly end.
          accessibilityLabel={
            stretch.completed
              ? `Replay ${title} from ${formatClock(target.positionSec)}`
              : `Resume ${title} at ${formatClock(target.positionSec)}`
          }
          accessibilityHint={`Listened for ${formatDuration(stretch.listenedSec)} over ${describeStretchTracks(stretch)}`}
          onPress={() => onPress(entry)}
          style={styles.body}>
          {body}
        </ElasticPressable>
      ) : (
        <View style={styles.body}>{body}</View>
      )}

      {/* Same sibling rule as the remove button: nested inside the pressable it
          would resume playback on the way to opening the picker. The whole
          stretch goes in, not just the track it began on — that is what the row
          stands for. */}
      <AddToPlaylistButton
        trackIds={[...new Set(entry.items.map((item) => item.track.id))]}
        title={entry.start.track.title}
        ramp={paletteFor(entry.start.track.contentHash)}
        artwork={entry.start.track.artworkUrl}
        size={36}
        iconSize={17}
        tone="ghost"
      />

      {onDelete ? (
        <BouncyIconButton
          name="trash"
          accessibilityLabel={`Remove ${title} from history`}
          size={36}
          iconSize={17}
          tone="ghost"
          onPress={() => onDelete(entry)}
        />
      ) : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 24,
  },
  complete: {
    // Thicker than the hairline every other panel wears, so a complete listen is
    // distinguishable at a glance and not only by reading the chip.
    borderWidth: 1.5,
  },
  wash: {
    borderRadius: 24,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    // Lets the title ellipsise instead of pushing the meta column off-screen.
    minWidth: 0,
  },
  main: {
    flex: 1,
    gap: spacing.xxs,
  },
  meta: {
    alignItems: "flex-end",
    gap: spacing.xxs,
  },
  outcome: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
