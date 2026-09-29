/**
 * The download control for an online collection.
 *
 * One component, five states, one card — because "download this course" is a
 * single decision that the listener revisits in the middle of, and five
 * separate widgets (a button, a bar, a retry, a pause, a done-label) would each
 * have to guess when they are the relevant one.
 *
 * The states and what each means:
 *
 *   · **untouched** — nothing queued. Offer the download.
 *   · **downloading** — offer to stop. Stopping is not undo: what arrived stays.
 *   · **paused** — the listener stopped it. Offer to carry on.
 *   · **incomplete** — the queue drained with files missing. Offer to retry.
 *   · **on device** — every track is here. Nothing to offer but the fact.
 *
 * Delete is offered alongside all four, because it is not a state of the
 * download but the way out of having one: stopping keeps what arrived, and only
 * deleting gives the space back. The confirmation belongs to the screen, not
 * here — this file draws, it does not decide.
 *
 * Nothing here decides *how*; the callbacks are the screen's, and the numbers
 * come from the job rows, so this file holds no state of its own.
 */

import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { GlassChip, GlassProgress, GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { formatBytes } from "@/lib/settings";
import type { DownloadSummary } from "@/services/DownloadService";
import { spacing } from "@/theme/tokens";

export type DownloadControlProps = {
  /** Null until the collection's progress has been read. */
  summary: DownloadSummary | null;
  onStart: () => void;
  onCancel: () => void;
  onRetry: () => void;
  /** Remove what is on the device. The caller confirms before this runs. */
  onDelete: () => void;
};

export function DownloadControl({
  summary,
  onStart,
  onCancel,
  onRetry,
  onDelete,
}: DownloadControlProps) {
  const theme = useTheme();

  // Nothing to say yet. Rendering a disabled control here would flash a button
  // the listener cannot press on every open.
  if (!summary) {
    return null;
  }

  const { total, done, failed, bytesDone, bytesTotal, running } = summary;

  if (total === 0) {
    return (
      <GlassChip
        label="Download"
        icon="cloudDownload"
        accessibilityLabel="Download this collection"
        onPress={onStart}
      />
    );
  }

  const complete = done === total && failed === 0;
  const ratio = total > 0 ? done / total : 0;

  const headline = complete
    ? `On this device · ${total} track${total === 1 ? "" : "s"}`
    : running
      ? `Downloading · ${done} of ${total}`
      : failed > 0
        ? `${done} of ${total} downloaded · ${failed} failed`
        : `Paused at ${done} of ${total}`;

  const detail = complete
    ? bytesTotal > 0
      ? formatBytes(bytesTotal)
      : null
    : bytesTotal > 0
      ? `${formatBytes(bytesDone)} of ${formatBytes(bytesTotal)}`
      : null;

  return (
    <GlassSurface flat radius="card" style={styles.card}>
      <View style={styles.row}>
        <Icon
          name={complete ? "checkCircle" : running ? "cloudDownload" : "alert"}
          size={18}
          color={complete ? theme.accent : failed > 0 ? theme.danger : theme.textSecondary}
        />
        <ThemedText type="bodyStrong" style={styles.headline} numberOfLines={1}>
          {headline}
        </ThemedText>
        {complete ? null : running ? (
          <GlassChip label="Stop" icon="stopCircle" onPress={onCancel} />
        ) : (
          <GlassChip label="Resume" icon="cloudDownload" onPress={onRetry} />
        )}
        {/* Bordered in the danger colour rather than filled with it: this is a
            way out of the card, not the card's own action. */}
        <GlassChip
          label="Delete"
          icon="trash"
          accessibilityLabel="Delete the downloaded audio for this collection"
          onPress={onDelete}
          style={{ borderColor: theme.danger }}
        />
      </View>

      {/* The bar is shown for a finished download too: a full bar is the
          clearest statement that there is nothing left to fetch. */}
      <GlassProgress progress={ratio} tint={theme.accent} thickness={4} />
      {detail ? (
        <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
          {detail}
        </ThemedText>
      ) : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    // The control shares a wrapping row with the play chips, and a full-width
    // basis is what puts a running download on a line of its own instead of
    // squeezing it into the leftover space beside "Shuffle".
    width: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headline: {
    flex: 1,
    minWidth: 0,
  },
});
