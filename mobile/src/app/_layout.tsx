import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AddToPlaylistSheet } from "@/components/add-to-playlist";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { duration } from "@/theme/motion";

SplashScreen.preventAutoHideAsync();

/**
 * Navigation graph.
 *
 * Deliberately shallow and predictable: tabs at the root, detail screens pushed
 * from the right with a single 420 ms ease-out slide, and the now-playing sheet
 * presented as a transparent modal that animates itself (so it can grow out of
 * the mini-player instead of sliding in from the screen edge).
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const status = useAuthStore((state) => state.status);
  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    void TrackPlayerService.recoverOrphanedSessions().catch(() => undefined);
  }, []);

  useEffect(() => {
    void useSettingsStore.getState().load();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        {status === "loading" ? null : (
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "slide_from_right",
              animationDuration: duration.screen,
              gestureEnabled: true,
            }}>
            <Stack.Protected guard={status === "authenticated"}>
              <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
              <Stack.Screen name="track/[id]" />
              <Stack.Screen name="folder/[key]" />
              <Stack.Screen name="playlist/[id]" />
              <Stack.Screen name="smart/[rule]" />
              <Stack.Screen name="missing" />
              <Stack.Screen name="import" />
              <Stack.Screen name="settings" />
              <Stack.Screen
                name="player"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: "transparent" },
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={status !== "authenticated"}>
              <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
            </Stack.Protected>
          </Stack>
        )}
        {/* Mounted above the navigator on purpose. It renders a `Modal`, which
            is its own window, so it can be opened from the player — itself a
            transparent modal — without landing behind it. */}
        <AddToPlaylistSheet />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
