import { useEffect, useId, useRef, type ReactNode, type Ref, type RefObject } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { FieldShell } from "@/components/ui/field/field-shell";
import { useFieldFocus } from "@/components/ui/field/use-field-focus";
import { useTheme } from "@/hooks/use-theme";
import { field, typeScale } from "@/theme/tokens";

export type TextFieldProps = Omit<
  TextInputProps,
  "style" | "placeholderTextColor" | "underlineColorAndroid"
> & {
  /** Required for form fields; optional only because SearchField wraps this. */
  label?: string;
  /** Text style. Layout belongs in containerStyle. */
  style?: TextInputProps["style"];
  containerStyle?: StyleProp<ViewStyle>;
  hint?: string | null;
  /** Announce the hint when it changes. Search uses this for its result count. */
  hintLiveRegion?: boolean;
  error?: string | null;
  optional?: boolean;
  /** Shown only when maxLength is set and showCounter is not false. */
  showCounter?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  pill?: boolean;
  /** Text area defaults; TextArea sets these. */
  minLines?: number;
  maxLines?: number;
  /**
   * Reveal this node instead of the field's own box. A composer passes the
   * group that also holds its Cancel/Save row.
   */
  revealTargetRef?: RefObject<View | null>;
  inputRef?: Ref<TextInput>;
};

/**
 * The app's one text input.
 *
 * A field is an **inset track**, not a frosted panel: it sits one step below the
 * card it belongs to and stays opaque, so a focused field is still legible over
 * whatever the keyboard pushes behind it. The label lives above the track, not
 * inside it as a placeholder, because a placeholder disappears exactly when the
 * listener needs to know what the field is for.
 */
export function TextField({
  label,
  style,
  containerStyle,
  hint,
  hintLiveRegion = false,
  error,
  optional = false,
  showCounter = true,
  leading,
  trailing,
  pill = false,
  minLines,
  maxLines,
  revealTargetRef,
  inputRef,
  value,
  maxLength,
  multiline = false,
  editable,
  onFocus,
  onBlur,
  accessibilityState,
  accessibilityHint,
  accessibilityLabelledBy,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const labelId = useId();
  const containerRef = useRef<View>(null);
  const disabled = editable === false;
  const invalid = Boolean(error);
  const { focused, handleFocus, handleBlur } = useFieldFocus({
    containerRef,
    onFocus,
    onBlur,
    revealTargetRef,
  });

  const counter =
    showCounter && maxLength !== undefined
      ? {
          value: typeof value === "string" ? value.length : 0,
          max: maxLength,
        }
      : null;

  useEffect(() => {
    if (__DEV__ && !label && !pill) {
      console.warn(
        "TextField needs a visible label. Only SearchField may omit one.",
      );
    }
  }, [label, pill]);

  const lineHeight = typeScale.body.lineHeight;
  const verticalChrome = field.paddingVertical * 2;
  const multilineStyle: TextStyle | null = multiline
    ? {
        minHeight: Math.max(
          (minLines ?? 3) * lineHeight,
          field.textareaMinHeight - verticalChrome,
        ),
        maxHeight: Math.min(
          (maxLines ?? 8) * lineHeight,
          field.textareaMaxHeight - verticalChrome,
        ),
      }
    : null;

  return (
    <View ref={containerRef} collapsable={false} style={containerStyle}>
      <FieldShell
        label={label}
        hint={hint}
        hintLive={hintLiveRegion}
        error={error}
        counter={counter}
        optional={optional}
        disabled={disabled}
        focused={focused}
        invalid={invalid}
        leading={leading}
        trailing={trailing}
        pill={pill}
        multiline={multiline}
        labelId={labelId}>
        <TextInput
          ref={inputRef}
          value={value}
          maxLength={maxLength}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : undefined}
          editable={editable}
          {...rest}
          placeholderTextColor={theme.textTertiary}
          selectionColor={theme.accent}
          cursorColor={theme.accent}
          underlineColorAndroid="transparent"
          accessibilityLabelledBy={
            label ? labelId : accessibilityLabelledBy
          }
          accessibilityHint={error ?? hint ?? accessibilityHint ?? undefined}
          accessibilityState={
            disabled
              ? { ...accessibilityState, disabled: true }
              : accessibilityState
          }
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[
            styles.text,
            multilineStyle,
            { color: theme.text },
            style,
          ]}
        />
      </FieldShell>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    fontWeight: "500",
  },
});
