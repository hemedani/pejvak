/**
 * Ambient accent wash.
 *
 * Two soft radial glows tinted by the current track's palette, sitting behind a
 * screen's content. This is what stops the glass panels from reading as flat
 * grey: the blur always has colour underneath it.
 *
 * Deliberately motionless. The wash is scenery, not an animation: an endless
 * drift behind every screen is a continuous cost for a change the listener only
 * notices when it stops, and it made scrolling under the dock feel heavier.
 */

import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import { withAlpha } from "@/lib/palette";

export type AmbientWashProps = {
  /** Accent colour the glows are tinted with. */
  color: string;
  /** 0–1 multiplier on the glow alpha. */
  intensity?: number;
};

/** Midpoint of the old drift, kept so the static composition still breathes. */
const DRIFT = 0.5;

export function AmbientWash({ color, intensity = 1 }: AmbientWashProps) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.blob,
          styles.topLeft,
          {
            transform: [
              { translateX: -34 + DRIFT * 44 },
              { translateY: -26 + DRIFT * 52 },
              { scale: 1 + DRIFT * 0.09 },
            ],
          },
        ]}>
        <LinearGradient
          colors={[withAlpha(color, 0.34 * intensity), withAlpha(color, 0)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        />
      </View>
      <View
        style={[
          styles.blob,
          styles.bottomRight,
          {
            transform: [
              { translateX: 28 - DRIFT * 52 },
              { translateY: 38 - DRIFT * 62 },
              { scale: 1.06 - DRIFT * 0.07 },
            ],
          },
        ]}>
        <LinearGradient
          colors={[withAlpha(color, 0.26 * intensity), withAlpha(color, 0)]}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.fill}
        />
      </View>
    </View>
  );
}

const SIZE = 460;

const styles = StyleSheet.create({
  blob: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: "hidden",
  },
  topLeft: {
    top: -170,
    left: -150,
  },
  bottomRight: {
    bottom: -190,
    right: -160,
  },
  fill: {
    flex: 1,
  },
});
