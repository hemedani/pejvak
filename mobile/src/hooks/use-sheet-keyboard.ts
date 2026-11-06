/**
 * What a modal sheet needs to know to stay above the keyboard.
 *
 * A `Modal` is its own window, so it does not inherit `Screen`'s safe area and
 * it does not automatically resize for the keyboard on Android 15+ (or on iOS).
 * The sheet therefore measures itself and combines that with the keyboard's own
 * height through `keyboardOverlapFor` — the same rule the scrollable forms use,
 * so a window that *did* resize is not counted twice.
 *
 * Returns the overlap to reserve and a layout handler for the sheet's root.
 */

import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { keyboardOverlapFor } from "@/components/ui/keyboard-scroll-view";

export function useSheetKeyboard() {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [restingHeight, setRestingHeight] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    // The tallest layout seen is the resting window: the keyboard only ever
    // takes height away, and Android can report the resize before the event.
    setRestingHeight((tallest) => Math.max(tallest, height));
    setViewportHeight(height);
  }, []);

  const overlap = keyboardOverlapFor({
    restingHeight,
    viewportHeight,
    keyboardHeight,
  });

  return { insets, overlap, viewportHeight, onLayout };
}
