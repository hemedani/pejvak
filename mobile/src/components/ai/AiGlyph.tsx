/**
 * A tool's mark: a lit disc with the tool's glyph in it.
 *
 * This is the one piece of the AI page that carries a tool's identity, and it
 * appears at two very different sizes — 44pt inside a grid card, 104pt as the
 * hero of the tool's own screen. Same drawing at both, because a mark that
 * changes shape between the catalogue and the thing it catalogues is two marks.
 *
 * ## Why the disc is tinted rather than saturated
 *
 * The obvious version of this is a filled gradient orb with a white glyph in
 * it, which is the house style of every AI feature page right now. It does not
 * survive the app's own ramps: white on the amber stop measures under 2:1, and
 * the coral one is not much better. A *tinted* disc with the glyph in the tint
 * keeps the colour identity, keeps the glyph legible in both themes, and — with
 * a hairline ring in the same tint and elevation underneath — reads as lit
 * without needing a colour shadow. That also keeps the page calm enough to sit
 * inside a library app rather than beside one.
 *
 * The `shadow*` props are set anyway because this app is Android-only and they
 * cost nothing there; `elevation` is what actually lifts the disc.
 */

import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { useScheme } from "@/hooks/use-theme";
import { aiFeatureTint, type AiFeature } from "@/lib/aiFeatures";
import { withAlpha } from "@/lib/palette";
import { hairline } from "@/theme/tokens";

export type AiGlyphProps = {
  feature: AiFeature;
  /** Diameter. */
  size: number;
  /**
   * `card` is the quiet version, for a 2-up grid. `hero` throws a real glow and
   * a stronger fill, for the one screen that is entirely about this tool.
   */
  tone?: "card" | "hero";
};

export function AiGlyph({ feature, size, tone = "card" }: AiGlyphProps) {
  const scheme = useScheme();
  const tint = aiFeatureTint(feature, scheme);
  const hero = tone === "hero";
  const iconSize = Math.round(size * (hero ? 0.44 : 0.46));

  return (
    <View
      style={[
        styles.disc,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: withAlpha(tint, hero ? 0.4 : 0.26),
          shadowColor: tint,
          shadowOpacity: hero ? 0.55 : 0.28,
          shadowRadius: hero ? 26 : 12,
          shadowOffset: { width: 0, height: hero ? 10 : 4 },
          elevation: hero ? 10 : 3,
        },
      ]}>
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(tint, hero ? 0.26 : 0.16), withAlpha(tint, hero ? 0.1 : 0.05)]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Icon name={feature.icon} size={iconSize} color={tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: hairline,
    overflow: "hidden",
  },
});
