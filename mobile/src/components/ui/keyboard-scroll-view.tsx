/**
 * Keyboard avoidance for scrollable screens.
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
 * `View`. And it is not the right tool anyway — these components *are* the
 * avoidance, so the two must not both be in the tree or the keyboard gets
 * counted twice.
 *
 * ## How the overlap is found
 *
 * The keyboard covers the bottom of the window. The viewport may already have
 * lost some of that height when the window resized (`adjustResize` on older
 * Android), so the overlap is whatever the keyboard takes *beyond* the shrink:
 *
 *   `overlap = max(0, keyboardHeight − (restingHeight − viewportHeight))`
 *
 * Android 15+ is edge-to-edge and **no longer shrinks the window** for the
 * keyboard (Expo SDK 53+ enables edge-to-edge; `adjustResize` still sits in the
 * manifest but the resize it relied on is gone). There the overlap is the
 * keyboard's own height and the space has to be supplied by us. iOS behaves the
 * same way. Only a genuinely resized viewport makes the overlap zero, where
 * adding the keyboard height again would leave a keyboard-tall gap.
 *
 * `revealTargetY` then scrolls inside `viewportHeight − overlap`, the band the
 * user can actually see.
 *
 * The focused field is remembered and re-revealed when the keyboard finishes
 * appearing and when the viewport finishes resizing. It is revealed *again*
 * after `overlap` is committed, because on edge-to-edge Android the content is
 * shorter than the full-height viewport until the keyboard padding is laid out:
 * scrolling before that render is clamped to zero, and the field stays behind
 * the keyboard. Focus fires before the keyboard reports its height, so measuring
 * only once would use a band that is still the full viewport.
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
  FlatList,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type FlatListProps,
  type LayoutChangeEvent,
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
 * is it now. The window shrinking and the keyboard rising can describe the same
 * pixels, so only the part the keyboard takes beyond the shrink still needs
 * reserving.
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
  const shrunk = Math.max(0, resting - viewport);
  return Math.max(0, Math.min(viewport, keyboard - shrunk));
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

/** What a `TextField` needs from the scrollable above it. Null when standalone. */
export function useFieldRegistrar(): FieldRegistrar | null {
  return useContext(FieldContext);
}

type RevealBand = { viewportHeight: number; overlap: number };

type RevealHandler = (node: View, band: RevealBand) => void;

export function useKeyboardReveal(onReveal: RevealHandler) {
  const restingHeight = useRef(0);
  const viewportHeight = useRef(0);
  const keyboardHeight = useRef(0);
  const keyboardUp = useRef(false);
  const focused = useRef<View | null>(null);
  const [overlap, setOverlap] = useState(0);

  const onRevealRef = useRef(onReveal);
  useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);

  const revealFocused = useCallback(() => {
    const node = focused.current;
    if (!node) {
      return;
    }
    onRevealRef.current(node, {
      viewportHeight: viewportHeight.current,
      overlap: keyboardOverlapFor({
        restingHeight: restingHeight.current,
        viewportHeight: viewportHeight.current,
        keyboardHeight: keyboardHeight.current,
      }),
    });
  }, []);

  const registrar = useMemo<FieldRegistrar>(
    () => ({
      reveal: (node) => {
        focused.current = node;
        if (node) {
          revealFocused();
        }
      },
    }),
    [revealFocused],
  );

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
      keyboardUp.current = true;
      // Let the layout that shrinks the viewport land before measuring again.
      requestAnimationFrame(() => {
        setOverlap(
          keyboardOverlapFor({
            restingHeight: restingHeight.current,
            viewportHeight: viewportHeight.current,
            keyboardHeight: keyboardHeight.current,
          }),
        );
        revealFocused();
      });
    });

    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardHeight.current = 0;
      keyboardUp.current = false;
      focused.current = null;
      setOverlap(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [revealFocused]);

  // The keyboard padding is applied by a render, and only then does the content
  // grow enough to scroll on edge-to-edge Android (where the window keeps its
  // full height). Revealing in the same frame as `setOverlap` would measure
  // against an unscrollable content view and clamp the target to zero. Wait for
  // the committed padding, then give the native layout one frame to settle.
  useEffect(() => {
    if (!keyboardUp.current) {
      return;
    }
    const frame = requestAnimationFrame(revealFocused);
    return () => cancelAnimationFrame(frame);
  }, [overlap, revealFocused]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      viewportHeight.current = height;
      // The keyboard only ever takes height away, so the tallest layout seen is
      // the resting viewport. Keeping a maximum also survives the Android race
      // where the resize can land before `keyboardDidShow`.
      restingHeight.current = Math.max(restingHeight.current, height);
      setOverlap(
        keyboardOverlapFor({
          restingHeight: restingHeight.current,
          viewportHeight: viewportHeight.current,
          keyboardHeight: keyboardHeight.current,
        }),
      );
      if (keyboardUp.current) {
        requestAnimationFrame(revealFocused);
      }
    },
    [revealFocused],
  );

  return { registrar, overlap, handleLayout };
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

  const reveal = useCallback<RevealHandler>((node, band) => {
    const scroller = scrollRef.current;
    const viewport = scroller?.getNativeScrollRef();
    if (!scroller || !viewport) {
      return;
    }
    // Measured, never assumed: where the field sits inside the scroll content
    // is the only thing that survives a long form, a wrapped label, or a
    // keyboard of an unexpected height. `measureLayout` reports content
    // coordinates, so the current scroll offset does not move the answer.
    node.measureLayout(viewport, (_x, y, _width, height) => {
      const target = revealTargetY({
        fieldY: y,
        fieldHeight: height,
        viewportHeight: band.viewportHeight,
        overlap: band.overlap,
      });
      // A field already in view yields a target of zero; scrolling anyway
      // would yank the form out from under a thumb that is still on it.
      if (target > 0) {
        scroller.scrollTo({ y: target, animated: true });
      }
    });
  }, []);

  const { registrar, overlap, handleLayout } =
    useKeyboardReveal(reveal);

  const contentStyle = withKeyboardPadding(contentContainerStyle, overlap);

  return (
    <FieldContext.Provider value={registrar}>
      <ScrollView
        ref={scrollRef}
        testID={testID}
        style={[styles.root, style]}
        contentContainerStyle={contentStyle}
        keyboardDismissMode={keyboardDismissMode}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle}
        onLayout={handleLayout}
      >
        {children}
      </ScrollView>
    </FieldContext.Provider>
  );
}

