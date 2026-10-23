import { useCallback, useState, type RefObject } from "react";
import type { TextInputProps, View } from "react-native";

import { useFieldRegistrar } from "@/components/ui/keyboard-scroll-view";

/**
 * Focus state for one field, plus the keyboard reveal.
 *
 * Android only scrolls a *direct* child of a `ScrollView` into view, and a
 * field is never a direct child: the platform's own help cannot reach it. The
 * enclosing `KeyboardScrollView`/`KeyboardAwareFlatList` registers a `reveal`
 * that measures a node on focus instead, so that is where the field asks.
 *
 * The node measured is the whole field — label, track and message — because a
 * label or an error left under the keyboard is just as unusable as the input.
 * A composer passes `revealTargetRef` for the group that includes its action
 * row, or the listener can type but not reach the button that finishes.
 */
export function useFieldFocus(options: {
  containerRef: RefObject<View | null>;
  onFocus?: TextInputProps["onFocus"];
  onBlur?: TextInputProps["onBlur"];
  revealTargetRef?: RefObject<View | null>;
}): {
  focused: boolean;
  handleFocus: NonNullable<TextInputProps["onFocus"]>;
  handleBlur: NonNullable<TextInputProps["onBlur"]>;
} {
  const { containerRef, onFocus, onBlur, revealTargetRef } = options;
  const registrar = useFieldRegistrar();
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback<NonNullable<TextInputProps["onFocus"]>>(
    (event) => {
      setFocused(true);
      registrar?.reveal(revealTargetRef?.current ?? containerRef.current);
      onFocus?.(event);
    },
    [containerRef, onFocus, registrar, revealTargetRef],
  );

  const handleBlur = useCallback<NonNullable<TextInputProps["onBlur"]>>(
    (event) => {
      setFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  return { focused, handleFocus, handleBlur };
}
