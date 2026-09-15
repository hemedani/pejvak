/**
 * The collapsed now-playing bar.
 *
 * It does three things beyond showing the track:
 *
 *   1. Measures itself into `nowPlayingStore` so the full-screen sheet can grow
 *      out of exactly this rectangle.
 *   2. Answers a tap by opening the full player.
 *   3. Answers a drag upward with a small lift-and-scale preview, then commits to
 *      the full player once the drag passes a threshold or carries enough
 *      upward velocity — the same gesture grammar as the sheet's dismiss.
 */

import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { MiniPlayerRow } from "@/components/player/MiniPlayerRow";
import { paletteFor } from "@/lib/palette";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { useNowPlayingStore } from "@/store/nowPlayingStore";
import { usePlayerStore } from "@/store/playerStore";
import { spring } from "@/theme/motion";
import { layout, spacing } from "@/theme/tokens";

/** Clearance above the native tab bar. */
const TAB_BAR_CLEARANCE = 76;
/** Pixels of upward drag that map to a full "peek". */
const DRAG_RANGE = 140;

export function MiniPlayer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hostRef = useRef<View>(null);

  const status = usePlayerStore((state) => state.status);
  const trackId = usePlayerStore((state) => state.trackId);
  const title = usePlayerStore((state) => state.title);
  const artist = usePlayerStore((state) => state.artist);
  const artworkUrl = usePlayerStore((state) => state.artworkUrl);
  const contentHash = usePlayerStore((state) => state.contentHash);
  const positionSec = usePlayerStore((state) => state.positionSec);
  const durationSec = usePlayerStore((state) => state.durationSec);
  const skip = usePlayerStore((state) => state.skip);
  const expanded = usePlayerStore((state) => state.expanded);

  const setAnchor = useNowPlayingStore((state) => state.setAnchor);
  const drag = useSharedValue(0);

  const ramp = paletteFor(contentHash ?? title ?? trackId);
  const isPlaying = status === "playing";

  const measure = useCallback(() => {
    const node = hostRef.current;
    if (!node) {
      return;
    }
    // Wait a frame: `measureInWindow` during layout can report stale values.
    requestAnimationFrame(() => {
      node.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setAnchor({ x, y, width, height });
        }
      });
    });
  }, [setAnchor]);

  // Reset the peek once the sheet has closed, so the bar is at rest next time.
  useEffect(() => {
    if (!expanded) {
      drag.value = 0;
    }
  }, [drag, expanded]);

  const open = useCallback(() => {
    router.push({ pathname: "/player", params: trackId ? { trackId } : {} });
  }, [router, trackId]);

  const tap = Gesture.Tap().onEnd((_event, success) => {
    if (success) {
      scheduleOnRN(open);
    }
  });

  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onUpdate((event) => {
      drag.value = Math.min(1, Math.max(0, -event.translationY / DRAG_RANGE));
    })
    .onEnd((event) => {
      const commit = drag.value > 0.35 || event.velocityY < -700;
      if (commit) {
        drag.value = withSpring(1, spring.snappy);
        scheduleOnRN(open);
      } else {
        drag.value = withSpring(0, spring.snappy);
      }
    });

  const gesture = Gesture.Race(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -drag.value * 16 }, { scale: 1 + drag.value * 0.03 }],
  }));

  if (!trackId || status === "idle") {
    return null;
  }

  return (
    <Animated.View
      ref={hostRef}
      onLayout={measure}
      pointerEvents="box-none"
      style={[styles.host, { bottom: insets.bottom + TAB_BAR_CLEARANCE }, animatedStyle]}>
      <MiniPlayerRow
        title={title}
        artist={artist}
        artworkUrl={artworkUrl}
        ramp={ramp}
        positionSec={positionSec}
        durationSec={durationSec}
        isPlaying={isPlaying}
        skipNonce={skip?.nonce}
        skipDirection={skip?.direction}
        onToggle={() => TrackPlayerService.togglePlayPause()}
        renderMain={(content) => (
          <GestureDetector gesture={gesture}>
            <Animated.View
              accessibilityRole="button"
              accessibilityLabel={`Open now playing: ${title ?? "current track"}`}
              style={styles.main}>
              {content}
            </Animated.View>
          </GestureDetector>
        )}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: layout.floatInset,
    right: layout.floatInset,
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
});