/**
 * Reserves whatever the keyboard still covers, so the last field (and the
 * controls under it) can always be scrolled clear.
 *
 * Merged into the caller's own content style rather than wrapped in a child
 * `View`: a wrapper would swallow `gap` and `justifyContent`, which is what the
 * auth screens and the player rely on.
 */
function withKeyboardPadding(
  style: StyleProp<ViewStyle>,
  overlap: number,
): StyleProp<ViewStyle> {
  if (overlap <= 0) {
    return style;
  }
  const padding = StyleSheet.flatten(style)?.paddingBottom;
  return [
    style,
    {
      paddingBottom:
        (typeof padding === "number" ? padding : 0) + overlap,
    },
  ];
}

export type KeyboardAwareFlatListProps<ItemT> = FlatListProps<ItemT>;

/**
 * A `FlatList` that gets a focused field out from under the keyboard.
 *
 * `KeyboardScrollView` cannot wrap a `FlatList` without nesting two scrollables,
 * so this carries the same registrar and measures the field against the list's
 * own viewport. `measureLayout` reports content coordinates, which is also what
 * `scrollToOffset` expects.
 */
export function KeyboardAwareFlatList<ItemT>({
  contentContainerStyle,
  ...rest
}: KeyboardAwareFlatListProps<ItemT>) {
  const listRef = useRef<FlatList<ItemT>>(null);
  const containerRef = useRef<View>(null);

  const reveal = useCallback<RevealHandler>((node, band) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    node.measureLayout(container, (_x, y, _width, height) => {
      const target = revealTargetY({
        fieldY: y,
        fieldHeight: height,
        viewportHeight: band.viewportHeight,
        overlap: band.overlap,
      });
      if (target > 0) {
        listRef.current?.scrollToOffset({ offset: target, animated: true });
      }
    });
  }, []);

  const { registrar, overlap, handleLayout } =
    useKeyboardReveal(reveal);

  const contentStyle = withKeyboardPadding(contentContainerStyle, overlap);

  return (
    <View
      ref={containerRef}
      collapsable={false}
      style={styles.fill}
      onLayout={handleLayout}
    >
      <FieldContext.Provider value={registrar}>
        <FlatList
          ref={listRef}
          style={styles.fill}
          contentContainerStyle={contentStyle}
          {...rest}
        />
      </FieldContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    // The scroll view is a direct child of `Screen`'s content view, which is
    // `flex: 1`. Without this it would size to its content and push the form past
    // the bottom of the window — the very thing it exists to prevent.
    flex: 1,
  },
  fill: {
    flex: 1,
  },
});
