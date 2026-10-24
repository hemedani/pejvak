/**
 * The tab navigator.
 *
 * Registers the destinations from `TABS`, which the dock lays out, so the route
 * list and the dock's order are the same array and cannot drift. The dock itself
 * is rendered by the layout as a *sibling* of the blur target — never as this
 * navigator's `tabBar`, because a panel inside the target would blur its own
 * siblings.
 *
 * The screens keep the full height of the window and the bar floats over them:
 * each screen reserves its own bottom space from `dockInset`. That is
 * what lets a list scroll *under* the bar rather than stopping short of it,
 * which is the whole point of a floating bar — and why `tabBarStyle` reports a
 * zero height, so nothing below tries to reserve space for a bar that is not in
 * the layout flow.
 */

import { Tabs } from "expo-router/tabs";

import { TABS } from "@/components/app-dock";

function NoTabBar() {
  return null;
}

export default function AppTabs() {
  return (
    <Tabs
      tabBar={NoTabBar}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { height: 0 },
        sceneStyle: { backgroundColor: "transparent" },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.label }}
        />
      ))}
    </Tabs>
  );
}
