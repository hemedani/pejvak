/**
 * Choosing what the background tone sounds like.
 *
 * A `Modal`, for the reason the enhancer sheet is one: the player is itself a
 * `transparentModal` route, so a panel rendered inside its scroll content sits
 * *under* what the listener is looking at. A `Modal` is a separate window,
 * which is also what makes this read as a list that came to the front.
 *
 * Tapping a row selects it and closes in the same gesture. There is no preview
 * and no Apply: the tone is already playing underneath the track, so the
 * listener hears the choice the moment they make it — a preview button would be
 * a second way to hear the thing they are already hearing.
 *
 * The rows are `Pressable`, not gesture-handler panes, so this sheet needs no
 * `GestureHandlerRootView` of its own; the one it has is for the scrim's press
 * feedback and costs nothing.
 */

import { Modal, Pressable, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { TONES, type AmbientToneId } from "@/lib/ambientTones";
import * as AudioEffectsService from "@/services/AudioEffectsService";
import { bar, hairline, radius, spacing } from "@/theme/tokens";

/**
 * The glyph for each tone. It lives here rather than in the catalogue because
 * `src/lib` never imports an icon — the domain knows the sounds, the screens
 * know how to draw them.
 */
export const TONE_ICONS: Record<AmbientToneId, IconName> = {
  room: "roomTone",
  rain: "rain",
  forest: "forest",
  waves: "waves",
  wind: "wind",
};

export type TonePickerSheetProps = {
  /** The tone in use now, so the row can say so before the tap. */
  tone: AmbientToneId;
  /** Colour of the selected row and its check — the track's accent. */
  tint: string;
  onClose: () => void;
};

export function TonePickerSheet({ tone, tint, onClose }: TonePickerSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss the tone picker"
          haptic="none"
          scaleTo={1}
          overshootTo={1}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />

        <GlassSurface
          tone="surfaceStrong"
          radius="panel"
          clip
          elevated
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabberArea}>
            <View style={[styles.grabber, { backgroundColor: theme.track }]} />
          </View>

          <View style={styles.header}>
            <ThemedText type="bodyStrong">Background tone</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              A faint sound under the audio, so a Bluetooth speaker does not drop its link during
              silence.
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.track }]} />

          <View style={styles.list}>
            {TONES.map((candidate) => {
              const selected = candidate.id === tone;
              return (
                <Pressable
                  key={candidate.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${candidate.label} tone. ${candidate.hint}`}
                  onPress={() => {
                    AudioEffectsService.setTone(candidate.id);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: selected
                        ? theme.accentSoft
                        : pressed
                          ? theme.glass
                          : "transparent",
                    },
                  ]}>
                  <Icon
                    name={TONE_ICONS[candidate.id]}
                    size={20}
                    color={selected ? tint : theme.icon}
                  />
                  <View style={styles.texts}>
                    <ThemedText type="smallBold" style={selected ? { color: tint } : undefined}>
                      {candidate.label}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary">
                      {candidate.hint}
                    </ThemedText>
                  </View>
                  {selected ? <Icon name="check" size={18} color={tint} /> : null}
                </Pressable>
              );
            })}
          </View>
        </GlassSurface>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
  },
  grabberArea: {
    alignItems: "center",
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  grabber: {
    width: 40,
    height: bar.thin,
    borderRadius: radius.pill,
  },
  header: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  divider: {
    height: hairline,
    marginHorizontal: spacing.lg,
  },
  list: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.xxs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
});
