import { useEffect, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/hooks/use-theme";
import { curve, duration, easing, useMotionEnabled } from "@/theme/motion";
import { field, spacing } from "@/theme/tokens";

export type FieldShellProps = {
  children: ReactNode;
  /** Omit only for SearchField, which has no visible label. */
  label?: string;
  hint?: string | null;
  /** Announce the hint when it changes (search result counts, tag limits). */
  hintLive?: boolean;
  error?: string | null;
  counter?: { value: number; max: number } | null;
  optional?: boolean;
  disabled?: boolean;
  focused?: boolean;
  invalid?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Pill track for search; rounded track for form fields. */
  pill?: boolean;
  /**
   * Let the input stretch to the track's height. Text areas need this; a
   * single-line row centres its text instead.
   */
  multiline?: boolean;
  /** The nativeID drawn on the label; the input points at it with accessibilityLabelledBy. */
  labelId?: string;
  /** The shell is the layout box: put flex/width here. */
  containerStyle?: StyleProp<ViewStyle>;
  /** The row that holds leading/input/trailing, for a text area's stretch layout. */
  shellStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The field's chassis: label, inset track, focus/error ring, and message.
 *
 * It deliberately owns no focus state. `TextField` does, because focus also
 * drives the keyboard reveal and the input's own handlers; a shell that kept
 * its own copy would be a second source of truth for the same moment.
 *
 * The ring is two overlays rather than a changing border. Animating
 * `borderWidth` would relayout the track on every frame and make the text jump
 * a pixel when focus lands; two static boxes with an animated `opacity` cost
 * one compositor property and nothing else.
 */
export function FieldShell({
  children,
  label,
  hint,
  hintLive = false,
  error,
  counter,
  optional = false,
  disabled = false,
  focused = false,
  invalid = false,
  leading,
  trailing,
  pill = false,
  multiline = false,
  labelId,
  containerStyle,
  shellStyle,
  testID,
}: FieldShellProps) {
  const theme = useTheme();
  const motionEnabled = useMotionEnabled();
  const showRing = focused || invalid;
  const ringOpacity = useSharedValue(showRing ? 1 : 0);

  useEffect(() => {
    const target = showRing ? 1 : 0;
    ringOpacity.value = motionEnabled
      ? withTiming(target, curve(easing.outQuint, duration.toggle))
      : target;
  }, [motionEnabled, ringOpacity, showRing]);

  const animatedRing = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
  }));

  const message = error ?? hint;
  const trackRadius = pill ? field.searchRadius : field.radius;

  return (
    <View style={[styles.root, containerStyle]} testID={testID}>
      {label ? (
        <View style={styles.labelRow}>
          <ThemedText
            type="label"
            themeColor={disabled ? "textTertiary" : "textSecondary"}
            nativeID={labelId}
            style={styles.label}>
            {label}
          </ThemedText>
          {optional || counter ? (
            <View style={styles.labelMeta}>
              {optional ? (
                <ThemedText type="caption" themeColor="textTertiary">
                  Optional
                </ThemedText>
              ) : null}
              {counter ? (
                <ThemedText
                  type="numeric"
                  themeColor={
                    counter.value >= counter.max ? "textSecondary" : "textTertiary"
                  }>
                  {counter.value}/{counter.max}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <Card
        variant="inset"
        bordered={false}
        padded={false}
        clip
        style={[styles.track, { borderRadius: trackRadius }]}>
        <View
          style={[
            styles.content,
            pill ? styles.searchContent : null,
            multiline ? styles.multilineContent : null,
            shellStyle,
          ]}>
          {leading}
          {children}
          {trailing}
        </View>

        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: trackRadius,
              borderWidth: field.borderWidth,
              borderColor: disabled ? theme.outlineVariant : theme.outlineStrong,
            },
          ]}
        />

        <Animated.View
          pointerEvents="none"
          testID="field-focus-ring"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: trackRadius,
              borderWidth: field.ringWidth,
              borderColor: invalid ? theme.danger : theme.accent,
            },
            motionEnabled ? animatedRing : { opacity: showRing ? 1 : 0 },
          ]}
        />
      </Card>

      {message ? (
        <ThemedText
          type="caption"
          themeColor={error ? "danger" : "textTertiary"}
          accessibilityLiveRegion={error || hintLive ? "polite" : "none"}
          style={styles.message}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minWidth: 0,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: field.labelGap,
  },
  label: {
    flexShrink: 1,
  },
  labelMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  track: {
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: field.gap,
    minHeight: field.minHeight,
    paddingHorizontal: field.paddingHorizontal,
    paddingVertical: field.paddingVertical,
  },
  searchContent: {
    minHeight: field.searchMinHeight,
  },
  multilineContent: {
    alignItems: "stretch",
  },
  message: {
    marginTop: field.messageGap,
  },
});
