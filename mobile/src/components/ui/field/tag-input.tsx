import { useId, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { FieldShell } from "@/components/ui/field/field-shell";
import { useFieldFocus } from "@/components/ui/field/use-field-focus";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { addTag, removeTag } from "@/lib/tags";
import { field, hairline, radius as radii, spacing } from "@/theme/tokens";

export type TagInputProps = {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
  /** Per tag, not per draft. */
  maxLength?: number;
  hint?: string | null;
  disabled?: boolean;
  testID?: string;
};

/**
 * Tags in a composer: a value, not a filter.
 *
 * The chips are `surface` with a hairline, unlike `GlassChip` which means "show
 * me the things that match". Here the chip is the thing being edited, so it
 * carries a remove control and no press-to-filter behaviour.
 *
 * Entry commits on Enter or a comma — never on space, because "Persian history"
 * is one legitimate tag. Backspace in an empty draft removes the chip before
 * it, which is the only way to undo a tag without reaching for a small target.
 */
export function TagInput({
  label,
  value,
  onChange,
  maxTags = 10,
  maxLength = 24,
  hint,
  disabled = false,
  testID,
}: TagInputProps) {
  const theme = useTheme();
  const labelId = useId();
  const containerRef = useRef<View>(null);
  const [draft, setDraft] = useState("");
  const { focused, handleFocus, handleBlur } = useFieldFocus({
    containerRef,
  });

  const atLimit = value.length >= maxTags;
  const editable = !disabled && !atLimit;

  const commit = (candidate: string): boolean => {
    const result = addTag(value, candidate, { maxTags, maxLength });
    if (!result.added) {
      return false;
    }
    onChange(result.tags);
    return true;
  };

  const handleChange = (text: string) => {
    if (!/[,،]/.test(text)) {
      setDraft(text);
      return;
    }
    const candidate = text.replace(/[,،]/g, "");
    if (commit(candidate)) {
      setDraft("");
    } else {
      setDraft(candidate);
    }
  };

  const handleKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    if (
      event.nativeEvent.key === "Backspace" &&
      draft.length === 0 &&
      value.length > 0
    ) {
      onChange(removeTag(value, value.length - 1));
    }
  };

  return (
    <View ref={containerRef} collapsable={false}>
      <FieldShell
        label={label}
        labelId={labelId}
        hint={hint ?? `Up to ${maxTags} tags`}
        disabled={disabled}
        focused={focused}
        shellStyle={styles.shell}
      >
        {value.map((tag, index) => (
          <View
            key={`${tag}-${index}`}
            style={[
              styles.chip,
              { borderColor: theme.outlineVariant, backgroundColor: theme.surface },
            ]}>
            <ThemedText type="caption" themeColor="text">
              {tag}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove tag ${tag}`}
              disabled={disabled}
              hitSlop={6}
              onPress={() => onChange(removeTag(value, index))}>
              <Icon name="close" size={13} color={theme.textTertiary} />
            </Pressable>
          </View>
        ))}

        <TextInput
          testID={testID}
          value={draft}
          editable={editable}
          accessibilityLabelledBy={labelId}
          accessibilityHint={hint ?? `Up to ${maxTags} tags`}
          accessibilityState={{ disabled: !editable }}
          placeholder={atLimit ? "Tag limit reached" : "Add a tag"}
          placeholderTextColor={theme.textTertiary}
          selectionColor={theme.accent}
          cursorColor={theme.accent}
          underlineColorAndroid="transparent"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="done"
          submitBehavior="submit"
          maxLength={maxLength}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyPress={handleKeyPress}
          onChangeText={handleChange}
          onSubmitEditing={() => {
            if (commit(draft)) {
              setDraft("");
            }
          }}
          style={[styles.input, { color: theme.text }]}
        />
      </FieldShell>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexWrap: "wrap",
    rowGap: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    height: field.chipHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: hairline,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 80,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 16,
  },
});
