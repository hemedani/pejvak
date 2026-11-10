/**
 * The audio enhancer, as a modal over the player.
 *
 * Three controls and a switch, because that is the whole idea: make a recording
 * that was captured badly audible again. Boost lifts everything, bass puts back
 * the body a phone speaker cannot produce, and treble restores the consonants
 * that carry the meaning of a word.
 *
 * A React Native `Modal`, for the reason the queue sheet is one: the player is
 * itself a `transparentModal` route, so anything rendered inside it — including
 * a panel placed in its scroll content — sits *under* whatever the listener is
 * looking at. A `Modal` is a separate window, which is also what makes this
 * read as a box that came to the front rather than a block that appeared in a
 * list.
 *
 * Two things this sheet refuses to do:
 *
 *   · **Offer a control that does nothing.** When the native module is absent
 *     (Expo Go) or the device rejects the output-mix session, the sliders are
 *     replaced by one sentence. A slider that moves and changes no sound is
 *     worse than an honest refusal.
 *   · **Hide that it is device-wide.** The effect rides the output mix, not this
 *     app's player, so while it is on it shapes whatever the phone plays. The
 *     footer says so, and switching it off releases the effect rather than
 *     leaving a silent curve attached.
 */

import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { InlineNotice } from "@/components/ui/row";
import { Slider } from "@/components/ui/slider";
import { useTheme } from "@/hooks/use-theme";
import {
  DEFAULT_ENHANCER,
  ENHANCER_RANGE,
  describeGainDb,
  isEnhancerFlat,
  type AudioEnhancerSettings,
} from "@/lib/audioEffects";
import * as AudioEffectsService from "@/services/AudioEffectsService";
import { useAudioEffectsStore } from "@/store/audioEffectsStore";
import { bar, hairline, radius, spacing } from "@/theme/tokens";

export type AudioEnhancerSheetProps = {
  onClose: () => void;
  /** Colour of the controls' fills — the current track's accent. */
  tint: string;
};

export function AudioEnhancerSheet({ onClose, tint }: AudioEnhancerSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const enhancer = useAudioEffectsStore((state) => state.enhancer);
  const available = useAudioEffectsStore((state) => state.enhancerAvailable);
  const reason = useAudioEffectsStore((state) => state.enhancerReason);

  useEffect(() => {
    AudioEffectsService.probe();
  }, []);

  const set = (values: Partial<AudioEnhancerSettings>) => {
    AudioEffectsService.setEnhancer(values);
  };

  const flat = isEnhancerFlat(enhancer);
  const blocked = available === false;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.root}>
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss the audio enhancer"
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
            <View style={styles.heading}>
              <ThemedText type="bodyStrong">Audio enhancer</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {flat
                  ? "Every band is flat"
                  : enhancer.enabled
                    ? "Shaping what this device plays"
                    : "Ready, but switched off"}
              </ThemedText>
            </View>
            <Switch
              accessibilityLabel="Audio enhancer"
              value={enhancer.enabled}
              disabled={blocked}
              trackColor={{ true: tint }}
              onValueChange={(enabled) => set({ enabled })}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.track }]} />

          <View style={styles.body}>
            {blocked ? (
              <InlineNotice
                icon="info"
                title="Not available in this build"
                message={reason ?? "The enhancer needs a development or production build."}
              />
            ) : (
              <View style={styles.bands}>
                <SliderRow
                  label="Boost"
                  hint="Extra level for a recording that was captured too quietly."
                  value={enhancer.boostDb}
                  min={ENHANCER_RANGE.boostDb.min}
                  max={ENHANCER_RANGE.boostDb.max}
                  step={ENHANCER_RANGE.boostDb.step}
                  tint={tint}
                  onChange={(boostDb) => set({ boostDb })}
                />
                <SliderRow
                  label="Bass"
                  hint="Body and warmth, for a voice that sounds thin."
                  value={enhancer.bassDb}
                  min={ENHANCER_RANGE.bassDb.min}
                  max={ENHANCER_RANGE.bassDb.max}
                  step={ENHANCER_RANGE.bassDb.step}
                  tint={tint}
                  bipolar
                  onChange={(bassDb) => set({ bassDb })}
                />
                <SliderRow
                  label="Treble"
                  hint="Clarity and consonants, for a voice that sounds muffled."
                  value={enhancer.trebleDb}
                  min={ENHANCER_RANGE.trebleDb.min}
                  max={ENHANCER_RANGE.trebleDb.max}
                  step={ENHANCER_RANGE.trebleDb.step}
                  tint={tint}
                  bipolar
                  onChange={(trebleDb) => set({ trebleDb })}
                />
              </View>
            )}

            <ThemedText type="caption" themeColor="textTertiary">
              {blocked
                ? "Everything else in the player is unaffected."
                : "Applied to whatever this phone plays while it is on. Turn it off to give the sound back untouched."}
            </ThemedText>

            <View style={styles.actions}>
              {flat ? (
                <View />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => set(DEFAULT_ENHANCER)}
                  hitSlop={spacing.sm}>
                  <ThemedText type="linkPrimary">Reset</ThemedText>
                </Pressable>
              )}
              <PrimaryButton label="Done" onPress={onClose} style={styles.action} />
            </View>
          </View>
        </GlassSurface>
      </View>
    </Modal>
  );
}

type SliderRowProps = {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  tint: string;
  bipolar?: boolean;
  onChange: (value: number) => void;
};

/**
 * A labelled slider with its value beside it.
 *
 * The label is on the left and the figure on the right, so the track's two ends
 * do not shift as the number grows from "Off" to "−12.0 dB".
 */
function SliderRow({ label, hint, value, min, max, step, tint, bipolar, onChange }: SliderRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <ThemedText type="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="numeric" themeColor={value === 0 ? "textTertiary" : "text"}>
          {describeGainDb(value)}
        </ThemedText>
      </View>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        label={label}
        hint={hint}
        tint={tint}
        bipolar={bipolar}
        onChange={onChange}
      />
    </View>
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  heading: {
    flex: 1,
    gap: spacing.xxs,
  },
  divider: {
    height: hairline,
    marginHorizontal: spacing.lg,
  },
  body: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  bands: {
    gap: spacing.sm,
  },
  row: {
    gap: 0,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  action: {
    flex: 1,
  },
});
