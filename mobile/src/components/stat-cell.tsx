import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { Reveal } from "@/components/motion/Reveal";
import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/ui/icon";
import { GlassSurface } from "@/components/ui/glass";
import { useTheme } from "@/hooks/use-theme";
import { spacing } from "@/theme/tokens";

export type StatCellProps = {
  label: string;
  value: string;
  icon?: IconName;
  /** Position in its grid, for the staggered entrance. */
  index?: number;
  style?: StyleProp<ViewStyle>;
};

export function StatCell({ label, value, icon, index = 0, style }: StatCellProps) {
  const theme = useTheme();

  return (
    <Reveal index={index} style={style}>
      <GlassSurface flat style={styles.cell}>
        {icon ? <Icon name={icon} size={16} color={theme.accent} /> : null}
        <ThemedText type="heading" numberOfLines={1}>
          {value}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {label}
        </ThemedText>
      </GlassSurface>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  cell: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: 20,
  },
});
