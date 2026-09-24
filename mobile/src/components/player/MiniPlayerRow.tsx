/**
 * The now-playing row: artwork, title, and a play/pause button on frosted glass.
 *
 * Rendered by the collapsed mini-player, which wraps the artwork and copy in a
 * gesture detector through `renderMain` so the whole surface answers a tap and
 * an upward drag without the trailing buttons stealing either.
 */

import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { AddToPlaylistButton } from "@/components/add-to-playlist";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { CrossfadeArtwork } from "@/components/motion/CrossfadeArtwork";
import { ThemedText } from "@/components/themed-text";
import { GlassProgress } from "@/components/ui/glass/GlassProgress";
import { GlassSurface } from "@/components/ui/glass/GlassSurface";
import { describeContextType, type PlaybackContext } from "@/lib/playbackContext";
import { formatClock } from "@/lib/time";
import type { AuroraRamp } from "@/theme/tokens";
import { layout, spacing } from "@/theme/tokens";

const ART_SIZE = 46;

export type MiniPlayerRowProps = {
  /** The library row being played, for the playlist picker. */
  trackId?: string | null;
  title: string | null;
  artist: string | null;
  artworkUrl: string | null;
  ramp: AuroraRamp;
  positionSec: number;
  durationSec: number;
  isPlaying: boolean;
  /** The folder or playlist the queue came from, if it came from one. */
  context?: PlaybackContext | null;
  /** Opens that collection's own screen. */
  onOpenContext?: () => void;
  onToggle: () => void;
  /**
   * Ends playback and puts the bar away. Omit to hide the control — the full
   * player has its own dismiss, and a second one there would be a lie about
   * what it does.
   */
  onClose?: () => void;
  skipNonce?: number;
  skipDirection?: 1 | -1;
  /** Wraps the artwork + copy. Used by the mini-player to attach gestures. */
  renderMain?: (content: ReactNode) => ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function MiniPlayerRow({
  trackId,
  title,
  artist,
  artworkUrl,
  ramp,
  positionSec,
  durationSec,
  isPlaying,
  context,
  onOpenContext,
  onToggle,
  onClose,
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

      {/* The way back into the collection, without opening the full player
          first. Icon-only because the bar already carries a title and two other
          controls — the label is on the accessibility node, not on the glass. */}
      {context && onOpenContext ? (
        <BouncyIconButton
          name={context.type === "folder" ? "folder" : "playlists"}
          accessibilityLabel={`Open ${describeContextType(context.type).toLowerCase()} ${context.title}`}
          size={34}
          iconSize={17}
          tone="ghost"
          onPress={onOpenContext}
        />
      ) : null}

      {trackId ? (
        <AddToPlaylistButton
          trackIds={[trackId]}
          title={title ?? "This track"}
          ramp={ramp}
          artwork={artworkUrl}
          size={34}
          iconSize={17}
          tone="ghost"
        />
      ) : null}

      <BouncyIconButton
        name={isPlaying ? "pause" : "play"}
        accessibilityLabel={isPlaying ? "Pause" : "Play"}
        size={42}
        iconSize={20}
        tone="accent"
        onPress={onToggle}
      />

      {/* Last, so the play control keeps the position the thumb already knows
          and the dismiss sits out at the edge of the bar. Sized a step down
          from play because it is the destructive one of the pair, and the
          trailing group is already three controls deep. */}
      {onClose ? (
        <BouncyIconButton
          name="close"
          accessibilityLabel="Stop playback and close the player"
          size={32}
          iconSize={16}
          tone="ghost"
          onPress={onClose}
        />
      ) : null}

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
