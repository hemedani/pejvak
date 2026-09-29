/**
 * One language in the Browse list.
 *
 * Two facts decide how this row reads: the language's own name, which is what
 * the listener recognises, and whether anything is available in it yet. The
 * English name is kept as small print because the list is ordered by it, and the
 * order is worth being able to explain.
 *
 * A language with no source is shown rather than hidden — the catalogue is the
 * whole world's languages on purpose, and "we have nothing here yet" is a
 * different answer from "this language does not exist". It is simply not
 * pressable, because there is nowhere for it to go.
 *
 * Alignment is deliberately *not* mirrored for a right-to-left language. These
 * names are single words with nothing to re-order, and a column of language
 * names that alternates its alignment is unreadable as a list. `writingDirection`
 * is still set so the shaping and any numerals inside the name are correct.
 */

import { StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import type { OnlineLanguage } from "@/lib/online";
import { spacing } from "@/theme/tokens";

export type LanguageRowProps = {
  language: OnlineLanguage;
  /** How many sources serve it. Zero means the row is inert. */
  sourceCount: number;
  onPress: () => void;
};

export function LanguageRow({ language, sourceCount, onPress }: LanguageRowProps) {
  const theme = useTheme();
  const rtl = language.direction === "rtl";
  const enabled = sourceCount > 0;

  const trailing = enabled
    ? `${sourceCount} source${sourceCount === 1 ? "" : "s"}`
    : "Nothing yet";

  return (
    <ElasticPressable
      accessibilityRole="button"
      accessibilityLabel={`${language.nativeName}, ${language.name}`}
      accessibilityHint={enabled ? undefined : "No sources for this language yet"}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      scaleTo={0.985}
      overshootTo={1.004}
      haptic="light"
      onPress={onPress}
      style={styles.row}>
      <View style={styles.copy}>
        <ThemedText
          type="bodyStrong"
          numberOfLines={1}
          style={[rtl && styles.rtl, !enabled && styles.dim]}>
          {language.nativeName}
        </ThemedText>
        <ThemedText
          type="caption"
          themeColor="textTertiary"
          numberOfLines={1}
          style={!enabled ? styles.dim : undefined}>
          {language.name}
        </ThemedText>
      </View>

      <ThemedText
        type="overline"
        numberOfLines={1}
        style={{ color: enabled ? theme.accent : theme.textTertiary }}>
        {trailing}
      </ThemedText>

      {enabled ? <Icon name="chevronRight" size={16} color={theme.textTertiary} /> : null}
    </ElasticPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  rtl: {
    writingDirection: "rtl",
  },
  dim: {
    opacity: 0.55,
  },
});
