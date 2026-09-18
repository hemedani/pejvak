/**
 * One listening session in the History list.
 *
 * Tapping the body resumes playback at the position that session reached; the
 * trailing button removes the entry. The remove button is deliberately a
 * *sibling* of the pressable rather than a child of it — nested, the card would
 * run its press animation and fire its own `onPress` while the finger is on the
 * delete glyph.
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
  formatDuration,
  formatPositionRange,
  formatTimeRange,
  resumeTargetSec,
  type HistoryItem,
} from "@/lib/history";
import { paletteFor } from "@/lib/palette";
import { formatClock } from "@/lib/time";
import { spacing } from "@/theme/tokens";

export type SessionCardProps = {
  item: HistoryItem;
  onPress?: (item: HistoryItem) => void;
  /** Omit to hide the remove button — a session still in progress has no
   *  tombstone to write, since the tracker is still finalising it. */
  onDelete?: (item: HistoryItem) => void;
};

type Outcome = {
  label: string;
  icon: IconName;
};

function outcome(item: HistoryItem): Outcome | null {
  if (item.session.completed) {
    return { label: "Finished", icon: "check" };
  }
  if (item.session.interrupted) {
    return { label: "Interrupted", icon: "cloudOffline" };
  }
  return null;
}

export function SessionCard({ item, onPress, onDelete }: SessionCardProps) {
  const theme = useTheme();
  const result = outcome(item);
  const resumeSec = resumeTargetSec(item);

  const body = (
    <>
      <View style={styles.main}>
        <ThemedText type="bodyStrong" numberOfLines={1}>
          {item.track.title}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {formatTimeRange(item.session.startedAt, item.session.endedAt)}
        </ThemedText>
        <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
          {formatPositionRange(item.session.startPositionSec, item.session.endPositionSec)}
        </ThemedText>
      </View>

      <View style={styles.meta}>
        <ThemedText type="bodyStrong" style={{ color: theme.accent }}>
          {formatDuration(item.session.durationListenedSec)}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {describeSpeed(item.session.playbackSpeed)}
        </ThemedText>
        {result ? (
          <View style={styles.outcome}>
            <Icon name={result.icon} size={12} color={theme.textTertiary} />
            <ThemedText type="caption" themeColor="textTertiary">
              {result.label}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <GlassSurface flat style={styles.card}>
      {onPress ? (
        <ElasticPressable
          accessibilityRole="button"
          // A finished session replays from where it began, so the label has to
          // say "replay" rather than promise a resume that would instantly end.
          accessibilityLabel={
            item.session.completed
              ? `Replay ${item.track.title} from ${formatClock(resumeSec)}`
              : `Resume ${item.track.title} at ${formatClock(resumeSec)}`
          }
          accessibilityHint={`Listened for ${formatDuration(item.session.durationListenedSec)}`}
          onPress={() => onPress(item)}
          style={styles.body}>
          {body}
        </ElasticPressable>
      ) : (
        <View style={styles.body}>{body}</View>
      )}

      {/* Same sibling rule as the remove button: nested inside the pressable it
          would resume playback on the way to opening the picker. */}
      <AddToPlaylistButton
        trackIds={[item.track.id]}
        title={item.track.title}
        ramp={paletteFor(item.track.contentHash)}
        artwork={item.track.artworkUrl}
        size={36}
        iconSize={17}
        tone="ghost"
      />

      {onDelete ? (
        <BouncyIconButton
          name="trash"
          accessibilityLabel={`Remove ${item.track.title} from history`}
          size={36}
          iconSize={17}
          tone="ghost"
          onPress={() => onDelete(item)}
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
