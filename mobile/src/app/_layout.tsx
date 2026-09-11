import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { useAuthStore } from "@/store/authStore";

SplashScreen.preventAutoHideAsync();

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

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {status === "loading" ? null : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={status === "authenticated"}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="player"
              options={{ headerShown: true, title: "Now Playing" }}
            />
            <Stack.Screen
              name="track/[id]"
              options={{ headerShown: true, title: "Track" }}
            />
          </Stack.Protected>
          <Stack.Protected guard={status !== "authenticated"}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      )}
    </ThemeProvider>
  );
}
