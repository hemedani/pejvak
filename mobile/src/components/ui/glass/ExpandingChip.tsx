/**
 * A chip that shows its glyph alone until it is the selected one.
 *
 * The Library's strip has to fit five views across one line. Labelled chips do
 * not — the fifth wraps to a second row, and a tab strip that breaks in two is
 * read as two strips. Collapsing the unselected chips to their glyphs is what
 * buys the room, and expanding the selected one is what keeps the strip legible:
 * the listener can always see where they are, and a glyph they do not recognise
 * is one tap away from saying its name.
 *
 * ## Why the width is measured rather than inferred
 *
 * The label has to slide *out of* the pill, which means the pill's width has to
 * animate — a layout animation would scale the glyph and the text horizontally
 * on its way, which looks like rubber rather than glass. So the width is a real
 * animated value, and it needs to know how wide the label is.
 *
 * Measuring a label inside a pill that is 44pt wide cannot work: the text is
 * laid out against whatever space the pill has, so it would report the width of
 * a truncated word. The label therefore sits in an absolutely positioned layer
 * with no width of its own — Yoga sizes that to its content, unconstrained — and
 * `onLayout` on it reports the label's true width. The pill clips it.
 *
 * ## The opening frame
 *
 * `open` starts at 0 even for the selected chip, so a strip that mounts expands
 * itself into place instead of drawing one collapsed frame and jumping. That is
 * also the frame the label is measured on, so the measurement has landed long
 * before the spring does.
 */

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { spring, useMotionEnabled } from "@/theme/motion";
import { hairline, radius as radii, spacing } from "@/theme/tokens";

/** The glyph, or the count that takes its place during a search. */
const LEADING = 24;
/**
 * Padding either side of that slot.
 *
 * Nine rather than ten, which makes the collapsed pill 42 × 44 — visually a
 * circle — and buys the two points that let five chips and the longest label
 * ("Playlists") share one line on a 360pt phone with room to spare.
 */
const PADDING = 9;
/** Gap between the leading slot and the label. */
const LABEL_GAP = spacing.sm;
/** Where the label starts inside the pill. */
const LABEL_LEFT = PADDING + LEADING + LABEL_GAP;
/** The collapsed pill: a circle the height of the strip. */
const COLLAPSED = LEADING + PADDING * 2;

export type ExpandingChipProps = {
  label: string;
  icon: IconName;
  selected: boolean;
  /**
   * How many results this view would show, or `null` when it is not a filter.
   * Zero is a real answer and is rendered — it is the one that sends the
   * listener somewhere else.
   */
  count?: number | null;
  onPress: () => void;
};

/** Caps the badge at three characters; see `GlassChip`. */
function formatCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function ExpandingChip({
  label,
  icon,
  selected,
  count,
  onPress,
}: ExpandingChipProps) {
  const theme = useTheme();
  const motionEnabled = useMotionEnabled();
  const counting = count !== null && count !== undefined;

  const [labelWidth, setLabelWidth] = useState(0);
  const open = useSharedValue(0);

  /**
   * Measured once and then stable: the label never changes, and a re-render
   * during a search (which does not touch this text) must not restart it.
   */
  const measureLabel = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      setLabelWidth((current) => (Math.abs(current - width) < 0.5 ? current : width));
    }
  }, []);

  const target = selected ? 1 : 0;
  useEffect(() => {
    open.value = motionEnabled ? withSpring(target, spring.dock) : target;
  }, [motionEnabled, open, target]);

  const pillStyle = useAnimatedStyle(
    () => ({
      width: COLLAPSED + open.value * (labelWidth + LABEL_GAP),
    }),
    [labelWidth],
  );

  const labelStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    // A small travel inward, so the label reads as emerging from behind the
    // glyph rather than as a wider pill with text already in it.
    transform: [{ translateX: (1 - open.value) * -6 }],
  }));

  return (
    <ElasticPressable
      accessibilityRole="button"
      accessibilityLabel={
        counting
          ? `${label}, ${count} result${count === 1 ? "" : "s"}`
          : selected
            ? `${label}, selected`
            : label
      }
      accessibilityState={{ selected }}
      haptic="select"
      onPress={onPress}>
      <Animated.View
        style={[
          styles.pill,
          {
            backgroundColor: selected ? theme.accentSoft : theme.glass,
            borderColor: selected ? theme.accent : theme.glassBorder,
          },
          pillStyle,
        ]}>
        <View style={styles.leading}>
          {counting ? (
            <View
              style={[
                styles.count,
                { backgroundColor: selected ? theme.accent : theme.glassStrong },
              ]}>
              <ThemedText
                type="caption"
                numberOfLines={1}
                style={{
                  color: selected
                    ? theme.onAccent
                    : count === 0
                      ? theme.textTertiary
                      : theme.textSecondary,
                }}>
                {formatCount(count)}
              </ThemedText>
            </View>
          ) : (
            <Icon name={icon} size={15} color={selected ? theme.accent : theme.icon} />
          )}
        </View>

        {/* Out of the flow on purpose: it must be measured against no width at
            all, and the pill's own width is animated from outside it. */}
        <Animated.View
          pointerEvents="none"
          onLayout={measureLabel}
          style={[styles.labelSlot, labelStyle]}>
          <ThemedText
            type="label"
            numberOfLines={1}
            style={{ color: selected ? theme.accent : theme.text }}>
            {label}
          </ThemedText>
        </Animated.View>
      </Animated.View>
    </ElasticPressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: radii.pill,
    borderWidth: hairline,
    // The label is wider than the collapsed pill; clipping is what makes the
    // growing edge reveal it.
    overflow: "hidden",
  },
  leading: {
    width: LEADING,
    // A margin rather than the pill's own padding: the label is positioned
    // absolutely, and an absolutely positioned child is offset from the
    // parent's padding box — so padding here would move the label twice.
    marginLeft: PADDING,
    alignItems: "center",
    justifyContent: "center",
  },
  labelSlot: {
    position: "absolute",
    left: LABEL_LEFT,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  count: {
    // Fixed rather than a minimum: a count that changed width would reflow the
    // whole strip on every keystroke of a search.
    width: LEADING,
    paddingVertical: 1,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
