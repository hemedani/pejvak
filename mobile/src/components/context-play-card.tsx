/**
 * One collection run in the History list.
 *
 * This is where a half-heard series becomes visible: the outcome line says
 * "Stopped at 9 of 24" rather than leaving the reader to compare two numbers,
 * and the scope line names the collection it was a run through. Tapping the body
 * picks the collection back up; the two trailing buttons open the collection
 * itself and remove the entry.
 *
 * The trailing buttons are deliberately *siblings* of the pressable rather than
 * children — nested, the card would resume playback on the way to the button.
 */

import { StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import type { LocalContextPlay } from "@/lib/db/types";
import { formatDuration, formatTimeRange } from "@/lib/history";
import { describeContextType, describeRunOutcome, describeRunScope } from "@/lib/playbackContext";
import { spacing } from "@/theme/tokens";

export type ContextPlayCardProps = {
  run: LocalContextPlay;
  /** Picks the collection back up where the run left it. */
  onPress?: (run: LocalContextPlay) => void;
  /** Opens the collection's own screen. */
  onOpen?: (run: LocalContextPlay) => void;
  /** Omit to hide the remove button. */
  onDelete?: (run: LocalContextPlay) => void;
};

/** The glyph a run's outcome gets: heard through, or left partway. */
function outcomeIcon(tone: "done" | "partial"): IconName {
  return tone === "done" ? "check" : "history";
}

export function ContextPlayCard({ run, onPress, onOpen, onDelete }: ContextPlayCardProps) {
  const theme = useTheme();
  const outcome = describeRunOutcome(run);
  const typeLabel = describeContextType(run.contextType);
  // A finished run has nothing to continue, so tapping it starts the collection
  // over. Saying "Continue" there would promise a resume that never happens.
  const action = run.completed ? "Replay" : "Continue";
  const outcomeColor = outcome.tone === "partial" ? theme.accent : theme.textTertiary;

  const body = (
    <>
      <View style={styles.main}>
        <ThemedText type="bodyStrong" numberOfLines={1}>
          {run.contextTitle}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {typeLabel} · {formatTimeRange(run.startedAt, run.endedAt)}
        </ThemedText>
        <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
          {describeRunScope(run)}
        </ThemedText>
      </View>

      <View style={styles.meta}>
        <ThemedText type="bodyStrong" style={{ color: theme.accent }}>
          {formatDuration(run.listenedSec)}
        </ThemedText>
        <View style={styles.outcome}>
          <Icon name={outcomeIcon(outcome.tone)} size={12} color={outcomeColor} />
          <ThemedText type="caption" style={{ color: outcomeColor }}>
            {outcome.label}
          </ThemedText>
        </View>
      </View>
    </>
  );

  return (
    <GlassSurface flat style={styles.card}>
      {onPress ? (
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel={`${action} ${run.contextTitle}`}
          accessibilityHint={outcome.label}
          onPress={() => onPress(run)}
          style={styles.body}>
          {body}
        </ElasticPressable>
      ) : (
        <View style={styles.body}>{body}</View>
      )}

      {onOpen ? (
        <BouncyIconButton
          name={run.contextType === "folder" ? "folder" : "playlists"}
          accessibilityLabel={`Open ${typeLabel.toLowerCase()} ${run.contextTitle}`}
          size={36}
          iconSize={17}
          tone="ghost"
          onPress={() => onOpen(run)}
        />
      ) : null}

      {onDelete ? (
        <BouncyIconButton
          name="trash"
          accessibilityLabel={`Remove ${run.contextTitle} from history`}
          size={36}
          iconSize={17}
          tone="ghost"
          onPress={() => onDelete(run)}
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
