import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { PrimaryButton } from "@/components/ui/primary-button";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import type { LocalTrack } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";
import { importAudioFiles } from "@/services/LibraryService";

function formatLastPlayed(value: number | null): string {
  if (!value) {
    return "Never played";
  }
  return `Last played ${new Date(value).toLocaleString()}`;
}

export default function LibraryScreen() {
  const router = useRouter();
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    const [allTracks, counts] = await Promise.all([
      LocalDBService.getAllTracks(),
      LocalDBService.getAnnotationCounts(),
    ]);
    setTracks(allTracks);
    setAnnotationCounts(counts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onImport = useCallback(async () => {
    setImporting(true);
    try {
      const imported = await importAudioFiles();
      await refresh();
      // Open the player only when a single file was picked; batch imports
      // land back on the library.
      if (imported.length === 1) {
        router.push({ pathname: "/player", params: { trackId: imported[0].id } });
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
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/settings" as Href)}>
            <ThemedText type="linkPrimary">Settings</ThemedText>
          </Pressable>
        </View>

        <PrimaryButton
          label={importing ? "Importing…" : "Add audio files"}
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
            <ThemedView type="backgroundElement" style={styles.row}>
              <Pressable
                accessibilityRole="button"
                style={styles.rowMain}
                onPress={() =>
                  router.push({ pathname: "/player", params: { trackId: item.id } })
                }>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {item.totalPlayCount} play{item.totalPlayCount === 1 ? "" : "s"} ·{" "}
                  {annotationCounts[item.id] ?? 0} note
                  {(annotationCounts[item.id] ?? 0) === 1 ? "" : "s"} ·{" "}
                  {formatLastPlayed(item.lastPlayedAt)}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Details for ${item.title}`}
                hitSlop={8}
                onPress={() =>
                  router.push(`/track/${item.id}` as Href)
                }>
                <ThemedText type="linkPrimary">Details</ThemedText>
              </Pressable>
            </ThemedView>
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
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowMain: {
    flex: 1,
    gap: Spacing.one,
  },
});
