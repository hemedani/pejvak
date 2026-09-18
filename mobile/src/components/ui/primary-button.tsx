import { ActivityIndicator, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { hairline, radius as radii, spacing } from "@/theme/tokens";

/**
 * `solid` is the screen's one filled action. `ghost` is its quiet counterpart,
 * for the second choice in a pair — two glowing accent buttons side by side read
 * as two primary actions, which is never what the screen means.
 */
export type PrimaryButtonVariant = "solid" | "ghost";

export type PrimaryButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  loading?: boolean;
  variant?: PrimaryButtonVariant;
  style?: StyleProp<ViewStyle>;
};

/**
 * The one filled, accent-coloured action on a screen. Presses bounce like every
 * other control, and the accent doubles as the button's glow so it reads as lit
 * rather than lifted.
 */
export function PrimaryButton({
  label,
  loading,
  variant = "solid",
  disabled,
  style,
  ...rest
}: PrimaryButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const solid = variant === "solid";

  return (
    <ElasticPressable
      {...rest}
      accessibilityRole="button"
      disabled={isDisabled}
      haptic="medium"
      style={[
        styles.button,
        solid
          ? { backgroundColor: theme.accent, shadowColor: theme.accent }
          : {
              backgroundColor: theme.glass,
              borderWidth: hairline,
              borderColor: theme.glassBorder,
            },
        isDisabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={solid ? theme.onAccent : theme.text} />
      ) : (
        <ThemedText type="bodyStrong" style={{ color: solid ? theme.onAccent : theme.text }}>
          {label}
        </ThemedText>
      )}
    </ElasticPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    minHeight: 54,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  disabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
});
