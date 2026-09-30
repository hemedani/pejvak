/**
 * The now-playing row: artwork, title, and a play/pause button.
 *
 * Renders a plain row with **no surface of its own** — `AppDock` owns one frosted
 * panel for this row and the navigation together. That is deliberate: as two
 * separate panels they had to be told how far apart to sit, and the clearance
 * they were given left the navigation's raised button underneath this row.
 *
 * `renderMain` lets the dock wrap the artwork and copy in a gesture detector, so
 * the whole area answers a tap and an upward drag without the trailing buttons
 * stealing either.
 */

import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { AddToPlaylistButton } from "@/components/add-to-playlist";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { CrossfadeArtwork } from "@/components/motion/CrossfadeArtwork";
import { ThemedText } from "@/components/themed-text";
import { GlassProgress } from "@/components/ui/glass/GlassProgress";
import {
  describeContextType,
  type PlaybackContext,
} from "@/lib/playbackContext";
import { formatClock } from "@/lib/time";
import type { AuroraRamp } from "@/theme/tokens";
import { spacing } from "@/theme/tokens";

/**
 * The artwork, sized to leave the title room for four trailing controls.
 *
 * It was 46, which left the title 100pt on a 336pt dock — enough for about a
 * dozen characters of a Persian title. 38 buys 40pt back, and at 38 a 12pt
 * corner is still the same "a third of the diameter" shape the library tiles use.
 */
const ART_SIZE = 38;

/**
 * The trailing controls' visual sizes.
 *
 * Visual size, **not** touch size: `BouncyIconButton` pads every glyph out to a
 * 44pt target with `hitSlop`, so shrinking these takes space away from the title
 * without making any control harder to hit. The two are already separate
 * concerns in that component, which is exactly why it has a `hitSlop` at all.
 */
const CONTROL = {
  /** Open the collection this run belongs to. */
  context: 28,
  /** Add to a playlist. */
  addToPlaylist: 28,
  /** Play or pause — the one filled control in the row. */
  play: 38,
  /** Stop playback. Destructive, so a step below play. */
  stop: 26,
} as const;

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
        radius={12}
        skipNonce={skipNonce}
        skipDirection={skipDirection}
        style={styles.art}
      />
      <View style={styles.copy}>
        <ThemedText type="label" numberOfLines={1}>
          {title ?? "Now Playing"}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {artist ??
            `${formatClock(positionSec)} / ${formatClock(durationSec)}`}
        </ThemedText>
      </View>
    </>
  );

  return (
    <View style={[styles.surface, style]}>
      {renderMain ? renderMain(main) : <View style={styles.main}>{main}</View>}

      {/* The way back into the collection, without opening the full player
          first. Icon-only because the bar already carries a title and two other
          controls — the label is on the accessibility node, not on the glass. */}
      {context && onOpenContext ? (
        <BouncyIconButton
          name={context.type === "folder" ? "folder" : "playlists"}
          accessibilityLabel={`Open ${describeContextType(context.type).toLowerCase()} ${context.title}`}
          size={CONTROL.context}
          iconSize={15}
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
          size={CONTROL.addToPlaylist}
          iconSize={15}
          tone="ghost"
        />
      ) : null}

      <BouncyIconButton
        name={isPlaying ? "pause" : "play"}
        accessibilityLabel={isPlaying ? "Pause" : "Play"}
        size={CONTROL.play}
        iconSize={19}
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
          size={CONTROL.stop}
          iconSize={14}
          tone="ghost"
          onPress={onClose}
        />
      ) : null}

      <GlassProgress
        progress={progress}
        tint={ramp[1]}
        thickness={2}
        style={styles.progress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    gap: spacing.xs,
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
