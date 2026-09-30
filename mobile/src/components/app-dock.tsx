/**
 * The floating dock: the now-playing row and the navigation, as one panel.
 *
 * ## Why one panel
 *
 * These were two absolutely-positioned surfaces, and being two meant their
 * geometry was a negotiation. The bar's centre button overhung the bar's own top
 * edge by 22pt; the now-playing row sat a fixed 80pt above the screen bottom.
 * The button reached up to 112pt and the row's bottom edge sat at 80pt, so **32pt
 * of the raised button was underneath the now-playing row** whenever something
 * was playing.
 *
 * The clearance token claimed to prevent exactly that — it documented itself as
 * "mirrors the bar's own geometry so the two can never overlap" — but it mirrored
 * the bar's *height* and none of its overhang. A comment asserting a guarantee
 * the number did not provide is worse than no comment, because the next person
 * trusts it.
 *
 * Inside a single panel the question cannot be asked. There is no clearance to
 * get wrong, one surface carries one shadow, and the stack reads as a single
 * deliberate object rather than two panels fighting over 32pt.
 *
 * ## Why the row has no labels
 *
 * Five destinations in a dock's width is the case Material treats specifically:
 * *three* destinations get an icon and a label each, *five* get icons, with a
 * label on the selected one if space permits. Forcing five labelled slots made
 * every glyph carry a second element, which is what pushed the row to 82pt and
 * left it looking heavy.
 *
 * Icon-only also removes a whole class of bug. The row was sized for an icon
 * block *and* a label and came up 10pt short, clipping the centre button 5pt off
 * the top and 5pt off the bottom. A slot now holds exactly one thing, so there
 * is no sum that can overflow — see `components/ui/__tests__/dockGeometry.test.ts`.
 *
 * ## Why there is no raised centre button
 *
 * Discover used to be a 50pt saturated gradient circle sitting among 22pt
 * glyphs — a 2.3:1 ratio, and the single most template-looking element in the
 * app. Material specifies no such thing for a five-item bar. All five are peers
 * now, told apart by one filled-vs-outlined glyph swap and one accent pill on the
 * selected item.
 *
 * There is no motion beyond the press itself. A tab switch is something the
 * listener does hundreds of times a day, and the motion rules are unambiguous
 * about that: the platform default and nothing else.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { DockPlayer } from "@/components/player/DockPlayer";
import { GlassSurface } from "@/components/ui/glass";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { usePlayerStore } from "@/store/playerStore";
import {
  elevation,
  hairline,
  layout,
  radius as radii,
  spacing,
} from "@/theme/tokens";

/** One destination, as the dock draws it. */
export type TabDefinition = {
  /** The route's file name inside `(tabs)`. */
  name: string;
  label: string;
  /** Outlined glyph — the resting state. */
  icon: IconName;
  /** The same glyph, filled in — the selected state. */
  iconActive: IconName;
};

/**
 * The dock's destinations, in order.
 *
 * Declared here rather than in the layout so the route list and the drawing code
 * cannot drift: `app-tabs.tsx` maps over this array to register routes, and the
 * dock maps over the same array to lay them out.
 */
export const TABS: readonly TabDefinition[] = [
  {
    name: "index",
    label: "Library",
    icon: "library",
    iconActive: "libraryFilled",
  },
  {
    name: "history",
    label: "History",
    icon: "history",
    iconActive: "historyFilled",
  },
  {
    name: "discover",
    label: "Discover",
    icon: "compassOutline",
    iconActive: "compass",
  },
  { name: "stats", label: "Stats", icon: "stats", iconActive: "statsFilled" },
  {
    name: "playlists",
    label: "Playlists",
    icon: "playlists",
    iconActive: "playlistsFilled",
  },
];

