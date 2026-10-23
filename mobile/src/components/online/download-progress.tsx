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
 * The headline and its controls are one `RowShell`, so a running download wraps
 * its chips onto a second line instead of squeezing the headline into a column
 * of two words. Nothing here decides *how*; the callbacks are the screen's, and
 * the numbers come from the job rows, so this file holds no state of its own.
 */

import { StyleSheet, View } from "react-native";

import { SwapIcon } from "@/components/motion/SwapIcon";
import { Card } from "@/components/ui/card";
import { GlassChip, GlassProgress } from "@/components/ui/glass";
import { RowShell, type RowAction } from "@/components/ui/row";
import { useTheme } from "@/hooks/use-theme";
import { formatBytes } from "@/lib/settings";
import type { DownloadSummary } from "@/services/DownloadService";
import { bar, control, spacing } from "@/theme/tokens";

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

  const actions: RowAction[] = [];
  if (!complete) {
    actions.push(
      running
        ? {
            key: "stop",
            width: control.md * 2,
            priority: 3,
            icon: "stopCircle",
            label: "Stop downloading",
            onPress: onCancel,
            node: <GlassChip label="Stop" icon="stopCircle" onPress={onCancel} />,
          }
        : {
            key: "resume",
            width: control.md * 2,
            priority: 3,
            icon: "cloudDownload",
            label: "Resume downloading",
            onPress: onRetry,
            node: (
              <GlassChip label="Resume" icon="cloudDownload" onPress={onRetry} />
            ),
          },
    );
  }
  actions.push({
    key: "delete",
    width: control.md * 2,
    priority: 1,
    icon: "trash",
    label: "Delete the downloaded audio",
    danger: true,
    onPress: onDelete,
    node: (
      <GlassChip
        label="Delete"
        icon="trash"
        accessibilityLabel="Delete the downloaded audio for this collection"
        onPress={onDelete}
        style={{ borderColor: theme.danger }}
      />
    ),
  });

  return (
    <Card padded={false} style={styles.card}>
      <RowShell
        density="dense"
        leading={
          <SwapIcon
            name={complete ? "checkCircle" : running ? "cloudDownload" : "alert"}
            size={18}
            color={complete ? theme.accent : failed > 0 ? theme.danger : theme.textSecondary}
          />
        }
        leadingWidth={18}
        title={headline}
        meta={detail}
        actions={actions}
        accessibilityLabel={headline}
      />
      {/* The bar is shown for a finished download too: a full bar is the
          clearest statement that there is nothing left to fetch. */}
      <View style={styles.progress}>
        <GlassProgress progress={ratio} tint={theme.accent} thickness={bar.thin} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  progress: {
    paddingHorizontal: spacing.md,
  },
});
