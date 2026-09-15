import { StyleSheet, View } from "react-native";

import AppTabs from "@/components/app-tabs";
import { MiniPlayer } from "@/components/ui/glass/MiniPlayer";
import { GlassBlurTarget } from "@/components/ui/glass/BlurTarget";
import { useSyncLifecycle } from "@/hooks/use-sync";

export default function TabsLayout() {
  useSyncLifecycle();
  return (
    <View style={{ flex: 1 }}>
      {/* The mini-player floats outside every `Screen`, so it needs a target of
          its own — this is the case where the blur actually earns its keep,
          frosting the list as it scrolls underneath the bar. Screens nested
          inside provide their own inner target, which panels prefer. */}
      <GlassBlurTarget style={StyleSheet.absoluteFill} background={<AppTabs />}>
        <MiniPlayer />
      </GlassBlurTarget>
    </View>
  );
}
