/**
 * A circular, bouncy icon button — the transport controls and every round
 * action in the app.
 *
 * Three tones:
 *   accent — the filled play button, with a coloured glow rather than a grey
 *            drop shadow so it looks lit rather than lifted.
 *   glass  — translucent fill + hairline border, for controls that sit on top
 *            of artwork.
 *   ghost  — no surface at all, just the glyph.
 */

import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Icon, type IconName } from "@/components/ui/icon";
import type { HapticStyle } from "@/components/ui/haptics";
import { useTheme } from "@/hooks/use-theme";
import { radius as radii } from "@/theme/tokens";

export type BouncyIconButtonTone = "accent" | "glass" | "ghost";

/**
 * Apple HIG / Material minimum touch target, in points.
 *
 * Visual size and touch size are separate concerns: a 34 pt button looks right
 * in a dense toolbar but is genuinely hard to hit. Small buttons pad their
 * touch area out to this without changing the layout.
 */
const MIN_TOUCH_TARGET = 44;

export type BouncyIconButtonProps = {
  name: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  /** Diameter. */
  size?: number;
  iconSize?: number;
  tone?: BouncyIconButtonTone;
  disabled?: boolean;
  haptic?: HapticStyle;
  /** Overrides the tone's default glyph colour. */
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function BouncyIconButton({
  name,
  accessibilityLabel,
  onPress,
  size = 52,
  iconSize,
  tone = "glass",
  disabled = false,
  haptic = "light",
  color,
  style,
}: BouncyIconButtonProps) {
  const theme = useTheme();
  const resolvedIconSize = iconSize ?? Math.round(size * 0.42);
  const hitSlop = Math.max(0, Math.ceil((MIN_TOUCH_TARGET - size) / 2));

  const surface =
    tone === "accent"
      ? {
          backgroundColor: theme.accent,
          borderWidth: 0,
          shadowColor: theme.accent,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.45,
          shadowRadius: 18,
          elevation: 10,
        }
      : tone === "glass"
        ? {
            backgroundColor: theme.glass,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.glassBorder,
          }
        : { backgroundColor: "transparent" };

  const glyphColor = color ?? (tone === "accent" ? theme.onAccent : theme.icon);

  return (
    <ElasticPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic={tone === "accent" ? "medium" : haptic}
      hitSlop={hitSlop > 0 ? hitSlop : undefined}
      onPress={onPress}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        surface,
        disabled && styles.disabled,
        style,
      ]}>
      <Icon name={name} size={resolvedIconSize} color={glyphColor} />
    </ElasticPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
  },
  disabled: {
    opacity: 0.4,
  },
});
