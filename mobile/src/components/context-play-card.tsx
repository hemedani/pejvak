/**
 * One collection run in a list.
 *
 * This is where a half-heard series becomes visible: the status line says
 * "Stopped at 9 of 24" rather than leaving the reader to compare two numbers,
 * and the detail line names the collection it was a run through. Tapping the
 * body picks the collection back up; the trailing controls open the collection
 * itself and remove the entry.
 *
 * The trailing controls are deliberately *siblings* of the pressable rather
 * than children — nested, the row would resume playback on the way to the
 * button.
 */

import { StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ThemedText } from "@/components/themed-text";
import {
  RecordRow,
  type ListRowPosition,
  type RowAction,
} from "@/components/ui/row";
import { useTheme } from "@/hooks/use-theme";
import { joinMeta } from "@/lib/cardMeta";
import type { LocalContextPlay } from "@/lib/db/types";
import { formatDuration, formatTimeRange } from "@/lib/history";
import {
  describeContextType,
  describeRunScope,
  describeRunStatus,
} from "@/lib/playbackContext";
import { control, spacing } from "@/theme/tokens";

export type ContextPlayCardProps = {
  run: LocalContextPlay;
  /** Picks the collection back up where the run left it. */
  onPress?: (run: LocalContextPlay) => void;
  /** Opens the collection's own screen. */
  onOpen?: (run: LocalContextPlay) => void;
  /** Omit to hide the remove button. */
  onDelete?: (run: LocalContextPlay) => void;
  /** Set by `ListGroup`; a row outside a group is its own whole card. */
  position?: ListRowPosition;
};

export function ContextPlayCard({
  run,
  onPress,
  onOpen,
  onDelete,
  position,
}: ContextPlayCardProps) {
  const theme = useTheme();
  const status = describeRunStatus(run);
  const typeLabel = describeContextType(run.contextType);
  // A finished run has nothing to continue, so tapping it starts the collection
  // over. Saying "Continue" there would promise a resume that never happens.
  const action = run.completed ? "Replay" : "Continue";

  const actions: RowAction[] = [];

  if (onOpen) {
    const open = () => onOpen(run);
    const icon = run.contextType === "folder" ? "folder" : "playlists";
    const label = `Open ${typeLabel.toLowerCase()} ${run.contextTitle}`;
    actions.push({
      key: "open",
      width: control.sm,
      priority: 2,
      icon,
      label,
      onPress: open,
      node: (
        <BouncyIconButton
          name={icon}
          accessibilityLabel={label}
          size={control.sm}
          iconSize={17}
          tone="ghost"
          onPress={open}
        />
      ),
    });
  }

  if (onDelete) {
    const remove = () => onDelete(run);
    const label = `Remove ${run.contextTitle} from history`;
    actions.push({
      key: "delete",
      width: control.sm,
      priority: 1,
      icon: "trash",
      label,
      danger: true,
      onPress: remove,
      node: (
        <BouncyIconButton
          name="trash"
          accessibilityLabel={label}
          size={control.sm}
          iconSize={17}
          tone="ghost"
          onPress={remove}
        />
      ),
    });
  }

  return (
    <RecordRow
      position={position}
      title={run.contextTitle}
      meta={joinMeta([typeLabel, formatTimeRange(run.startedAt, run.endedAt)])}
      detail={describeRunScope(run)}
      status={status}
      trailing={
        <View style={styles.meta}>
          <ThemedText type="numeric" style={{ color: theme.accent }}>
            {formatDuration(run.listenedSec)}
          </ThemedText>
        </View>
      }
      onPress={onPress ? () => onPress(run) : undefined}
      accessibilityLabel={`${action} ${run.contextTitle}`}
      accessibilityHint={status.label}
      actions={actions}
    />
  );
}

const styles = StyleSheet.create({
  meta: {
    alignItems: "flex-end",
    gap: spacing.xxs,
  },
});
