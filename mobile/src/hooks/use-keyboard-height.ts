/**
 * The keyboard's current height, for a sheet that has to sit above it.
 *
 * Deliberately layout-only: the value is used to size and offset a panel, never
 * to tween anything, so there is no duration to guess and nothing animates on a
 * keyboard event. `KeyboardScrollView` owns the *form* case (scrolling a focused
 * field into view); a modal sheet is its own window and needs the height itself.
 */

import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // `will*` on iOS so the sheet moves with the keyboard; `did*` on Android,
    // where the event and the resize are the same frame.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
