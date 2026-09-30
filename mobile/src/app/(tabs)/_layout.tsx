import { StyleSheet, View } from "react-native";

import AppTabs from "@/components/app-tabs";
import { GlassBlurTarget } from "@/components/ui/glass/BlurTarget";
import { useSyncLifecycle } from "@/hooks/use-sync";

export default function TabsLayout() {
  useSyncLifecycle();
  return (
    <View style={{ flex: 1 }}>
      {/* The dock is the one thing here that floats over a scrolling list, so it
          is the case where the blur actually earns its keep: it frosts the list
          as it passes underneath. Screens nested inside provide their own inner
          target, which their panels prefer. */}
      <GlassBlurTarget
        style={StyleSheet.absoluteFill}
        background={<AppTabs />}
      />
    </View>
  );
}
