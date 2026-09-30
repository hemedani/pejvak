/**
 * A `ScrollView` that gets a focused field out from under the keyboard.
 *
 * ## Why this exists at all
 *
 * Android's `ScrollView` *does* scroll a focused input into view — but only a
 * **direct child**. Every text field in this app sits at least two levels down
 * (`Reveal` → the field's own label wrapper → the `TextInput`), so the platform
 * help never fires, and a field near the bottom of a form ends up behind the
 * keyboard with nothing the user can do about it.
 *
 * `KeyboardAvoidingView` does not cover for it either: the auth screens passed
 * `behavior={undefined}` on Android, which reduces the component to a plain
 * `View`. And it is not the right tool anyway — this component *is* the
 * avoidance, so the two must not both be in the tree or the keyboard gets
 * counted twice.
 *
 * ## How the overlap is found
 *
 * Two candidate numbers, and the answer depends on which one the platform
 * actually gave us:
 *
 *   · `restingHeight − viewportHeight` — how much the viewport itself shrank.
 *     This is Android, where the window resizes (`adjustResize`), so the scroll
 *     view is *already* shorter and adding the keyboard height again would leave
 *     a keyboard-tall gap under the form.
 *   · `keyboardHeight` — what the keyboard reports. This is iOS, where nothing
 *     resizes and the space has to be supplied.
 *
 * `keyboardOverlap` picks between them by asking which one the viewport
 * actually lost, so the result is right on either platform's soft-input mode
 * without a branch on `Platform.OS` deciding the answer.
 *
 * ## No native dependency, deliberately
 *
 * `react-native-keyboard-controller` is the better tool and is what the platform
 * guidance reaches for. It is not installed, and adding a native module that
 * Expo Go does not bundle would break the way this app is actually tested. So
 * this is built on the `Keyboard` API already in React Native and used for
 * *layout* — there is no duration to guess at and nothing here tweens on a
 * keyboard event.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/** Breathing room left between the keyboard and the field it revealed. */
const KEYBOARD_GAP = 24;

/**
 * How much of the viewport the keyboard is covering.
 *
 * `restingHeight` is the viewport before the keyboard appeared; `viewportHeight`
 * is it now. When the window resized, the difference *is* the overlap. When it
 * did not, nothing has been taken from us and the keyboard's own reported height
 * is what still needs reserving.
 *
 * Clamped to `keyboardHeight` in the resized case as a guard: a rotation or a
 * font-scale change between the two measurements would otherwise be mistaken for
 * a giant keyboard and open a gap under the form.
 */
export function keyboardOverlapFor(input: {
  restingHeight: number;
  viewportHeight: number;
  keyboardHeight: number;
}): number {
  const keyboard = Math.max(0, input.keyboardHeight);
  const resting = Math.max(0, input.restingHeight);
  const viewport = Math.max(0, input.viewportHeight);

  if (resting === 0) {
    // Never measured — the keyboard is the only number we have.
    return keyboard;
  }
  const shrunk = resting - viewport;
  if (shrunk <= 0) {
    // The viewport kept its height, so the space has to be supplied by us.
    return keyboard;
  }
  return Math.min(shrunk, keyboard);
}

/**
 * Where to scroll so `fieldY` lands inside the band the user can actually see.
 *
 * Only scrolls when the field is genuinely below the fold: a field already
 * visible produces a negative target, which clamps to `0` and leaves the list
 * where the reader left it. Scrolling a visible form out from under the user's
 * thumb is its own bug.
 */
export function revealTargetY(input: {
  fieldY: number;
  fieldHeight: number;
  viewportHeight: number;
  overlap: number;
  gap?: number;
}): number {
  const visible = Math.max(
    0,
    input.viewportHeight - Math.max(0, input.overlap),
  );
  const headroom = Math.max(
    0,
    visible - input.fieldHeight - (input.gap ?? KEYBOARD_GAP),
  );
  return Math.max(0, input.fieldY - headroom);
}

