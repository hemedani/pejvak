/**
 * The one search field in the app.
 *
 * It exists as a component rather than as a `TextField` with a prop because
 * search is not a form field: it has a leading glyph that changes weight when
 * it holds something, a clear affordance that only exists when there is
 * something to clear, and a summary line underneath that belongs to the field
 * rather than to the list. Screens that spell that out themselves get one of
 * the three wrong.
 *
 * The field is `flat` on purpose. It sits in a scroll header above a list of
 * hundreds of rows, and a blur view per screen header is the expensive part of
 * `GlassSurface` for no visible gain over a solid frosted fill.
 */

import { StyleSheet, TextInput, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { spacing } from "@/theme/tokens";

export type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /**
   * What the query found, or where else it would have found something. Kept
   * outside the field because it is the caller that knows about the other tabs.
   */
  hint?: string | null;
  autoFocus?: boolean;
  /** Rendered inside the field, before the input. */
  accessibilityLabel?: string;
};

export function SearchField({
  value,
  onChangeText,
  placeholder = "Search",
  hint,
  autoFocus = false,
  accessibilityLabel = "Search",
}: SearchFieldProps) {
  const theme = useTheme();
  const hasValue = value.trim().length > 0;

  return (
    <View style={styles.wrap}>
      <GlassSurface flat radius="pill" style={styles.field}>
        <Icon name="search" size={18} color={hasValue ? theme.text : theme.textTertiary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          // Search is not prose: autocorrect would fight the query, and
          // autocapitalisation would capitalise a Persian word's first letter
          // into a different code point than the title uses.
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          // The field draws its own clear button, so the platform's would be a
          // second one in the same corner.
          clearButtonMode="never"
          accessibilityLabel={accessibilityLabel}
          autoFocus={autoFocus}
          style={[styles.input, { color: theme.text }]}
        />
        {hasValue ? (
          <BouncyIconButton
            name="close"
            accessibilityLabel="Clear search"
            size={30}
            iconSize={16}
            tone="ghost"
            onPress={() => onChangeText("")}
          />
        ) : null}
      </GlassSurface>

      {hint ? (
        <ThemedText type="caption" themeColor="textTertiary" numberOfLines={2} style={styles.hint}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 16,
    // No vertical padding: the field's own minHeight owns the height, and a
    // TextInput with padding of its own drifts off-centre against the glyphs.
    paddingVertical: 0,
    minWidth: 0,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
});
