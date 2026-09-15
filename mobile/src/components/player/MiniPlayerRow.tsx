/**
 * The now-playing row: artwork, title, and a play/pause button on frosted glass.
 *
 * Shared by the collapsed mini-player and by the first frame of the expanding
 * sheet, so the morph starts from a pixel-identical surface instead of a
 * lookalike. `renderMain` lets the mini-player wrap the tap target in a gesture
 * detector while the sheet renders it plainly.
 */

import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { CrossfadeArtwork } from "@/components/motion/CrossfadeArtwork";
import { ThemedText } from "@/components/themed-text";
import { GlassProgress } from "@/components/ui/glass/GlassProgress";
import { GlassSurface } from "@/components/ui/glass/GlassSurface";
import { formatClock } from "@/lib/time";
import type { AuroraRamp } from "@/theme/tokens";
import { layout, spacing } from "@/theme/tokens";

const ART_SIZE = 46;

export type MiniPlayerRowProps = {
  title: string | null;
  artist: string | null;
  artworkUrl: string | null;
  ramp: AuroraRamp;
  positionSec: number;
  durationSec: number;
  isPlaying: boolean;
  onToggle: () => void;
  skipNonce?: number;
  skipDirection?: 1 | -1;
  /** Wraps the artwork + copy. Used by the mini-player to attach gestures. */
  renderMain?: (content: ReactNode) => ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function MiniPlayerRow({
  title,
  artist,
  artworkUrl,
  ramp,
  positionSec,
  durationSec,
  isPlaying,
  onToggle,
  skipNonce,
  skipDirection,
  renderMain,
  style,
}: MiniPlayerRowProps) {
  const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;

  const main = (
    <>
      <CrossfadeArtwork
        source={artworkUrl}
        ramp={ramp}
        label={title}
        radius={13}
        skipNonce={skipNonce}
        skipDirection={skipDirection}
        style={styles.art}
      />
      <View style={styles.copy}>
        <ThemedText type="label" numberOfLines={1}>
          {title ?? "Now Playing"}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {artist ?? `${formatClock(positionSec)} / ${formatClock(durationSec)}`}
        </ThemedText>
      </View>
    </>
  );

  return (
    <GlassSurface tone="surfaceStrong" radius="panel" clip style={[styles.surface, style]}>
      {renderMain ? (
        renderMain(main)
      ) : (
        <View style={styles.main}>{main}</View>
      )}

      <BouncyIconButton
        name={isPlaying ? "pause" : "play"}
        accessibilityLabel={isPlaying ? "Pause" : "Play"}
        size={42}
        iconSize={20}
        tone="accent"
        onPress={onToggle}
      />

      <GlassProgress progress={progress} tint={ramp[1]} thickness={2} style={styles.progress} />
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    minHeight: layout.miniPlayerHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    gap: spacing.sm,
    overflow: "hidden",
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  art: {
    width: ART_SIZE,
    height: ART_SIZE,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  progress: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: 0,
  },
});
