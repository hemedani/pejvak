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
import { SpinnerRing } from "@/components/player/SpinnerRing";
import { WavyProgress } from "@/components/player/WavyProgress";
import { ThemedText } from "@/components/themed-text";
import { useSmoothProgress } from "@/hooks/use-smooth-progress";
import { useTheme } from "@/hooks/use-theme";
import { usePlayerStore } from "@/store/playerStore";
import {
  describeContextType,
  type PlaybackContext,
} from "@/lib/playbackContext";
import { formatClock } from "@/lib/time";
import type { AuroraRamp } from "@/theme/tokens";
import { iconSize, spacing } from "@/theme/tokens";

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
  isPlaying: boolean;
  /**
   * The player is fetching and has nothing to report yet. The play button shows
   * a spinner and keeps its press — the same control, the same job, and the
   * same words the full player uses.
   */
  waiting?: boolean;
  playbackSpeed?: number;
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
  isPlaying,
  waiting = false,
  playbackSpeed = 1,
  context,
  onOpenContext,
  onToggle,
  onClose,
  skipNonce,
  skipDirection,
  renderMain,
  style,
}: MiniPlayerRowProps) {
  const theme = useTheme();

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
          {artist ?? <ElapsedClock />}
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
          iconSize={iconSize.sm}
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
          iconSize={iconSize.sm}
          tone="ghost"
        />
      ) : null}

      <BouncyIconButton
        name={isPlaying ? "pause" : "play"}
        accessibilityLabel={waiting ? "Stop waiting" : isPlaying ? "Pause" : "Play"}
        size={CONTROL.play}
        iconSize={19}
        tone="accent"
        busy={waiting}
        glyph={
          waiting ? <SpinnerRing size={17} thickness={2} color={theme.onAccent} /> : undefined
        }
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

      <NowPlayingProgress
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        tint={ramp[1]}
        trackColor={theme.track}
      />
    </View>
  );
}

/**
 * The elapsed clock as its own subscriber.
 *
 * The player reports a new position every second. Reading it in `MiniPlayerRow`
 * re-rendered the artwork, the title and the whole control row once a second for
 * a caption that is the only thing changing. A leaf that selects the two clock
 * values keeps that tick to one `Text`.
 */
function ElapsedClock() {
  const positionSec = usePlayerStore((state) => state.positionSec);
  const durationSec = usePlayerStore((state) => state.durationSec);
  return <>{`${formatClock(positionSec)} / ${formatClock(durationSec)}`}</>;
}

/**
 * The wave's own subscriber, for the same reason: `useSmoothProgress` needs the
 * reported position, but only this component and its shared values do.
 */
function NowPlayingProgress({
  isPlaying,
  playbackSpeed,
  tint,
  trackColor,
}: {
  isPlaying: boolean;
  playbackSpeed: number;
  tint: string;
  trackColor: string;
}) {
  const positionSec = usePlayerStore((state) => state.positionSec);
  const durationSec = usePlayerStore((state) => state.durationSec);
  const { progress } = useSmoothProgress({
    positionSec,
    durationSec,
    isPlaying,
    playbackSpeed,
  });

  return (
    <WavyProgress
      progress={progress}
      isPlaying={isPlaying}
      tint={tint}
      trackColor={trackColor}
      thickness={2}
      amplitude={1.4}
      wavelength={22}
      bandHeight={8}
      gap={0}
      style={styles.progress}
    />
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
