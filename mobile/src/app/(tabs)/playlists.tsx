import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { usePlaylists } from "@/hooks/use-playlists";
import type { LocalPlaylist } from "@/lib/db/types";
import { PlaylistService } from "@/services/PlaylistService";

function trackCount(playlist: LocalPlaylist): string {
  const count = playlist.items.length;
  return `${count} track${count === 1 ? "" : "s"}`;
}

export default function PlaylistsScreen() {
  const router = useRouter();
  const { playlists, loading, refresh } = usePlaylists();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onCreate = async () => {
    setBusy(true);
    try {
      await PlaylistService.create(title);
      setTitle("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (playlist: LocalPlaylist) => {
    Alert.alert("Delete playlist?", `"${playlist.title}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void PlaylistService.remove(playlist.id).then(refresh);
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Playlists</ThemedText>
        </View>

        <View style={styles.createRow}>
          <TextField
            label="New playlist"
            value={title}
            onChangeText={setTitle}
            placeholder="Name"
            returnKeyType="done"
            onSubmitEditing={() => void onCreate()}
            style={styles.createInput}
          />
          <PrimaryButton
            label="Create"
            loading={busy}
            disabled={title.trim().length === 0}
            onPress={() => void onCreate()}
            style={styles.createButton}
          />
        </View>

        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loading ? null : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                No playlists yet. Create one above, then add tracks to it.
              </ThemedText>
            )
          }
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.row}>
              <Pressable
                accessibilityRole="button"
                style={styles.rowMain}
                onPress={() => router.push(`/playlist/${item.id}` as Href)}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {trackCount(item)}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => confirmDelete(item)}>
                <ThemedText type="linkPrimary">Delete</ThemedText>
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
    paddingTop: Spacing.three,
  },
  createRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.two,
  },
  createInput: {
    flex: 1,
  },
  createButton: {
    paddingHorizontal: Spacing.four,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
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
  empty: {
    textAlign: "center",
    paddingVertical: Spacing.five,
  },
});
