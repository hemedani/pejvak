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
 * Tapping the body opens the listen's own sheet, where the timeline, the facts,
 * the resume and the remove control live; the trailing button removes the whole
 * stretch directly. Both trailing controls are deliberately *siblings* of the
 * pressable rather than children of it — nested, the card would run its press
 * animation and fire its own `onPress` while the finger is on the other glyph.
 */

import { StyleSheet, View } from "react-native";

import { AddToPlaylistButton } from "@/components/add-to-playlist";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
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
import { card as cardTokens, radius as radii, spacing } from "@/theme/tokens";

export type StretchCardProps = {
  entry: HistoryStretch;
  /**
   * Opens this listen's own sheet — the timeline, the facts, resume, remove.
   *
   * The card deliberately does not resume on tap any more. A listen is a thing
   * worth looking at before acting on, and the resume the row used to perform is
   * now the sheet's primary button, one tap further in.
   */
  onOpen?: (entry: HistoryStretch) => void;
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

export function StretchCard({ entry, onOpen, onDelete }: StretchCardProps) {
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
    <Card
      elevated={false}
      style={complete ? [styles.card, { borderColor: theme.accent }] : styles.card}>
      {/* First child, so it sits above the card fill and below the content —
          the wash has to tint the panel without washing out the text on it. */}
      {complete ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.wash, { backgroundColor: theme.accentSoft }]}
        />
      ) : null}

      {onOpen ? (
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel={`Details for ${title}`}
          // The hint names what the tap does *and* what is behind it: a listener
          // who wanted the resume the card used to perform is told, in the same
          // breath, that it is one tap further in and where it lands.
          accessibilityHint={`Listened for ${formatDuration(stretch.listenedSec)} over ${describeStretchTracks(stretch)}. Opens the timeline, and resumes at ${formatClock(target.positionSec)}.`}
          onPress={() => onOpen(entry)}
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
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: cardTokens.rowPadding,
  },
  wash: {
    // A complete listen is already announced by the accent border and the
    // "Complete" chip; the wash is what makes it findable while scrolling.
    borderRadius: radii.card,
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
