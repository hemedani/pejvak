/**
 * A single-choice control for a short, fixed set of options.
 *
 * ## Why this and not a row of chips
 *
 * A chip is a *filter* affordance — "show me the 14 things that match". Using one
 * for "pick a theme" is a category error, and it is what the settings screen
 * used to do: five free-floating pills on bare canvas for the playback speed, and
 * three more for the appearance, with nothing enclosing them and nothing tying
 * them to the setting they changed.
 *
 * A segmented control says the opposite thing: *exactly one of these is true*.
 * The sliding thumb says it without a legend, because the position of the fill
 * is the answer.
 *
 * ## The thumb
 *
 * One `Animated.View` whose `width` and `translateX` are driven by a single
 * shared value. Nothing is ever measured, which is what would make the thumb jump
 * on first paint — it is seeded from `selected`, so it is in the right place on
 * the very first frame.
 *
 * **The shared value holds a translate, not a normalised position.** That is not
 * a stylistic choice, it is the unit `translateX` wants: its percentage resolves
 * against the *thumb's* width, and the thumb is one segment wide, so "how far
 * along the track" is the wrong number to hand it. A normalised 0–1 progress
 * applied directly moved the thumb a quarter of the distance it should on a
 * five-option control, landing it inside the first segment while the second was
 * selected.
 *
 * **Nothing in the worklet calls a function.** A worklet body executes on the UI
 * thread, where a plain function imported from another module is a *Remote
 * Function* and calling it throws synchronously — invisible to the type checker,
 * invisible to every unit test, and fatal on the device. The index-to-translate
 * conversion therefore happens in the component body, on the JS thread, and the
 * worklet only reads one number. `segmented-control.test.ts` reads this file as
 * text and fails if a module function reappears inside a worklet.
 *
 * The thumb is a *layout* box exactly one segment wide, with its visible surface
 * drawn by an inner view. An absolutely-positioned percentage width resolves
 * against the parent's padding box while the segments lay out in its content box,
 * so a horizontally-padded track would put the two on different grids.
 */

import { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/ui/icon";
import { triggerHaptic } from "@/components/ui/haptics";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { useTheme } from "@/hooks/use-theme";
import { thumbTargetPercent } from "@/lib/segmentedLayout";
import { spring, useMotionEnabled } from "@/theme/motion";
import {
  card as cardTokens,
  hairline,
  radius as radii,
  spacing,
} from "@/theme/tokens";

export type SegmentOption<T extends string | number> = {
  value: T;
  label: string;
  icon?: IconName;
};

export type SegmentedControlProps<T extends string | number> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const motionEnabled = useMotionEnabled();

  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  /**
   * The shared value holds the thumb's *translate*, not a normalised position.
   *
   * That is the whole design. `translateX`'s percentage unit is "thumb-widths",
   * so converting a segment index into one belongs on the JS thread, where it can
   * be a plain function call. Doing it inside `useAnimatedStyle` means calling
   * that function on the UI thread, where it is a *Remote Function* and throws
   * synchronously.
   *
   * It is also correct on the very first frame, because it is seeded from
   * `selected` rather than landing after a layout pass.
   */
  const target = thumbTargetPercent(selected, options.length);
  const position = useSharedValue(target);

  useEffect(() => {
    position.value = motionEnabled ? withSpring(target, spring.snappy) : target;
  }, [motionEnabled, position, target]);

  const thumbStyle = useAnimatedStyle(() => ({
    width: `${100 / options.length}%`,
    // One shared value, one string. Nothing in here is a function call.
    transform: [{ translateX: `${position.value}%` }],
  }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        {
          backgroundColor: theme.surfaceSunken,
          borderColor: theme.outlineVariant,
        },
        style,
      ]}
    >
      {/* The thumb is a *layout* box exactly one segment wide; its inner view
          carries the visible surface. An absolutely-positioned percentage width
          resolves against the parent's padding box while the segments are laid out
          in its content box, so giving the track horizontal padding would put the
          two on different grids. The box spans the segment; the inset is drawn
          inside it. */}
      <Animated.View pointerEvents="none" style={[styles.thumb, thumbStyle]}>
        <View
          style={[
            styles.thumbFill,
            { backgroundColor: theme.surface, borderColor: theme.outline },
          ]}
        />
      </Animated.View>

      {options.map((option) => {
        const active = option.value === value;
        return (
          <ElasticPressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            scaleTo={0.94}
            overshootTo={1.02}
            haptic="selection"
            onPress={() => {
              triggerHaptic("selection");
              onChange(option.value);
            }}
            style={styles.segment}
          >
            {option.icon ? (
              <Icon
                name={option.icon}
                size={15}
                color={active ? theme.accent : theme.textTertiary}
              />
            ) : null}
            <ThemedText
              type="label"
              numberOfLines={1}
              style={{ color: active ? theme.text : theme.textTertiary }}
            >
              {option.label}
            </ThemedText>
          </ElasticPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.segment,
    borderWidth: hairline,
    // Vertical only. A horizontal inset here would split the track's padding box
    // from its content box and put the thumb on a different grid to the segments.
    paddingVertical: spacing.xxs,
  },
  thumb: {
    position: "absolute",
    top: spacing.xxs,
    bottom: spacing.xxs,
    left: 0,
  },
  thumbFill: {
    flex: 1,
    marginHorizontal: spacing.xxs,
    borderRadius: radii.segment - spacing.xxs,
    borderWidth: hairline,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: cardTokens.segmentHeight,
  },
});
