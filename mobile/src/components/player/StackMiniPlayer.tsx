/**
 * The now-playing bar on a pushed screen.
 *
 * The tab layout's `AppDock` carries the navigation and the player as one panel.
 * A pushed screen has no navigation, so it shows only the player half — the same
 * `DockPlayer`, on the same frosted surface, at the same bottom margin. Keeping
 * one implementation means a control added to the dock's row appears here too.
 *
 * It is rendered once, by the root layout, rather than by every screen: screens
 * stay mounted under the one that was pushed, and a per-screen bar would mount
 * several copies whose geometry writes would fight over the sheet's anchor.
 */

import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DockPlayer } from "@/components/player/DockPlayer";
import { GlassSurface } from "@/components/ui/glass";
import { useTheme } from "@/hooks/use-theme";
import { usePlayerStore } from "@/store/playerStore";
import { elevation, layout, radius as radii } from "@/theme/tokens";

export function StackMiniPlayer() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const trackId = usePlayerStore((state) => state.trackId);
  const status = usePlayerStore((state) => state.status);
  const playing = Boolean(trackId) && status !== "idle";

  if (!playing) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: insets.bottom + layout.dock.margin }]}>
      <GlassSurface
        tone="surfaceStrong"
        radius={radii.card}
        clip
        elevated={false}
        style={[styles.panel, { shadowColor: theme.shadow, ...elevation.dock }]}>
        <DockPlayer key={trackId} />
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: layout.dock.inset,
  },
  panel: {
    flexDirection: "column",
    justifyContent: "center",
  },
});
