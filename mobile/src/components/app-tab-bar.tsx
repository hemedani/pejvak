/**
 * The bottom bar.
 *
 * Replaces the platform's native tab bar with one the app draws, because the
 * native bar cannot express the thing this product needs: a raised, circular
 * destination in the middle. Discover is not a fifth peer of Library — it is the
 * app's way out to the world, and the bar says so.
 *
 * The geometry is a floating pill rather than an edge-to-edge strip. A bar that
 * touches the screen edges reads as chrome welded to the device; one that
 * floats, with the canvas visible beneath it, reads as a control — and it lets
 * the mini-player sit above it in the same visual family rather than stacking
 * two opaque strips.
 *
 * There is deliberately no motion here beyond the press itself. A tab switch is
 * something the listener does hundreds of times a day, and the motion rules are
 * unambiguous about that case: the platform default and nothing else. A sliding
 * indicator or a growing glyph would be animation at its most expensive —
 * constant, and noticed only when it stutters.
 *
 * Everything visual comes from the design tokens: one accent, the app's own
 * gradient, the shared radius scale, the shared press spring. Nothing here
 * invents a colour or a duration.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon, type IconName } from "@/components/ui/icon";
import { useScheme } from "@/hooks/use-theme";
import { accentGradient, colors, elevation, layout, spacing } from "@/theme/tokens";

/** One destination, as the bar draws it. */
export type TabDefinition = {
  /** The route's file name inside `(tabs)`. */
  name: string;
  label: string;
  icon: IconName;
  /** Shown instead of `icon` while the tab is active. */
  iconActive: IconName;
};

/**
 * The bar's destinations, in order.
 *
 * Declared here rather than in the layout so the trigger list and the drawing
 * code cannot drift: `app-tabs.tsx` maps over this array to register routes, and
 * the bar maps over the same array to lay them out.
 */
export const TABS: readonly TabDefinition[] = [
  { name: "index", label: "Library", icon: "library", iconActive: "library" },
  { name: "history", label: "History", icon: "history", iconActive: "history" },
  { name: "discover", label: "Discover", icon: "compassOutline", iconActive: "compass" },
  { name: "stats", label: "Stats", icon: "stats", iconActive: "stats" },
  { name: "playlists", label: "Playlists", icon: "playlists", iconActive: "playlists" },
];

/** The raised one. An index into `TABS`, so the two can never disagree. */
export const CENTER_TAB_INDEX = TABS.findIndex((tab) => tab.name === "discover");

export function AppTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const scheme = useScheme();
  const palette = colors[scheme];

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

  const centerTab = CENTER_TAB_INDEX >= 0 ? TABS[CENTER_TAB_INDEX] : null;
  const centerRoute = centerTab ? routeFor(centerTab.name) : undefined;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingBottom: insets.bottom + layout.tabBarMargin }]}>
      <GlassSurface
        tone="surfaceStrong"
        radius="pill"
        elevated
        style={[styles.bar, { shadowColor: palette.shadow }]}>
        <View style={styles.row}>
          {TABS.map((tab, index) => {
            const route = routeFor(tab.name);
            if (!route) {
              return null;
            }
            if (index === CENTER_TAB_INDEX) {
              // Space is reserved so the four outer tabs keep equal widths; the
              // button itself is drawn over the bar, not inside the row.
              return <View key={tab.name} style={styles.slot} />;
            }
            const isFocused = state.index === state.routes.indexOf(route);
            return (
              <TabItem
                key={tab.name}
                tab={tab}
                isFocused={isFocused}
                onPress={() => onPress(route.name, route.key, isFocused)}
              />
            );
          })}
        </View>
      </GlassSurface>

      {centerTab && centerRoute ? (
        <CenterAction
          tab={centerTab}
          isFocused={state.index === state.routes.indexOf(centerRoute)}
          onPress={() =>
            onPress(
              centerRoute.name,
              centerRoute.key,
              state.index === state.routes.indexOf(centerRoute),
            )
          }
        />
      ) : null}
    </View>
  );
}

type TabItemProps = {
  tab: TabDefinition;
  isFocused: boolean;
  onPress: () => void;
};

/** One of the four peer destinations. */
function TabItem({ tab, isFocused, onPress }: TabItemProps) {
  const palette = colors[useScheme()];

  return (
    <ElasticPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={tab.label}
      scaleTo={0.94}
      overshootTo={1.02}
      haptic="selection"
      onPress={onPress}
      style={styles.slot}>
      <Icon
        name={isFocused ? tab.iconActive : tab.icon}
        size={23}
        color={isFocused ? palette.accent : palette.textTertiary}
      />
      <ThemedText
        type="overline"
        numberOfLines={1}
        style={[styles.label, { color: isFocused ? palette.accent : palette.textTertiary }]}>
        {tab.label}
      </ThemedText>
    </ElasticPressable>
  );
}

type CenterActionProps = {
  tab: TabDefinition;
  isFocused: boolean;
  onPress: () => void;
};

/**
 * The raised circle.
 *
 * It overhangs the bar's top edge on purpose: the overhang is the whole reason
 * the control reads as the primary destination. The glyph sits on the app's
 * accent gradient with the glow elevation, so it is the one saturated thing on
 * the bar and the eye lands on it first.
 *
 * The active state deepens the fill rather than moving the button — a control
 * that hops when it is tapped is a control that looks broken the second time.
 */
function CenterAction({ tab, isFocused, onPress }: CenterActionProps) {
  const palette = colors[useScheme()];
  const gradient = accentGradient[useScheme()];

  return (
    <View pointerEvents="box-none" style={styles.centerWrap}>
      <ElasticPressable
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={tab.label}
        scaleTo={0.9}
        overshootTo={1.06}
        haptic="medium"
        onPress={onPress}
        style={styles.centerPressable}>
        <View
          style={[
            styles.centerShadow,
            { shadowColor: palette.shadow, opacity: isFocused ? 1 : 0.92 },
          ]}>
          <LinearGradient
            colors={[gradient[0], gradient[1]]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={[styles.centerCircle, { borderColor: palette.glassHighlight }]}>
            <Icon name={tab.iconActive} size={28} color={palette.onAccent} />
          </LinearGradient>
        </View>
      </ElasticPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.floatInset,
  },
  bar: {
    height: layout.tabBarHeight,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: layout.tabBarHeight,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    height: "100%",
  },
  label: {
    letterSpacing: 0.4,
  },
  centerWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    alignItems: "center",
  },
  centerPressable: {
    marginTop: -layout.tabBarRaise,
  },
  centerShadow: {
    borderRadius: layout.tabBarActionSize / 2,
    ...elevation.glow,
  },
  centerCircle: {
    width: layout.tabBarActionSize,
    height: layout.tabBarActionSize,
    borderRadius: layout.tabBarActionSize / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
