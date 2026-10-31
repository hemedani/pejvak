/**
 * The one place a listener chooses their language.
 *
 * It states the current choice rather than hiding it behind a generic globe:
 * "فارسی" tells them what the Library's first tab will contain before they open
 * it, and "Language" tells them the shelf is still theirs to set.
 */

import { StyleSheet } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import type { OnlineLanguage } from "@/lib/online";
import { hairline, radius as radii, spacing } from "@/theme/tokens";

export type LanguageButtonProps = {
  language: OnlineLanguage | null;
  onPress: () => void;
};

export function LanguageButton({ language, onPress }: LanguageButtonProps) {
  const theme = useTheme();

  return (
    <ElasticPressable
      accessibilityRole="button"
      accessibilityLabel={
        language
          ? `Your language: ${language.nativeName}. Change it`
          : "Choose your language"
      }
      haptic="tap"
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: theme.glass,
          borderColor: theme.glassBorder,
        },
      ]}>
      <Icon name="globe" size={15} color={theme.accent} />
      <ThemedText
        type="label"
        numberOfLines={1}
        style={[styles.label, { color: language ? theme.text : theme.textSecondary }]}>
        {language?.nativeName ?? "Language"}
      </ThemedText>
      <Icon name="chevronDown" size={14} color={theme.textTertiary} />
    </ElasticPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 40,
    maxWidth: 150,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: hairline,
  },
  label: {
    flexShrink: 1,
  },
});
