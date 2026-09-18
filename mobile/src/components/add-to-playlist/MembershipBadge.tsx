/**
 * The membership badge: does this playlist hold what is being added?
 *
 * Three states, because a folder-sized selection can be *partly* in a playlist,
 * and a two-state checkbox would have to lie about it:
 *
 *   none  — an empty hairline ring.
 *   some  — accent ring, tinted fill, and a dash. "Some of it is in here."
 *   all   — solid accent disc with a tick. Tapping this is what removes.
 *
 * The disc springs in rather than appearing, so a tap has a visible result even
 * when the row's text does not change.
 */

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import type { Membership } from "@/lib/playlistPicker";
import { spring, useMotionEnabled } from "@/theme/motion";
import { hairline } from "@/theme/tokens";

const SIZE = 28;

export function MembershipBadge({ state }: { state: Membership }) {
  const theme = useTheme();
  const motionEnabled = useMotionEnabled();
  const filled = useSharedValue(state === "none" ? 0 : 1);

  useEffect(() => {
    const target = state === "none" ? 0 : 1;
    filled.value = motionEnabled ? withSpring(target, spring.bouncy) : target;
  }, [filled, motionEnabled, state]);

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.82 + filled.value * 0.18 }],
  }));

  if (state === "none") {
    return <View style={[styles.badge, { borderColor: theme.track }]} />;
  }

  const partial = state === "some";

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          backgroundColor: partial ? theme.accentSoft : theme.accent,
          borderColor: theme.accent,
        },
        popStyle,
      ]}>
      <Icon
        name={partial ? "minus" : "check"}
        size={partial ? 15 : 16}
        color={partial ? theme.accent : theme.onAccent}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: hairline,
    alignItems: "center",
    justifyContent: "center",
  },
});
