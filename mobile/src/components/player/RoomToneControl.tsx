/**
 * The room-tone row: a faint noise floor under the track, adjustable in one
 * gesture from the player itself.
 *
 * It sits on the player rather than behind a sheet because it is a *workaround*,
 * not a setting. A Bluetooth speaker that drops its link during silence loses
 * the word after the pause, and the listener discovers that mid-sentence — the
 * cure has to be reachable without leaving what they are listening to.
 *
 * The label is deliberately the audio world's own term for this: the noise a
 * room already has. "Add noise" would describe the mechanism; room tone
 * describes why it is there.
 */

import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { Slider } from "@/components/ui/slider";
import { useTheme } from "@/hooks/use-theme";
import { describeRoomTone } from "@/lib/audioEffects";
import * as AudioEffectsService from "@/services/AudioEffectsService";
import { useAudioEffectsStore } from "@/store/audioEffectsStore";
import { spacing } from "@/theme/tokens";

export type RoomToneControlProps = {
  /** Colour of the filled track — the track's own aurora accent. */
  tint: string;
};

/**
 * The level is selected here rather than passed down.
 *
 * A drag reports a dozen values a second, and a prop would carry every one of
 * them up through the route and back down through the whole player — artwork,
 * timeline, notes — to redraw one caption. Subscribing in the leaf is the same
 * rule the position tick follows: the thing that changes every frame owns the
 * change.
 */
export function RoomToneControl({ tint }: RoomToneControlProps) {
  const theme = useTheme();
  const value = useAudioEffectsStore((state) => state.roomTone);

  return (
    <View style={styles.root}>
      <View style={styles.label}>
        <Icon name="roomTone" size={14} color={theme.textSecondary} />
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          Room tone
        </ThemedText>
      </View>
      <Slider
        value={value}
        min={0}
        max={100}
        step={1}
        label="Room tone"
        hint="A faint noise under the audio, so Bluetooth speakers do not drop out during silence."
        tint={tint}
        onChange={AudioEffectsService.setRoomTone}
      />
      <ThemedText type="numeric" themeColor="textTertiary" style={styles.value}>
        {describeRoomTone(value)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  /** Fixed so the track's own start and end do not move as the figure changes. */
  label: {
    width: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  value: {
    width: 40,
    textAlign: "right",
  },
});