export function AppDock({ state, navigation, insets }: BottomTabBarProps) {
  const theme = useTheme();

  // One source of truth for "is the player half showing", so the panel's height
  // and its content can never disagree about it.
  const trackId = usePlayerStore((s) => s.trackId);
  const status = usePlayerStore((s) => s.status);
  const playing = Boolean(trackId) && status !== "idle";

  const routeFor = useCallback(
    (name: string) => state.routes.find((route) => route.name === name),
    [state.routes],
  );

  const onPress = useCallback(
    (routeName: string, routeKey: string, isFocused: boolean) => {
      const event = navigation.emit({
        type: "tabPress",
        target: routeKey,
        canPreventDefault: true,
      });
      if (isFocused || event.defaultPrevented) {
        return;
      }
      navigation.navigate(routeName);
    },
    [navigation],
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: insets.bottom + layout.dock.margin }]}
    >
      <GlassSurface
        tone="surfaceStrong"
        radius={radii.card}
        clip
        // The dock brings its own shadow rather than taking `GlassSurface`'s
        // panel default. Leaving `elevated` on and overriding the numbers
        // afterwards is correct — `style` wins — but it makes the reader work out
        // which of the two elevations actually applies.
        elevated={false}
        style={[styles.panel, { shadowColor: theme.shadow, ...elevation.dock }]}
      >
        {playing ? <DockPlayer key={trackId ?? "player"} /> : null}

        {/* The seam between the two halves, inset so it reads as a division
            inside the panel rather than a line drawn across the screen. */}
        {playing ? (
          <View
            style={[styles.seam, { backgroundColor: theme.outlineVariant }]}
          />
        ) : null}

        <View style={styles.nav}>
          {TABS.map((tab) => {
            const route = routeFor(tab.name);
            if (!route) {
              return null;
            }
            const isFocused = state.index === state.routes.indexOf(route);
            return (
              <Destination
                key={tab.name}
                tab={tab}
                isFocused={isFocused}
                onPress={() => onPress(route.name, route.key, isFocused)}
              />
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

type DestinationProps = {
  tab: TabDefinition;
  isFocused: boolean;
  onPress: () => void;
};

/**
 * One destination.
 *
 * **Selected = a solid accent circle with the glyph knocked out of it.**
 *
 * This is the strongest signal available, and it is one the dock already had a
 * precedent for: the now-playing row's play button is a filled accent circle. So
 * the panel reads as one object with one rule — *a filled accent circle means
 * this is the current thing* — rather than as a place where one kind of item
 * behaves differently from the other four.
 *
 * The alternative was another tint, which is what it was: a 12%-alpha wash is
 * very little signal on a translucent surface, and the complaint that the active
 * state "was not good enough" was the accurate one.
 *
 * The circle also carries a lit top edge, so it reads as a sphere rather than a
 * flat disc. That is the same specular highlight `GlassSurface` puts on every
 * frosted panel, reused rather than reinvented.
 *
 * The filled-vs-outlined glyph swap is the second signal, and it still matters:
 * the pill says "here" up close, the swap says it again from across the room.
 */
function Destination({ tab, isFocused, onPress }: DestinationProps) {
  const theme = useTheme();

  return (
    <ElasticPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={tab.label}
      scaleTo={0.88}
      overshootTo={1.04}
      haptic="selection"
      onPress={onPress}
      style={styles.slot}
    >
      {isFocused ? (
        <View style={[styles.circle, { backgroundColor: theme.accent }]}>
          {/* A thin rim light at the top, exactly as `GlassSurface` puts on every
              frosted panel — not a wash. Spreading the highlight over the circle's
              upper half blows it out; a 3pt edge reads as a light source above
              it, and keeps the dock's material language consistent. */}
          <View style={styles.circleLight}>
            <LinearGradient
              colors={[theme.glassHighlight, "transparent"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.circleLightFill}
            />
          </View>
          <Icon
            name={tab.iconActive}
            size={layout.dock.iconActive}
            color={theme.onAccent}
          />
        </View>
      ) : (
        <Icon
          name={tab.icon}
          size={layout.dock.icon}
          color={theme.textTertiary}
        />
      )}
    </ElasticPressable>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.dock.inset,
  },
  panel: {
    flexDirection: "column",
    justifyContent: "center",
  },
  seam: {
    height: hairline,
    marginHorizontal: spacing.md,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    height: layout.dock.navHeight,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  circle: {
    width: layout.dock.indicator,
    height: layout.dock.indicator,
    borderRadius: layout.dock.indicator / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  /** The specular top edge. Same trick as the frosted panels, on a smaller scale. */
  circleLight: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    opacity: 0.55,
  },
  circleLightFill: {
    flex: 1,
  },
});
