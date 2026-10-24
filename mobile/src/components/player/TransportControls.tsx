/**
 * The transport cluster: previous, rewind 30, play/pause, forward 30, next.
 *
 * Every control is a bouncy icon button, so the whole row shares one press
 * physics. The play button is the only filled surface on the screen, which is
 * what makes it read as *the* action.
 *
 * While the player is waiting, the play button's glyph becomes a spinner and
 * the button keeps its press. That is deliberate: a stream that has not
 * arrived yet still has one thing the listener can do about it, and taking the
 * control away would leave them with nothing but a shape that turns.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { SpinnerRing } from "@/components/player/SpinnerRing";
import { useTheme } from "@/hooks/use-theme";
import { iconSize, spacing } from "@/theme/tokens";

export type TransportControlsProps = {
  isPlaying: boolean;
  /**
   * The player has been asked to play and cannot yet. The primary control shows
   * a spinner, and pressing it stops the wait.
   */
  waiting?: boolean;
  disabled?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToggle: () => void;
  onRewind: () => void;
  onForward: () => void;
  style?: StyleProp<ViewStyle>;
};

export function TransportControls({
  isPlaying,
  waiting = false,
  disabled = false,
  onPrevious,
  onNext,
  onToggle,
  onRewind,
  onForward,
  style,
}: TransportControlsProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, style]}>
      <BouncyIconButton
        name="previous"
        accessibilityLabel="Previous track"
        size={48}
        iconSize={iconSize.lg}
        tone="ghost"
        haptic="tap"
        disabled={disabled}
        onPress={onPrevious}
      />
      <BouncyIconButton
        name="rewind"
        accessibilityLabel="Seek back 30 seconds"
        size={48}
        iconSize={24}
        tone="ghost"
        disabled={disabled}
        onPress={onRewind}
      />
      <BouncyIconButton
        name={isPlaying ? "pause" : "play"}
        // While waiting the button *stops the wait* — it pauses, which is what
        // ends a connect that has not started and a stall that will not. Calling
        // it "Pause" would promise audio that is not there yet.
        accessibilityLabel={waiting ? "Stop waiting" : isPlaying ? "Pause" : "Play"}
        size={78}
        iconSize={32}
        tone="accent"
        busy={waiting}
        disabled={disabled}
        glyph={
          waiting ? <SpinnerRing size={26} thickness={2.5} color={theme.onAccent} /> : undefined
        }
        onPress={onToggle}
        style={styles.primary}
      />
      <BouncyIconButton
        name="forward"
        accessibilityLabel="Seek forward 30 seconds"
        size={48}
        iconSize={24}
        tone="ghost"
        disabled={disabled}
        onPress={onForward}
      />
      <BouncyIconButton
        name="next"
        accessibilityLabel="Next track"
        size={48}
        iconSize={iconSize.lg}
        tone="ghost"
        haptic="tap"
        disabled={disabled}
        onPress={onNext}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  primary: {
    marginHorizontal: spacing.xs,
  },
});
