import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AddToPlaylistSheet } from "@/components/add-to-playlist";
import { ContextHistorySheet } from "@/components/context-history";
import { StackMiniPlayer } from "@/components/player/StackMiniPlayer";
import { SessionDetailSheet } from "@/components/session-detail";
import { GlassBlurTarget } from "@/components/ui/glass/BlurTarget";
import { ICON_FONT } from "@/components/ui/icon";
import { isTabPathname } from "@/lib/tabNavigation";
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
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const restore = useAuthStore((state) => state.restore);
  const [fontsLoaded, fontError] = useFonts(ICON_FONT);
  // A missing font must not strand the app on the splash screen; the icons may
  // render as blanks, but every other surface still works.
  const canRender = fontsLoaded || fontError !== null;

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    void TrackPlayerService.recoverOrphanedSessions().catch(() => undefined);
  }, []);

  useEffect(() => {
    void useSettingsStore.getState().load();
  }, []);

  useEffect(() => {
    if (canRender && status !== "loading") {
      void SplashScreen.hideAsync();
    }
  }, [canRender, status]);

  if (!canRender) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        {status === "loading" ? null : (
          <GlassBlurTarget
            style={StyleSheet.absoluteFill}
            background={
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
                  {/* Online content. Three levels, pushed in the order the
                      listener walks them: language → source → collection. They
                      use the default slide so arriving at a course feels the
                      same as arriving at a folder. */}
                  <Stack.Screen name="online/language/[code]" />
                  <Stack.Screen name="online/source/[id]" />
                  <Stack.Screen name="online/[key]" />
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
            }>
            {/* A stack screen has no navigation dock, so it carries the player
                half on its own. The tab layout draws its own copy inside the
                dock; the full player is the thing this bar would open. */}
            {status === "authenticated" &&
            !isTabPathname(pathname) &&
            pathname !== "/player" ? (
              <StackMiniPlayer />
            ) : null}
          </GlassBlurTarget>
        )}
        {/* Mounted above the navigator on purpose. It renders a `Modal`, which
            is its own window, so it can be opened from the player — itself a
            transparent modal — without landing behind it. */}
        <AddToPlaylistSheet />
        {/* Same reasoning: a collection's history is reachable from a library
            card, a collection screen, and the player alike. */}
        <ContextHistorySheet />
        {/* And one listen's own detail: a History card and a track's own screen
            both open it, and both are reachable while the player is open. */}
        <SessionDetailSheet />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
