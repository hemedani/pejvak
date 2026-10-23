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
 * names that alternates its alignment is unreadable as a list. `UserText` still
 * sets `writingDirection`, so the shaping and any numerals inside the name are
 * correct — only the alignment is pinned to the shell.
 */

import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { ListRow, type ListRowPosition } from "@/components/ui/row";
import { useTheme } from "@/hooks/use-theme";
import type { OnlineLanguage } from "@/lib/online";
import { spacing } from "@/theme/tokens";

export type LanguageRowProps = {
  language: OnlineLanguage;
  /** How many sources serve it. Zero means the row is inert. */
  sourceCount: number;
  onPress: () => void;
  /** Supplied by `ListGroup`; not part of the row's own API. */
  position?: ListRowPosition;
};

export function LanguageRow({
  language,
  sourceCount,
  onPress,
  position,
}: LanguageRowProps) {
  const theme = useTheme();
  const enabled = sourceCount > 0;

  return (
    <ListRow
      position={position}
      title={language.nativeName}
      titleAlign="start"
      titleLines={1}
      meta={language.name}
      disabled={!enabled}
      disabledReason="No sources for this language yet"
      onPress={onPress}
      accessibilityLabel={`${language.nativeName}, ${language.name}`}
      accessibilityHint={enabled ? undefined : "No sources for this language yet"}
      trailing={
        <View style={styles.trailing}>
          <ThemedText
            type="overline"
            numberOfLines={1}
            style={{ color: enabled ? theme.accent : theme.textTertiary }}>
            {enabled ? `${sourceCount} source${sourceCount === 1 ? "" : "s"}` : "Nothing yet"}
          </ThemedText>
          {enabled ? (
            <Icon name="chevronRight" size={16} color={theme.textTertiary} />
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
