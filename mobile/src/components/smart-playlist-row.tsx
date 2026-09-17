/**
 * One smart-playlist recipe as a list row.
 *
 * Two states, both honest: a recipe with picks shows how many and how long, and
 * a recipe with none shows *why* it is empty rather than a bare "0 tracks". An
 * empty recommendation is a fact about the library, and the listener can only
 * act on it if the row says what is missing.
 */

import { StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { formatDuration } from "@/lib/history";
import { paletteFor } from "@/lib/palette";
import type { SmartPlaylist, SmartRuleId } from "@/lib/smartPlaylists";
import { radius as radii, spacing } from "@/theme/tokens";

const RULE_ICONS: Record<SmartRuleId, IconName> = {
  continue: "play",
  series: "folder",
  commute: "speed",
  forgotten: "heart",
  review: "notes",
};

export type SmartPlaylistRowProps = {
  playlist: SmartPlaylist;
  onPress: () => void;
};

export function SmartPlaylistRow({ playlist, onPress }: SmartPlaylistRowProps) {
  const theme = useTheme();
  const { rule, picks, totalDurationSec, emptyReason, summary } = playlist;
  const empty = picks.length === 0;

  // A summary is a sentence ("… where you stopped."), so its full stop is
  // dropped before the duration is appended — otherwise the row reads
  // "… stopped. 3h 12m".
  const detail = empty
    ? (emptyReason ?? rule.tagline)
    : [summary.replace(/\.$/, ""), formatDuration(totalDurationSec)].filter(Boolean).join(" · ");

  return (
    <GlassSurface flat style={styles.row}>
      <ElasticPressable
        accessibilityRole="button"
        accessibilityLabel={`Open smart playlist ${rule.title}`}
        accessibilityState={{ disabled: empty }}
        disabled={empty}
        onPress={onPress}
        style={styles.rowMain}>
        <PaletteTile ramp={paletteFor(rule.id)} label={rule.title} size={44} radius={13} />
        <View style={styles.rowCopy}>
          <View style={styles.titleRow}>
            <Icon name={RULE_ICONS[rule.id]} size={14} color={empty ? theme.textTertiary : theme.accent} />
            <ThemedText type="bodyStrong" numberOfLines={1} style={styles.title}>
              {rule.title}
            </ThemedText>
          </View>
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2}>
            {detail}
          </ThemedText>
        </View>
      </ElasticPressable>

      <BouncyIconButton
        name="chevronRight"
        accessibilityLabel={`Open ${rule.title}`}
        size={36}
        iconSize={16}
        tone="ghost"
        disabled={empty}
        onPress={onPress}
      />
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    flexShrink: 1,
  },
});
