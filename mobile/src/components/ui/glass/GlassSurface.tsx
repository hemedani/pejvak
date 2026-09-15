/**
 * The frosted panel every surface in the app is built from.
 *
 * Three layers make the glass read as glass rather than as a grey box:
 *
 *   1. A real blur of whatever is behind it — the native liquid-glass view on
 *      iOS 26+, `expo-blur` everywhere else (with the Android blur method
 *      enabled so it is a genuine blur, not a flat translucent rectangle).
 *   2. A translucent fill on top of the blur, which is what gives the panel its
 *      colour and keeps text legible over busy artwork.
 *   3. A specular top edge plus a hairline border, which is what makes it look
 *      like a physical pane catching the light.
 *
 * The chrome is an absolutely-positioned, clipped inner layer so the outer view
 * can still cast a shadow on iOS — a view cannot both clip and cast.
 *
 * Use `flat` for surfaces inside long lists: it drops the blur (the expensive
 * part) and keeps the fill, border and sheen, so a 300-row library does not
 * stand up 300 blur views.
 *
 * On Android the blur only runs when the panel sits inside a `GlassBlurTarget`
 * (see `./BlurTarget`) — the platform needs an explicit view to blur, and
 * `expo-blur` refuses to guess. Screens provide one around their background
 * layer; a panel outside any target falls back to fill + sheen, which is the
 * same as Android's own no-target fallback minus the warning.
 */

import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

import { useScheme } from "@/hooks/use-theme";
import { blur as blurTokens, colors, elevation, hairline } from "@/theme/tokens";

import { useBlurTarget } from "./BlurTarget";
import { GlassRadius, type GlassTone } from "./tokens";

export type GlassSurfaceProps = ViewProps & {
  tone?: GlassTone;
  radius?: keyof typeof GlassRadius | number;
  /** Blur strength (1–100). Defaults per tone. Ignored when `flat`. */
  intensity?: number;
  /** Cast a panel shadow. Ignored on the liquid-glass path, which has its own. */
  elevated?: boolean;
  /** Clip children to the corner radius. */
  clip?: boolean;
  /** Skip the blur. Cheaper; intended for list rows. */
  flat?: boolean;
};

/**
 * `isLiquidGlassAvailable` reaches for a native module, which is absent in
 * Expo Go and in any build that has not picked up the plugin. Treat a missing
 * module as "not available" rather than letting it throw during render.
 */
function liquidGlassAvailable(): boolean {
  if (Platform.OS !== "ios") {
    return false;
  }
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

export function GlassSurface({
  children,
  style,
  tone = "surface",
  radius = "card",
  intensity,
  elevated = true,
  clip = false,
  flat = false,
  ...rest
}: GlassSurfaceProps) {
  const scheme = useScheme();
  const palette = colors[scheme];
  const borderRadius = typeof radius === "number" ? radius : GlassRadius[radius];
  const blurAmount = intensity ?? (tone === "surfaceStrong" ? blurTokens.regular : blurTokens.thin);
  const fill = tone === "surfaceStrong" ? palette.glassStrong : palette.glass;
  const liquidGlass = !flat && liquidGlassAvailable();
  const blurTarget = useBlurTarget();

  // iOS blurs whatever is behind the view, so it needs no target. Android has
  // no implicit background blur: `expo-blur` requires a BlurTargetView ref and
  // otherwise degrades to `blurMethod: "none"` while warning on every render.
  // Skipping the view entirely is the same visual result without the noise.
  const blurActive = !flat && (Platform.OS !== "android" || blurTarget !== null);

  const shell: StyleProp<ViewStyle> = [
    { borderRadius, borderWidth: hairline, borderColor: palette.glassBorder },
    elevated && !liquidGlass ? { ...elevation.panel, shadowColor: palette.shadow } : null,
    clip ? styles.clip : null,
    style,
  ];

  if (liquidGlass) {
    return (
      <GlassView
        glassEffectStyle={tone === "surfaceStrong" ? "regular" : "clear"}
        colorScheme={scheme}
        style={shell}
        {...rest}>
        {children}
      </GlassView>
    );
  }

  return (
    <View style={shell} {...rest}>
      {/* Clipped chrome: blur → fill → specular edge. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.clip, { borderRadius }]}>
        {blurActive ? (
          <BlurView
            intensity={blurAmount}
            tint={scheme === "dark" ? "dark" : "light"}
            blurMethod="dimezisBlurViewSdk31Plus"
            blurTarget={blurTarget ?? undefined}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        <LinearGradient
          colors={[palette.glassHighlight, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.35, y: 1 }}
          style={styles.sheen}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.7,
  },
});
