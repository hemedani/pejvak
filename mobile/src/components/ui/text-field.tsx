import { useCallback, useRef } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { useFieldRegistrar } from "@/components/ui/keyboard-scroll-view";
import { useTheme } from "@/hooks/use-theme";
import { card as cardTokens, radius as radii, spacing } from "@/theme/tokens";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  /** Forwarded to the input, for callers that need to style the text itself. */
  style?: TextInputProps["style"];
};

export function TextField({ label, style, onFocus, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const registrar = useFieldRegistrar();
  const containerRef = useRef<View>(null);

  /**
   * Ask the enclosing scroll view to bring this field out from under the
   * keyboard.
   *
   * The platform's own help does not fire here: Android only scrolls a *direct*
   * child of a `ScrollView` into view, and this input is nested two levels down
   * inside the field's own label wrapper and a `Reveal`. Measuring on focus is
   * what replaces it.
   */
  const handleFocus = useCallback<NonNullable<TextInputProps["onFocus"]>>(
    (event) => {
      registrar?.reveal(containerRef.current);
      onFocus?.(event);
    },
    [onFocus, registrar],
  );

  return (
    <View ref={containerRef} collapsable={false} style={styles.container}>
      <ThemedText type="label" themeColor="textSecondary">
        {label}
      </ThemedText>
      {/* A field is an inset track, not a frosted panel: it is the one step below
          the card it sits in, and it must be opaque so a focused field stays
          legible over a keyboard-sized amount of whatever is behind it. */}
      <Card variant="inset" padded={false} style={styles.input}>
        <TextInput
          placeholderTextColor={theme.textTertiary}
          onFocus={handleFocus}
          style={[styles.text, { color: theme.text }, style]}
          {...rest}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    // `collapsable={false}` keeps the node measurable on Android, where a plain
    // layout-only view can be flattened out of the native tree and never
    // measured at all.
  },
  input: {
    borderRadius: radii.md,
    overflow: "hidden",
  },
  text: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    minHeight: cardTokens.rowMinHeight,
  },
});
