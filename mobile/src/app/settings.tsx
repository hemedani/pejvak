import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { PrimaryButton } from "@/components/ui/primary-button";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { useTheme } from "@/hooks/use-theme";
import { LocalDBService } from "@/services/LocalDBService";
import { SPEED_OPTIONS, THEME_PREFERENCES, formatBytes, type ThemePreference } from "@/lib/settings";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}>
      <ThemedView
        type={selected ? "backgroundSelected" : "backgroundElement"}
        style={[styles.chip, { borderColor: selected ? theme.tint : "transparent" }]}>
        <ThemedText type="smallBold">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export default function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const themePreference = useSettingsStore((state) => state.themePreference);
  const defaultSpeed = useSettingsStore((state) => state.defaultSpeed);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setDefaultSpeed = useSettingsStore((state) => state.setDefaultSpeed);

  const { pending, pendingTotal, lastSyncAt, syncing, syncNow } = useSyncStatus();
  const [storageBytes, setStorageBytes] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void LocalDBService.getAllTracks().then((tracks) => {
        setStorageBytes(tracks.reduce((total, track) => total + track.fileSizeBytes, 0));
      });
    }, []),
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Account
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {user?.displayName ?? user?.username ?? "Signed in"}
            </ThemedText>
            {user?.email ? (
              <ThemedText type="small" themeColor="textSecondary" selectable>
                {user.email}
              </ThemedText>
            ) : null}
          </ThemedView>
          <Pressable accessibilityRole="button" onPress={() => void logout()}>
            <ThemedText type="linkPrimary">Sign out</ThemedText>
          </Pressable>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Sync
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.rowBetween}>
              <ThemedText type="small">Waiting to sync</ThemedText>
              <ThemedText type="smallBold">{pendingTotal}</ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {pending.tracks} tracks · {pending.sessions} sessions · {pending.annotations} notes ·{" "}
              {pending.playlists} playlists
            </ThemedText>
            <View style={styles.rowBetween}>
              <ThemedText type="small">Last synced</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Never"}
              </ThemedText>
            </View>
          </ThemedView>
          <PrimaryButton
            label="Sync now"
            loading={syncing}
            onPress={() => void syncNow()}
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Storage
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.rowBetween}>
              <ThemedText type="small">Imported audio</ThemedText>
              <ThemedText type="smallBold">{formatBytes(storageBytes)}</ThemedText>
            </View>
          </ThemedView>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Default playback speed
          </ThemedText>
          <View style={styles.chips}>
            {SPEED_OPTIONS.map((speed) => (
              <Chip
                key={speed}
                label={`${speed}×`}
                selected={speed === defaultSpeed}
                onPress={() => void setDefaultSpeed(speed)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Appearance
          </ThemedText>
          <View style={styles.chips}>
            {THEME_PREFERENCES.map((preference) => (
              <Chip
                key={preference}
                label={THEME_LABELS[preference]}
                selected={preference === themePreference}
                onPress={() => void setTheme(preference)}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
});
