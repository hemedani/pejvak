/**
 * The one status line a row may carry.
 *
 * The domain says *what* the state is and what to call it; this component says
 * how a status is drawn. Keeping the glyph here is deliberate: `src/lib` owns
 * wording and must not import an icon, so the vocabulary can be tested without
 * rendering.
 *
 * At most one per row. A second badge is a second thing to decode, and the meta
 * line already has room for everything that is not a state.
 */

import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import type { StatusKind, StatusSpec, StatusTone } from "@/lib/rowStatus";
import { spacing } from "@/theme/tokens";

const ICONS: Record<StatusKind, IconName> = {
  complete: "checkCircle",
  finished: "check",
  interrupted: "cloudOffline",
  continued: "playCircle",
  stopped: "stopCircle",
  downloaded: "cloudDone",
  downloading: "cloudDownload",
  failed: "alert",
  paused: "pause",
  missing: "alert",
  streamed: "stream",
  favorite: "heartFilled",
  current: "play",
  warning: "alert",
  info: "info",
};

const DEFAULT_TONE: Record<StatusKind, StatusTone> = {
  complete: "accent",
  finished: "accent",
  interrupted: "secondary",
  continued: "secondary",
  stopped: "secondary",
  downloaded: "accent",
  downloading: "tertiary",
  failed: "danger",
  paused: "tertiary",
  missing: "danger",
  streamed: "tertiary",
  favorite: "accent",
  current: "accent",
  warning: "danger",
  info: "tertiary",
};

export function StatusLine({ status }: { status: StatusSpec | null | undefined }) {
  const theme = useTheme();
  if (!status) {
    return null;
  }

  const tone = status.tone ?? DEFAULT_TONE[status.kind];
  const color =
    tone === "accent"
      ? theme.accent
      : tone === "danger"
        ? theme.danger
        : tone === "secondary"
          ? theme.textSecondary
          : theme.textTertiary;

  return (
    <View style={styles.line}>
      <Icon name={ICONS[status.kind]} size={12} color={color} />
      <ThemedText type="caption" numberOfLines={1} style={{ color }}>
        {status.label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
