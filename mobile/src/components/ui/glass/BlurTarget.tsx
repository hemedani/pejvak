/**
 * The Android blur target.
 *
 * On iOS a `BlurView` blurs whatever is rendered behind it. Android has no such
 * capability: to blur a background you must render the content to be blurred
 * into a `BlurTargetView` and hand that view's ref to the `BlurView` through the
 * `blurTarget` prop.
 *
 * Without a target, `expo-blur` falls back to `blurMethod: "none"` and warns on
 * every render — so the glass would be a flat translucent rectangle on Android
 * rather than glass.
 *
 * The docs are explicit that one target should serve every `BlurView` that fits
 * inside its bounds, so a target is created once per area (around the background
 * layer) and shared down through context rather than per panel.
 *
 * The split between `background` and `children` matters:
 *
 *   · `background` is rendered *inside* the target view — the layer to blur.
 *   · `children` are rendered as siblings, inside the context provider.
 *
 * Panels have to be siblings rather than descendants, because a panel nested
 * inside the target would blur its own siblings. They still need to be inside
 * the provider, though, or the context would not reach them.
 */

import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import { BlurTargetView } from "expo-blur";
import type { StyleProp, View, ViewStyle } from "react-native";

type BlurTargetRef = RefObject<View | null>;

const BlurTargetContext = createContext<BlurTargetRef | null>(null);

export type GlassBlurTargetProps = {
  /** The layer glass panels should blur. Rendered inside the target view. */
  background: ReactNode;
  /** Panels that consume the target. Rendered as siblings of the target view. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Wrap the background layer and the panels that sit on top of it.
 *
 * The target view is `box-none`: it never swallows a touch itself, but its
 * children still receive theirs. That matters because in the tab layout the
 * target contains the whole navigator — a plain overlay there would make the
 * entire app untappable.
 */
export function GlassBlurTarget({ background, children, style }: GlassBlurTargetProps) {
  const ref = useRef<View | null>(null);

  return (
    <BlurTargetContext.Provider value={ref}>
      <BlurTargetView ref={ref} pointerEvents="box-none" style={style}>
        {background}
      </BlurTargetView>
      {children}
    </BlurTargetContext.Provider>
  );
}

/** The nearest blur target, or `null` when the panel is not over one. */
export function useBlurTarget(): BlurTargetRef | null {
  return useContext(BlurTargetContext);
}
