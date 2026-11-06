/**
 * The one place a listener chooses their language.
 *
 * It states the current choice rather than hiding it behind a generic globe:
 * "فارسی" tells them what the Library's Online tab will contain before they open
 * it.
 *
 * ## Two controls, because there are two states
 *
 * With a language chosen the control is a pill in the header — a compact
 * statement of the current setting. With none chosen it is `LanguagePrompt`, a
 * full-width row that says what the choice is *for*: "Select a language to get
 * online resources".
 *
 * They are separate components rather than one with a variant because the
 * unset label is a sentence, not a name. A 46-character sentence in a 150pt pill
 * is truncated to "Select a lang…", which tells the listener nothing — and the
 * prompt is the only place the app explains why a language matters at all.
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

/**
 * The unset state: a full-width row that asks for the choice and says why.
 *
 * It sits under the header rather than inside it — a sentence needs the width
 * of the screen, and squeezing it into the header's trailing slot would either
 * clip it or push the title off the leading edge.
 */
export function LanguagePrompt({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <ElasticPressable
      accessibilityRole="button"
      accessibilityLabel="Select a language to get online resources"
      accessibilityHint="Opens the list of languages"
      haptic="tap"
      onPress={onPress}
      style={[
        styles.prompt,
        {
          backgroundColor: theme.glass,
          borderColor: theme.glassBorder,
        },
      ]}>
      <Icon name="globe" size={18} color={theme.accent} />
      <ThemedText type="label" style={[styles.promptLabel, { color: theme.text }]}>
        Select a language to get online resources
      </ThemedText>
      <Icon name="chevronRight" size={16} color={theme.textTertiary} />
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
  prompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: hairline,
  },
  promptLabel: {
    flex: 1,
    // Two lines at most: the sentence fits on one at any normal width, and a
    // third line would make the prompt taller than the search field below it.
    lineHeight: 20,
  },
});
