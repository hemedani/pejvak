import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";

export type StatCellProps = {
  label: string;
  value: string;
  style?: StyleProp<ViewStyle>;
};

export function StatCell({ label, value, style }: StatCellProps) {
  return (
    <ThemedView type="backgroundElement" style={[styles.cell, style]}>
      <ThemedText type="smallBold" numberOfLines={1}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  cell: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
