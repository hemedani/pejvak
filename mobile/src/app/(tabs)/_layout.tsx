import { usePathname, useRouter } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppDock } from "@/components/app-dock";
import AppTabs from "@/components/app-tabs";
import { GlassBlurTarget } from "@/components/ui/glass/BlurTarget";
import { useSyncLifecycle } from "@/hooks/use-sync";
import { tabHref, tabNameForPathname, type TabName } from "@/lib/tabNavigation";

export default function TabsLayout() {
  useSyncLifecycle();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const activeName = tabNameForPathname(pathname);
  const onSelect = useCallback(
    (name: TabName) => {
      router.navigate(tabHref(name));
    },
    [router],
  );

  return (
    <View style={styles.host}>
      {/* The dock is the one thing here that floats over a scrolling list, so it
          is the case where the blur actually earns its keep: it frosts the list
          as it passes underneath. It must be a sibling of the target, not a
          child — `GlassBlurTarget` renders `children` beside the background
          layer precisely so a panel cannot blur its own siblings. Screens
          nested inside provide their own inner target, which their panels
          prefer. */}
      <GlassBlurTarget style={StyleSheet.absoluteFill} background={<AppTabs />}>
        <AppDock activeName={activeName} insets={insets} onSelect={onSelect} />
      </GlassBlurTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
