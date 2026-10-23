/**
 * An icon that cross-fades when its semantic name changes.
 *
 * Play/pause is the case this exists for: a hard glyph swap on a 38pt button is
 * the most visible one-frame change in the app. The outgoing glyph stays mounted
 * underneath for one short beat while the incoming one fades and settles, so the
 * control reads as a state change rather than a cut.
 *
 * A name that never changes costs nothing: `previous` stays null and the single
 * layer renders at rest.
 */

import { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Icon, type IconName } from "@/components/ui/icon";
import { curve, duration, easing, useMotionEnabled } from "@/theme/motion";

export type SwapIconProps = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

type Layers = {
  current: IconName;
  previous: IconName | null;
};

/** How far the outgoing glyph shrinks as it leaves. */
const EXIT_SCALE = 0.92;

export function SwapIcon({ name, size = 20, color, style }: SwapIconProps) {
  const motionEnabled = useMotionEnabled();
  const [layers, setLayers] = useState<Layers>({ current: name, previous: null });
  const progress = useSharedValue(1);

  // Adjust state during render rather than in an effect: the outgoing glyph has
  // to be on screen for the same commit that renders the incoming one, or there
  // is a frame with only the new icon at full opacity.
  if (layers.current !== name) {
    setLayers({
      current: name,
      previous: motionEnabled ? layers.current : null,
    });
  }

  const previous = layers.previous;

  useEffect(() => {
    if (previous === null) {
      return;
    }

    progress.value = 0;
    progress.value = withTiming(1, curve(easing.outQuint, duration.toggle));

    const timer = setTimeout(() => {
      setLayers((state) => ({ current: state.current, previous: null }));
    }, duration.toggle + 40);
    return () => clearTimeout(timer);
  }, [previous, progress]);

  const outgoingStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: 1 - (1 - EXIT_SCALE) * progress.value }],
  }));

  const incomingStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: EXIT_SCALE + (1 - EXIT_SCALE) * progress.value }],
  }));

  return (
    <View
      pointerEvents="none"
      style={[styles.root, { width: size, height: size }, style]}>
      {layers.previous !== null ? (
        <Animated.View style={[styles.layer, outgoingStyle]}>
          <Icon name={layers.previous} size={size} color={color} />
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.layer, incomingStyle]}>
        <Icon name={layers.current} size={size} color={color} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  layer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
