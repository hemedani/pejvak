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
 *
 * ## Following a swipe
 *
 * When a `position` is handed in — a `SwipePager`'s continuous page position —
 * the thumb is driven by *that* instead of by its own spring. The thumb then
 * travels with the finger, in the same frame and at the same rate as the page
 * beneath it, and the release is already animating because the pager is. That is
 * the difference between a control that reports a change and one that performs
 * it: with a spring of its own the thumb would arrive on its own curve, a beat
 * behind the content it belongs to.
 *
 * The two line up because both are counted in the same unit. A page position of
 * `1.4` is "40% of the way from the second page to the third", and the thumb is
 * one segment wide per page — so `1.4 × 100` percent of its own width is exactly
 * 40% of the way from the second segment to the third.
 *
 * ## Collapsing the labels
 *
 * Five labelled segments do not fit across a phone: at 14pt "Playlists" alone is
 * most of a fifth of the screen, and a label that has to truncate is worse than
 * no label. `collapse` draws the *selected* segment's name and its neighbours'
 * glyphs, which fits five comfortably and still answers "where am I?" — the thumb
 * gives the position, the name confirms it. Nothing reflows while it changes:
 * every segment is one fifth of the track either way, so a label appearing does
 * not push its neighbours aside.
 */

import { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/ui/icon";
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
  /**
   * A count drawn in the glyph's place — a search's tally for this view.
   *
   * `0` is a real answer and is drawn: it is the one that sends the listener to
   * another segment instead of leaving them tapping through empty lists.
   */
  badge?: number | null;
};

export type SegmentedControlProps<T extends string | number> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * A pager's continuous position, in pages. When given, the thumb follows it —
   * including mid-drag — instead of springing to `value`.
   */
  position?: SharedValue<number>;
  /**
   * Draw only the selected segment's label. The rest show their glyph (or their
   * badge), which is what lets five segments share one line.
   */
  collapse?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Caps a badge at three characters; past 99 the exact number is not the point. */
function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  position,
  collapse = false,
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
  const own = useSharedValue(target);
  const driven = position !== undefined;

  useEffect(() => {
    // A pager owns the motion when one is supplied; running this spring as well
    // would be a second value deciding where the same thumb is.
    if (driven) {
      return;
    }
    own.value = motionEnabled ? withSpring(target, spring.snappy) : target;
  }, [driven, motionEnabled, own, target]);

  const thumbStyle = useAnimatedStyle(() => ({
    width: `${100 / options.length}%`,
    // One number, in pages. The thumb is one segment wide, so pages and
    // thumb-widths are the same unit — and nothing in here is a function call.
    transform: [
      { translateX: `${(position ? position.value : own.value) * 100}%` },
    ],
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
        const badge = option.badge ?? null;
        const showLabel = collapse ? active : true;
        const showGlyph = collapse ? !active : true;

        return (
          <ElasticPressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              badge === null
                ? option.label
                : `${option.label}, ${badge} result${badge === 1 ? "" : "s"}`
            }
            scaleTo={0.94}
            overshootTo={1.02}
            haptic="select"
            onPress={() => {
              onChange(option.value);
            }}
            style={styles.segment}
          >
            {showGlyph && badge !== null ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: active ? theme.accent : theme.surface },
                ]}
              >
                <ThemedText
                  type="caption"
                  numberOfLines={1}
                  style={{ color: active ? theme.onAccent : theme.textSecondary }}
                >
                  {formatBadge(badge)}
                </ThemedText>
              </View>
            ) : showGlyph && option.icon ? (
              <Icon
                name={option.icon}
                size={15}
                color={active ? theme.accent : theme.textTertiary}
              />
            ) : null}
            {showLabel ? (
              <ThemedText
                type="label"
                numberOfLines={1}
                style={{ color: active ? theme.text : theme.textTertiary }}
              >
                {option.label}
              </ThemedText>
            ) : null}
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
  badge: {
    // Fixed width, like the Library's own count: a tally that changed width
    // would reflow the strip on every keystroke of a search.
    minWidth: 22,
    paddingHorizontal: spacing.xxs,
    paddingVertical: 1,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
