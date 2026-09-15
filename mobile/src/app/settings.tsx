import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassChip } from "@/components/ui/glass/GlassChip";
import { GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useTheme } from "@/hooks/use-theme";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { SPEED_OPTIONS, THEME_PREFERENCES, formatBytes, type ThemePreference } from "@/lib/settings";
import { LocalDBService } from "@/services/LocalDBService";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { spacing } from "@/theme/tokens";

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function Section({
  title,
  index,
  children,
}: {
  title: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Reveal index={index}>
        <ThemedText type="overline" themeColor="textTertiary">
          {title}
        </ThemedText>
      </Reveal>
      <Reveal index={index + 1}>{children}</Reveal>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowBetween}>
      <ThemedText type="caption" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="bodyStrong">{value}</ThemedText>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
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
    <Screen wash={theme.accent}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          onBack={() => router.back()}
          overline="PREFERENCES"
          title="Settings"
        />

        <Section title="ACCOUNT" index={1}>
          <GlassSurface style={styles.card}>
            <View style={styles.accountRow}>
              <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
                <Icon name="person" size={20} color={theme.accent} />
              </View>
              <View style={styles.accountCopy}>
                <ThemedText type="bodyStrong" numberOfLines={1}>
                  {user?.displayName ?? user?.username ?? "Signed in"}
                </ThemedText>
                {user?.email ? (
                  <ThemedText type="caption" themeColor="textSecondary" selectable>
                    {user.email}
                  </ThemedText>
                ) : null}
              </View>
            </View>
            <ElasticPressable
              accessibilityRole="button"
              onPress={() => void logout()}
              style={styles.dangerRow}>
              <Icon name="logout" size={16} color={theme.danger} />
              <ThemedText type="label" style={{ color: theme.danger }}>
                Sign out
              </ThemedText>
            </ElasticPressable>
          </GlassSurface>
        </Section>

        <Section title="SYNC" index={3}>
          <GlassSurface style={styles.card}>
            <Row label="Waiting to sync" value={String(pendingTotal)} />
            <ThemedText type="caption" themeColor="textTertiary">
              {pending.tracks} tracks · {pending.sessions} sessions · {pending.annotations} notes ·{" "}
              {pending.playlists} playlists
            </ThemedText>
            <Row
              label="Last synced"
              value={lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Never"}
            />
            <PrimaryButton label="Sync now" loading={syncing} onPress={() => void syncNow()} />
          </GlassSurface>
        </Section>

        <Section title="STORAGE" index={5}>
          <GlassSurface style={styles.card}>
            <Row label="Imported audio" value={formatBytes(storageBytes)} />
          </GlassSurface>
        </Section>

        <Section title="DEFAULT PLAYBACK SPEED" index={7}>
          <View style={styles.chips}>
            {SPEED_OPTIONS.map((speed) => (
              <GlassChip
                key={speed}
                label={`${speed}×`}
                selected={speed === defaultSpeed}
                onPress={() => void setDefaultSpeed(speed)}
              />
            ))}
          </View>
        </Section>

        <Section title="APPEARANCE" index={9}>
          <View style={styles.chips}>
            {THEME_PREFERENCES.map((preference) => (
              <GlassChip
                key={preference}
                label={THEME_LABELS[preference]}
                selected={preference === themePreference}
                onPress={() => void setTheme(preference)}
              />
            ))}
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 24,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  accountCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 46,
    borderRadius: 18,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
