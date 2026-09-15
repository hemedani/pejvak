import { ActivityIndicator, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { radius as radii, spacing } from "@/theme/tokens";

export type PrimaryButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The one filled, accent-coloured action on a screen. Presses bounce like every
 * other control, and the accent doubles as the button's glow so it reads as lit
 * rather than lifted.
 */
export function PrimaryButton({ label, loading, disabled, style, ...rest }: PrimaryButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  return (
    <ElasticPressable
      {...rest}
      accessibilityRole="button"
      disabled={isDisabled}
      haptic="medium"
      style={[
        styles.button,
        {
          backgroundColor: theme.accent,
          shadowColor: theme.accent,
        },
        isDisabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={theme.onAccent} />
      ) : (
        <ThemedText type="bodyStrong" style={{ color: theme.onAccent }}>
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
