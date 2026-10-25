import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  Keyboard,
  Platform,
  type KeyboardEvent,
  type KeyboardEventName,
  type LayoutChangeEvent,
  type View,
} from "react-native";

import {
  keyboardOverlapFor,
  revealTargetY,
  useKeyboardReveal,
} from "@/components/ui/keyboard-scroll-view";

describe("keyboardOverlapFor", () => {
  it("does not reserve space the window resize already took", () => {
    // Android with `adjustResize`: the viewport is already 300 shorter, so the
    // keyboard is fully accounted for and reserving it again would open a gap.
    expect(
      keyboardOverlapFor({
        restingHeight: 800,
        viewportHeight: 500,
        keyboardHeight: 300,
      }),
    ).toBe(0);
  });

  it("reserves only the part the resize did not cover", () => {
    // The viewport lost 200 of the keyboard's 300, so 100 is still covered.
    expect(
      keyboardOverlapFor({
        restingHeight: 800,
        viewportHeight: 600,
        keyboardHeight: 300,
      }),
    ).toBe(100);
  });

  it("uses the keyboard's own height when nothing resized", () => {
    // iOS: the viewport is untouched, so the space has to be supplied by us.
    expect(
      keyboardOverlapFor({
        restingHeight: 800,
        viewportHeight: 800,
        keyboardHeight: 300,
      }),
    ).toBe(300);
  });

  it("does not double-count a shrink larger than the keyboard", () => {
    // A rotation or a font-scale change between the two measurements must not
    // be read as an enormous keyboard.
    expect(
      keyboardOverlapFor({
        restingHeight: 900,
        viewportHeight: 200,
        keyboardHeight: 300,
      }),
    ).toBe(0);
  });

  it("falls back to the keyboard height before anything has been measured", () => {
    expect(
      keyboardOverlapFor({
        restingHeight: 0,
        viewportHeight: 0,
        keyboardHeight: 280,
      }),
    ).toBe(280);
  });

  it("is zero when no keyboard is up", () => {
    expect(
      keyboardOverlapFor({
        restingHeight: 800,
        viewportHeight: 800,
        keyboardHeight: 0,
      }),
    ).toBe(0);
  });

  it("clamps nonsense input to zero rather than a negative overlap", () => {
    expect(
      keyboardOverlapFor({
        restingHeight: 0,
        viewportHeight: 500,
        keyboardHeight: 0,
      }),
    ).toBe(0);
  });
});

describe("revealTargetY", () => {
  const KEYBOARD_GAP = 24;

  it("leaves a field that is already visible exactly where it is", () => {
    // Scrolling a visible form out from under a thumb that is still on it is its
    // own bug, so the target must clamp to zero rather than chase the field.
    expect(
      revealTargetY({
        fieldY: 100,
        fieldHeight: 54,
        viewportHeight: 800,
        overlap: 0,
      }),
    ).toBe(0);
  });

  it("brings a field below the fold up to the top of the visible band", () => {
    const target = revealTargetY({
      fieldY: 900,
      fieldHeight: 54,
      viewportHeight: 800,
      overlap: 0,
    });
    // After scrolling, the field's top sits one gap below the band's top edge.
    expect(900 - target).toBe(800 - 54 - KEYBOARD_GAP);
  });

  it("uses the band the keyboard left, not the whole viewport", () => {
    // A 400pt viewport with 300pt of it covered leaves 100pt usable, so a 54pt
    // field is pinned to the top of that band rather than of the viewport.
    const target = revealTargetY({
      fieldY: 500,
      fieldHeight: 54,
      viewportHeight: 400,
      overlap: 300,
    });
    expect(500 - target).toBe(100 - 54 - KEYBOARD_GAP);
  });

  it("scrolls to a field's top when it cannot fit above the keyboard at all", () => {
    // The band is 50pt and the field is 200pt: no scroll reveals all of it, so
    // the best available answer is to put the field's top where it can be read —
    // the label and the first line. Scrolling less would leave it unseen.
    const target = revealTargetY({
      fieldY: 300,
      fieldHeight: 200,
      viewportHeight: 200,
      overlap: 150,
    });
    expect(target).toBe(300);
  });

  it("honours a caller-supplied gap", () => {
    const target = revealTargetY({
      fieldY: 500,
      fieldHeight: 50,
      viewportHeight: 400,
      overlap: 0,
      gap: 0,
    });
    expect(500 - target).toBe(400 - 50);
  });
});

describe("useKeyboardReveal", () => {
  type Band = { viewportHeight: number; overlap: number };
  const listeners: Partial<
    Record<KeyboardEventName, (event: KeyboardEvent) => void>
  > = {};

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("re-reveals the focused field after the keyboard padding is committed", async () => {
    const onReveal = jest.fn<void, [View, Band]>();
    jest.spyOn(Keyboard, "addListener").mockImplementation((event, listener) => {
      listeners[event] = listener;
      return { remove: jest.fn() } as unknown as ReturnType<
        typeof Keyboard.addListener
      >;
    });

    const { result } = await renderHook(() => useKeyboardReveal(onReveal));

    await act(() => {
      result.current.handleLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } },
      } as LayoutChangeEvent);
    });
    await act(() => {
      result.current.registrar.reveal({} as View);
    });

    expect(onReveal).toHaveBeenCalledTimes(1);

    const show =
      listeners[Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"];
    expect(show).toBeDefined();
    await act(() => {
      show?.({
        duration: 0,
        easing: "keyboard",
        endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 },
      });
    });

    // The focus reveal and the keyboard-show reveal both run before the
    // `overlap` render. The third is the regression: on edge-to-edge Android the
    // content only becomes scrollable after that render, so the early scroll was
    // clamped to zero and had to be retried.
    await waitFor(() => expect(onReveal).toHaveBeenCalledTimes(3));
    expect(onReveal.mock.calls[2][1]).toEqual({
      viewportHeight: 800,
      overlap: 300,
    });
  });
});
