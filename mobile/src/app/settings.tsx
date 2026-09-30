import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { CardRow, CardSection, SegmentedControl } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useTheme } from "@/hooks/use-theme";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { SPEED_OPTIONS, THEME_PREFERENCES, formatBytes, type ThemePreference } from "@/lib/settings";
import { formatRelativeTime } from "@/lib/time";
import { LocalDBService } from "@/services/LocalDBService";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { card as cardTokens, radius as radii, spacing } from "@/theme/tokens";

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * Each theme gets its own glyph. "System" is a contrast mark rather than a gear:
 * a gear says *settings*, not *whatever your device is doing*.
 */
const THEME_OPTIONS = THEME_PREFERENCES.map((preference) => ({
  value: preference,
  label: THEME_LABELS[preference],
  icon:
    preference === "system" ? ("autoTheme" as const) : preference === "light" ? ("sunny" as const) : ("moon" as const),
}));

const SPEED_SEGMENTS = SPEED_OPTIONS.map((speed) => ({
  value: speed,
  label: `${speed}×`,
}));

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
  // `null` until the figure is measured, so the row says "…" rather than
  // asserting "0 B" for a frame.
  const [storageBytes, setStorageBytes] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      void LocalDBService.getAllTracks().then((tracks) => {
        setStorageBytes(tracks.reduce((total, track) => total + track.fileSizeBytes, 0));
      });
    }, []),
  );

  // The breakdown belongs to the number above it, not beside it as a competing
  // row — four counts on four lines read as four separate facts and add up to
  // nothing.
  const queueDetail =
    pendingTotal === 0
      ? "Everything on this device is on the server."
      : `${pending.tracks} tracks · ${pending.sessions} sessions · ${pending.annotations} notes · ${pending.playlists} playlists`;

  const name = user?.displayName ?? user?.username ?? "Signed in";

  return (
    <Screen wash={theme.accent}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader onBack={() => router.back()} overline="PREFERENCES" title="Settings" />

        {/* 1 — Account. Identity, then a destructive action that gets its own
            bounded row rather than sitting under the avatar as a caption. */}
        <CardSection title="ACCOUNT" index={1}>
          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
              <Icon name="person" size={24} color={theme.accent} />
            </View>
            <View style={styles.identityCopy}>
              <ThemedText type="bodyStrong" numberOfLines={1}>
                {name}
              </ThemedText>
              {user?.email ? (
                <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1} selectable>
                  {user.email}
                </ThemedText>
              ) : null}
            </View>
          </View>
        </CardSection>

        {/* 2 — Playback and appearance. Both are single-choice, so both get a
            segmented control: a row of chips said "filter", and a thumb's
            position says "this one". */}
        <CardSection title="PLAYBACK" index={4} footer="The speed a track starts at.">
          <View style={styles.control}>
            <SegmentedControl
              accessibilityLabel="Default playback speed"
              options={SPEED_SEGMENTS}
              value={defaultSpeed}
              onChange={(value) => void setDefaultSpeed(value)}
            />
          </View>
        </CardSection>

        <CardSection title="APPEARANCE" index={7} footer="System follows your device's light and dark setting.">
          <View style={styles.control}>
            <SegmentedControl
              accessibilityLabel="Theme"
              options={THEME_OPTIONS}
              value={themePreference}
              onChange={(value) => void setTheme(value)}
            />
          </View>
        </CardSection>

        {/* 3 — Storage and sync, merged. A whole card to say "1.2 GB" was
            spending a panel on one number; these are the same question. */}
        <CardSection
          title="STORAGE & SYNC"
          index={10}
          footer="Pejvak writes everything here first and sends it when it can, so a lost connection never costs you a session.">
          <CardRow
            position="first"
            icon="cloudDownload"
            label="Imported audio"
            value={storageBytes === null ? "…" : formatBytes(storageBytes)}
          />
          <CardRow
            position="last"
            icon="cloudDone"
            label={pendingTotal === 0 ? "Everything synced" : "Waiting to sync"}
            detail={queueDetail}
            value={pendingTotal === 0 ? "Up to date" : String(pendingTotal)}
            tone={pendingTotal === 0 ? "neutral" : "accent"}
          />
          <View style={styles.syncMeta}>
            <ThemedText type="caption" themeColor="textTertiary">
              {lastSyncAt === null
                ? "This device has never synced."
                : `Last synced ${formatRelativeTime(lastSyncAt)}`}
            </ThemedText>
            <PrimaryButton
              label="Sync now"
              loading={syncing}
              onPress={() => void syncNow()}
            />
          </View>
        </CardSection>

        {/* 4 — Sign out, alone, in danger. The one control on the screen that
            ends a session, so it does not share a card with anything. */}
        <Reveal index={13}>
          <ElasticPressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            accessibilityHint="Signs you out of this device"
            scaleTo={0.97}
            haptic="light"
            onPress={() => void logout()}
            style={styles.signOut}>
            <Icon name="logout" size={18} color={theme.danger} />
            <ThemedText type="body" style={{ color: theme.danger }}>
              Sign out
            </ThemedText>
          </ElasticPressable>
        </Reveal>
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
  /** A group whose only child is a control, not a row. */
  control: {
    padding: cardTokens.padding,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: cardTokens.padding,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  identityCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  syncMeta: {
    gap: spacing.md,
    padding: cardTokens.padding,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: cardTokens.rowMinHeight,
    marginTop: spacing.sm,
  },
});
