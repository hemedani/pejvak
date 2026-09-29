/**
 * The tab navigator.
 *
 * Registers the destinations from `TABS` and hands the drawing to `AppTabBar`,
 * so the route list and the bar's layout are the same array and cannot drift.
 *
 * The screens keep the full height of the window and the bar floats over them:
 * each screen reserves its own bottom space from `layout.tabBarInset`. That is
 * what lets a list scroll *under* the bar rather than stopping short of it,
 * which is the whole point of a floating bar — and why `tabBarStyle` reports a
 * zero height, so nothing below tries to reserve space for a bar that is not in
 * the layout flow.
 */

import { Tabs } from "expo-router/tabs";

import { AppTabBar, TABS } from "@/components/app-tab-bar";

export default function AppTabs() {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { height: 0 },
        sceneStyle: { backgroundColor: "transparent" },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