type FieldRegistrar = {
  /** Bring a field into the visible band. */
  reveal: (node: View | null) => void;
};

const FieldContext = createContext<FieldRegistrar | null>(null);

/** What a `TextField` needs from the scroll view above it. Null when standalone. */
export function useFieldRegistrar(): FieldRegistrar | null {
  return useContext(FieldContext);
}

export type KeyboardScrollViewProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Tapping a non-input row dismisses the keyboard. */
  keyboardDismissMode?: "on-drag" | "interactive" | "none";
  keyboardShouldPersistTaps?: boolean | "always" | "never" | "handled";
  showsVerticalScrollIndicator?: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
  testID?: string;
};

export function KeyboardScrollView({
  children,
  contentContainerStyle,
  style,
  keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
  keyboardShouldPersistTaps = "handled",
  showsVerticalScrollIndicator = false,
  onScroll,
  scrollEventThrottle,
  testID,
}: KeyboardScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);

  const restingHeight = useRef(0);
  const viewportHeight = useRef(0);
  const keyboardHeight = useRef(0);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [overlap, setOverlap] = useState(0);

  /** Recompute from whatever the three measurements currently say. */
  const recompute = useCallback(() => {
    setOverlap(
      keyboardOverlapFor({
        restingHeight: restingHeight.current,
        viewportHeight: viewportHeight.current,
        keyboardHeight: keyboardHeight.current,
      }),
    );
  }, []);

  useEffect(() => {
    // `did*` on Android, `will*` on iOS: on Android the resize and the event are
    // the same frame, so a `will` handler would read a viewport that has not
    // changed yet. On iOS the resize never happens, so the event is all there is.
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (event) => {
      keyboardHeight.current = event.endCoordinates.height;
      setKeyboardUp(true);
      // On Android the layout pass that shrinks the view lands in this same
      // frame, so re-read the viewport after it rather than during the event.
      requestAnimationFrame(recompute);
    });

    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardHeight.current = 0;
      setKeyboardUp(false);
      setOverlap(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [recompute]);

  const registrar = useMemo<FieldRegistrar>(
    () => ({
      reveal: (node) => {
        const scroller = scrollRef.current;
        const content = contentRef.current;
        if (!node || !scroller || !content) {
          return;
        }
        // Measured, never assumed: where the field sits inside the scroll content
        // is the only thing that survives a long form, a wrapped label, or a
        // keyboard of an unexpected height.
        node.measureLayout(content, (_x, y, _width, height) => {
          const target = revealTargetY({
            fieldY: y,
            fieldHeight: height,
            viewportHeight: viewportHeight.current,
            overlap,
          });
          // A field already in view yields a target of zero; scrolling anyway
          // would yank the form out from under a thumb that is still on it.
          if (target > 0) {
            scroller.scrollTo({ y: target, animated: true });
          }
        });
      },
    }),
    [overlap],
  );

  return (
    <FieldContext.Provider value={registrar}>
      <ScrollView
        ref={scrollRef}
        testID={testID}
        style={[styles.root, style]}
        contentContainerStyle={contentContainerStyle}
        keyboardDismissMode={keyboardDismissMode}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle}
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          viewportHeight.current = height;
          if (!keyboardUp) {
            // Only a keyboard-free layout is the baseline; measuring the resting
            // height while the keyboard is up would make the delta meaningless.
            restingHeight.current = height;
          }
          recompute();
        }}
      >
        <View
          ref={contentRef}
          // Reserves whatever is still covered, so the last field in a form can
          // always be scrolled clear of the keyboard.
          style={overlap > 0 ? { paddingBottom: overlap } : undefined}
        >
          {children}
        </View>
      </ScrollView>
    </FieldContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    // The scroll view is a direct child of `Screen`'s content view, which is
    // `flex: 1`. Without this it would size to its content and push the form past
    // the bottom of the window — the very thing it exists to prevent.
    flex: 1,
  },
});
