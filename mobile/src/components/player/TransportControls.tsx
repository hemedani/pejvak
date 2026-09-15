/**
 * The transport cluster: previous, rewind 30, play/pause, forward 30, next.
 *
 * Every control is a bouncy icon button, so the whole row shares one press
 * physics. The play button is the only filled surface on the screen, which is
 * what makes it read as *the* action.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { spacing } from "@/theme/tokens";

export type TransportControlsProps = {
  isPlaying: boolean;
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
  disabled = false,
  onPrevious,
  onNext,
  onToggle,
  onRewind,
  onForward,
  style,
}: TransportControlsProps) {
  return (
    <View style={[styles.row, style]}>
      <BouncyIconButton
        name="previous"
        accessibilityLabel="Previous track"
        size={48}
        iconSize={22}
        tone="ghost"
        haptic="light"
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
        accessibilityLabel={isPlaying ? "Pause" : "Play"}
        size={78}
        iconSize={32}
        tone="accent"
        disabled={disabled}
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
        iconSize={22}
        tone="ghost"
        haptic="light"
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
