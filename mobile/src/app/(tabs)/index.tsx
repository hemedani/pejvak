import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { PrimaryButton } from "@/components/ui/primary-button";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import type { LocalTrack } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";
import { importAudioFile } from "@/services/LibraryService";
import { useAuthStore } from "@/store/authStore";

function formatLastPlayed(value: number | null): string {
  if (!value) {
    return "Never played";
  }
  return `Last played ${new Date(value).toLocaleString()}`;
}

export default function LibraryScreen() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    setTracks(await LocalDBService.getAllTracks());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onImport = useCallback(async () => {
    setImporting(true);
    try {
      const track = await importAudioFile();
      await refresh();
      if (track) {
        router.push({ pathname: "/player", params: { trackId: track.id } });
      }
    } finally {
      setImporting(false);
    }
  }, [refresh, router]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Library</ThemedText>
          <Pressable onPress={() => void logout()} accessibilityRole="button">
            <ThemedText type="linkPrimary">Sign out</ThemedText>
          </Pressable>
        </View>

        <PrimaryButton
          label={importing ? "Importing…" : "Add audio file"}
          loading={importing}
          onPress={() => void onImport()}
        />

        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No tracks yet. Add an audio file to start listening.
            </ThemedText>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/player", params: { trackId: item.id } })
              }>
              <ThemedView type="backgroundElement" style={styles.row}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.totalPlayCount} play{item.totalPlayCount === 1 ? "" : "s"} ·{" "}
                  {formatLastPlayed(item.lastPlayedAt)}
                </ThemedText>
              </ThemedView>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  empty: {
    textAlign: "center",
    paddingVertical: Spacing.five,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
