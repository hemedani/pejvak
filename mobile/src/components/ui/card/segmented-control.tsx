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
 * ## Collapsing: the glyph sits above the name
 *
 * Five labelled segments do not fit across a phone — at 14pt "Playlists" alone is
 * most of a fifth of the screen. The earlier answer was to draw the selected
 * segment's name *beside* its glyph, which left the name with no room: on a
 * five-view strip the label measured wider than the slot it was centred in, so
 * it overhung the thumb on both sides and read as a control that had been
 * squeezed rather than designed.
 *
 * The fix is the one every tab bar makes: in `collapse` mode the glyph sits on a
 * fixed line and the name goes *under* it. A name needs ~55pt and a slot has
 * ~64pt of thumb to give, so the label finally has real padding on both sides
 * instead of running into the edge. The two rows are fixed heights, so the glyph
 * never moves when the selection does — only the name appears, and it appears
 * exactly where the glyph already was.
 *
 * **The glyph is drawn in every state, the selected one included.** Swapping it
 * for the label was a state that lost its icon: the strip then read as four
 * glyphs and one bare word, so the tab you were looking at was the one tab you
 * could not recognise at a glance.
 *
 * ## The selected pill is the accent, not a white rectangle
 *
 * The thumb used to be `surface` on a `surfaceSunken` track, which in the dark
 * theme is a *darker* fill than the track it sits in — the selected segment read
 * as a hole. It is now the accent at low alpha with an accent hairline and an
 * accent label, which is the same "this one is current" language the dock uses
 * for its selected destination, works in both themes by construction, and makes
 * the active tab the one thing on the strip the eye lands on.
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
import { useScheme, useTheme } from "@/hooks/use-theme";
import { withAlpha } from "@/lib/palette";
import { thumbTargetPercent } from "@/lib/segmentedLayout";
import { spring, useMotionEnabled } from "@/theme/motion";
import {
  card as cardTokens,
  hairline,
  radius as radii,
  spacing,
} from "@/theme/tokens";

/** Inset of the visible pill inside the track, on every side. */
const PILL_INSET = 3;
/**
 * The glyph's row. Fixed height on purpose: the name may come and go, and a row
 * that grew with it would move every glyph on the strip by a few points each
 * time the selection changed.
 */
const GLYPH_ROW = 18;

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
   * Draw the names only under the selected segment, on a second line. The rest
   * show their glyph alone, which is what lets five segments share one line.
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
  const scheme = useScheme();
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

  // The dark canvas needs a touch more accent in the fill to separate the pill
  // from the sunken track it sits in; the light one needs less before it starts
  // reading as a tinted block rather than as a selected control.
  const pillAlpha = scheme === "dark" ? 0.26 : 0.16;

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
            {
              backgroundColor: withAlpha(theme.accent, pillAlpha),
              borderColor: withAlpha(theme.accent, 0.42),
              shadowColor: theme.accent,
            },
          ]}
        />
      </Animated.View>

      {options.map((option) => {
        const active = option.value === value;
        const badge = option.badge ?? null;
        const showLabel = collapse ? active : true;

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
            style={[styles.segment, collapse ? styles.segmentStacked : null]}
          >
            <View style={styles.glyphRow}>
              {badge !== null ? (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: active
                        ? theme.accent
                        : theme.surface,
                    },
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
              ) : option.icon ? (
                <Icon
                  name={option.icon}
                  size={collapse ? 17 : 15}
                  color={active ? theme.accent : theme.textTertiary}
                />
              ) : null}
            </View>
            {showLabel ? (
              <ThemedText
                type="label"
                numberOfLines={1}
                style={[
                  collapse ? styles.stackedLabel : null,
                  { color: active ? theme.accent : theme.textTertiary },
                ]}
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
    borderRadius: radii.pill,
    borderWidth: hairline,
    // Vertical only. A horizontal inset here would split the track's padding box
    // from its content box and put the thumb on a different grid to the segments.
    paddingVertical: PILL_INSET,
  },
  thumb: {
    position: "absolute",
    top: PILL_INSET,
    bottom: PILL_INSET,
    left: 0,
  },
  thumbFill: {
    flex: 1,
    marginHorizontal: PILL_INSET,
    borderRadius: radii.pill,
    borderWidth: hairline,
    // A glow in the accent rather than a grey drop: the pill is the *selected*
    // control, and a coloured light under it says so without a legend.
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 2,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: cardTokens.segmentHeight,
  },
  /**
   * The stacked row: glyph on a fixed line, name beneath it.
   *
   * `flex-start` with a fixed glyph row rather than `space-between`: the glyph
   * has to sit at the same height whether or not a name follows it, or every
   * icon on the strip would shift the moment the selection moved.
   */
  segmentStacked: {
    flexDirection: "column",
    gap: 0,
    justifyContent: "flex-start",
    // (44 − 18 glyph − 15 name) / 2, so the block is optically centred.
    paddingTop: 6,
  },
  glyphRow: {
    height: GLYPH_ROW,
    alignItems: "center",
    justifyContent: "center",
  },
  /** 12pt rather than the label's 14: a name must fit its fifth of the track. */
  stackedLabel: {
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: -0.3,
    // Never truncated: a name that ellipsised the instant it was selected would
    // read as a layout bug. At 12pt "Playlists" measures inside the thumb, which
    // is the whole reason the name moved to its own line.
    flexShrink: 0,
  },
  badge: {
    // Fixed width, like the Library's own count: a tally that changed width
    // would reflow the strip on every keystroke of a search.
    minWidth: 22,
    height: GLYPH_ROW,
    paddingHorizontal: spacing.xxs,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
