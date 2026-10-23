import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { triggerHaptic } from "@/components/ui/haptics";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import {
  ANNOTATION_COLOR_NAMES,
  ANNOTATION_COLORS,
} from "@/lib/annotations";
import { readableOn } from "@/lib/color";
import { field, radius as radii, spacing } from "@/theme/tokens";

export type ColorFieldProps = {
  label?: string;
  value: string | null;
  onChange: (color: string) => void;
  disabled?: boolean;
};

/**
 * The annotation colour picker: six radios, not a palette.
 *
 * A radio group is the honest control — one colour is chosen, and the check
 * says which. The check's own colour comes from `readableOn`, because the
 * swatches span light amber to deep purple and a single foreground would
 * disappear on one end of that range.
 */
export function ColorField({
  label = "Colour",
  value,
  onChange,
  disabled = false,
}: ColorFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <ThemedText
        type="label"
        themeColor={disabled ? "textTertiary" : "textSecondary"}>
        {label}
      </ThemedText>

      <View style={styles.row}>
        {ANNOTATION_COLORS.map((color) => {
          const checked = value === color;
          return (
            <Pressable
              key={color}
              accessibilityRole="radio"
              accessibilityLabel={ANNOTATION_COLOR_NAMES[color]}
              accessibilityState={{ checked, disabled }}
              disabled={disabled}
              onPress={() => {
                triggerHaptic("select");
                onChange(color);
              }}
              style={[
                styles.swatch,
                { backgroundColor: color },
                checked
                  ? {
                      borderWidth: field.swatchRing,
                      borderColor: theme.text,
                    }
                  : { borderWidth: field.swatchRing, borderColor: "transparent" },
                disabled && styles.disabled,
              ]}>
              {checked ? (
                <Icon name="check" size={18} color={readableOn(color)} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: field.labelGap,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  swatch: {
    width: field.swatch,
    height: field.swatch,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
});
