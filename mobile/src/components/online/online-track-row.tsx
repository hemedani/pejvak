/**
 * One track inside an online collection.
 *
 * The row has to say three things at once and say them quietly: what the item
 * is, whether it is playing, and whether it is on the device. It does that with
 * one leading marker and one trailing glyph rather than with badges, because a
 * course is thirty of these in a column and any row that shouts makes the list
 * unreadable.
 *
 * It owns its own card rather than being wrapped by the screen, so the card and
 * the row cannot drift apart — and so the leading marker can sit *on* the card,
 * tinted, instead of floating beside it.
 *
 * Titles are the reason this file is not trivial. They arrive in Persian, and a
 * right-to-left line left-aligned in a left-to-right layout reads as a rendering
 * bug; `isRtlText` flips the alignment per row, so a Persian course and a Latin
 * episode inside it both look deliberate.
 */

import { StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import type { LocalDownloadJob, LocalTrack } from "@/lib/db/types";
import { formatDuration } from "@/lib/history";
import { isRtlText } from "@/lib/online";
import { withAlpha } from "@/lib/palette";
import { radius as radii, spacing } from "@/theme/tokens";

export type OnlineTrackRowProps = {
  track: LocalTrack;
  /** 1-based position in the collection, shown when nothing is playing. */
  position: number;
  isCurrent: boolean;
  /** This track's own download row, when the collection is being downloaded. */
  job?: LocalDownloadJob | null;
  onPress: () => void;
};

function jobLabel(job: LocalDownloadJob): string | null {
  switch (job.state) {
    case "queued":
      return "Waiting";
    case "running":
      return "Downloading";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Stopped";
    default:
      return null;
  }
}

export function OnlineTrackRow({
  track,
  position,
  isCurrent,
  job,
  onPress,
}: OnlineTrackRowProps) {
  const theme = useTheme();
  const tint = theme.accent;
  const rtl = isRtlText(track.title);
  const downloaded = track.downloadedAt !== null;
  const pendingLabel = job && job.state !== "done" ? jobLabel(job) : null;

  const meta: string[] = [];
  if (track.durationSec > 0) {
    meta.push(formatDuration(track.durationSec));
  }
  if (downloaded) {
    meta.push("On device");
  } else if (pendingLabel) {
    meta.push(pendingLabel);
  } else {
    meta.push("Streams");
  }

  return (
    <Card elevated={false} style={styles.card}>
      <ElasticPressable
        accessibilityRole="button"
        accessibilityLabel={track.title}
        accessibilityHint={downloaded ? "Plays from this device" : "Streams from the source"}
        scaleTo={0.985}
        overshootTo={1.004}
        haptic="light"
        onPress={onPress}
        style={styles.row}>
        {/* The marker is a small glass chip rather than bare digits, so the row
            that is playing is findable in a column of thirty without reading. */}
        <View
          style={[
            styles.leading,
            {
              backgroundColor: isCurrent ? withAlpha(tint, 0.18) : theme.surfaceSunken,
              borderColor: isCurrent ? tint : theme.outlineVariant,
            },
          ]}>
          {isCurrent ? (
            <Icon name="play" size={14} color={tint} />
          ) : (
            <ThemedText type="numeric" themeColor="textTertiary">
              {String(position).padStart(2, "0")}
            </ThemedText>
          )}
        </View>

        <View style={styles.copy}>
          <ThemedText type="body" numberOfLines={2} style={rtl ? styles.rtl : undefined}>
            {track.title}
          </ThemedText>
          <ThemedText
            type="caption"
            themeColor="textSecondary"
            numberOfLines={1}
            style={rtl ? styles.rtl : undefined}>
            {meta.join(" · ")}
          </ThemedText>
        </View>

        <View style={styles.trailing}>
          {job?.state === "running" ? (
            <Icon name="cloudDownload" size={20} color={tint} />
          ) : downloaded ? (
            <Icon name="checkCircle" size={20} color={tint} />
          ) : job?.state === "failed" ? (
            <Icon name="alert" size={20} color={theme.danger} />
          ) : (
            <Icon name="stream" size={20} color={theme.textTertiary} />
          )}
        </View>
      </ElasticPressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  leading: {
    width: 30,
    height: 30,
    borderRadius: radii.xs,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  rtl: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  trailing: {
    width: 26,
    alignItems: "center",
  },
});
