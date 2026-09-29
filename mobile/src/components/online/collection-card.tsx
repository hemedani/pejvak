/**
 * A collection card — one show, album or course.
 *
 * Shared by Browse, Favorites and Continue, because the three lists answer the
 * same question ("what is this, and where am I in it?") and three cards would
 * eventually disagree about how to render it. What differs between them is only
 * the middle line and the trailing control, so both are props.
 */

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { ThemedText } from "@/components/themed-text";
import { GlassProgress, GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { useScheme } from "@/hooks/use-theme";
import { paletteFor } from "@/lib/palette";
import { colors, spacing } from "@/theme/tokens";

export type CollectionCardProps = {
  title: string;
  /** The line under the title: "29 tracks", "12 of 29 · Downloaded". */
  meta?: string | null;
  artworkUrl?: string | null;
  /** Seeds the fallback gradient, so a coverless show still has an identity. */
  paletteKey: string;
  /** 0–1, drawn as a thin bar under the row. Omit for no progress bar. */
  progressRatio?: number | null;
  isFavorite?: boolean;
  /** Renders a filled bookmark. Omit for a read-only card. */
  onToggleFavorite?: () => void;
  /** Trailing slot for a download control. */
  trailing?: ReactNode;
  onPress: () => void;
  accessibilityHint?: string;
};

export function CollectionCard({
  title,
  meta,
  artworkUrl,
  paletteKey,
  progressRatio,
  isFavorite = false,
  onToggleFavorite,
  trailing,
  onPress,
  accessibilityHint,
}: CollectionCardProps) {
  const palette = colors[useScheme()];

  return (
    <GlassSurface radius="card" style={styles.card}>
      <ElasticPressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={accessibilityHint}
        scaleTo={0.985}
        overshootTo={1.004}
        haptic="light"
        onPress={onPress}
        style={styles.pressable}>
        <PaletteTile ramp={paletteFor(paletteKey)} label={title} source={artworkUrl} size={54} />
        <View style={styles.copy}>
          <ThemedText type="bodyStrong" numberOfLines={2}>
            {title}
          </ThemedText>
          {meta ? (
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {meta}
            </ThemedText>
          ) : null}
        </View>
        {onToggleFavorite ? (
          <ElasticPressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? "Remove from favorites" : "Add to favorites"}
            scaleTo={0.86}
            overshootTo={1.08}
            haptic="selection"
            onPress={onToggleFavorite}
            style={styles.iconButton}>
            <Icon
              name={isFavorite ? "bookmarkFilled" : "bookmark"}
              size={21}
              color={isFavorite ? palette.accent : palette.textTertiary}
            />
          </ElasticPressable>
        ) : null}
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </ElasticPressable>
      {progressRatio !== undefined && progressRatio !== null ? (
        <GlassProgress
          progress={progressRatio}
          tint={palette.accent}
          thickness={4}
          style={styles.progress}
        />
      ) : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
  },
  pressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  trailing: {
    alignItems: "center",
    justifyContent: "center",
  },
  progress: {
    marginTop: spacing.sm,
  },
});
