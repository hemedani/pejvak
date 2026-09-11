import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { usePlaylistDetail } from "@/hooks/use-playlist-detail";
import type { LocalTrack } from "@/lib/db/types";
import { PlaylistService } from "@/services/PlaylistService";

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const playlistId = id ?? null;
  const { data, loading, refresh } = usePlaylistDetail(playlistId);

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [adding, setAdding] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const run = async (operation: () => Promise<void>) => {
    await operation();
    await refresh();
  };

  const play = (track: LocalTrack) => {
    router.push({ pathname: "/player", params: { trackId: track.id } });
  };

  const saveRename = async () => {
    if (!playlistId) {
      return;
    }
    await run(() => PlaylistService.rename(playlistId, titleDraft));
    setRenaming(false);
  };

  const confirmDelete = () => {
    if (!playlistId || !data) {
      return;
    }
    Alert.alert("Delete playlist?", `"${data.playlist.title}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void PlaylistService.remove(playlistId).then(() => router.back());
        },
      },
    ]);
  };

  const tracks = data?.tracks ?? [];
  const addedIds = new Set(tracks.map((track) => track.id));
  const addable = (data?.library ?? []).filter((track) => !addedIds.has(track.id));

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {data ? (
          <>
            {renaming ? (
              <View style={styles.renameRow}>
                <TextField
                  label="Playlist name"
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  autoFocus
                  style={styles.renameInput}
                />
                <View style={styles.renameActions}>
                  <Pressable accessibilityRole="button" onPress={() => setRenaming(false)}>
                    <ThemedText type="linkPrimary">Cancel</ThemedText>
                  </Pressable>
                  <PrimaryButton
                    label="Save"
                    disabled={titleDraft.trim().length === 0}
                    onPress={() => void saveRename()}
                    style={styles.renameButton}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.header}>
                <ThemedText type="subtitle" numberOfLines={2} style={styles.title}>
                  {data.playlist.title}
                </ThemedText>
                <Pressable accessibilityRole="button" onPress={() => {
                  setTitleDraft(data.playlist.title);
                  setRenaming(true);
                }}>
                  <ThemedText type="linkPrimary">Rename</ThemedText>
                </Pressable>
              </View>
            )}

            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Tracks
              </ThemedText>
              {tracks.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {loading ? "Loading…" : "No tracks yet."}
                </ThemedText>
              ) : (
                tracks.map((track, index) => (
                  <ThemedView key={track.id} type="backgroundElement" style={styles.row}>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.rowMain}
                      onPress={() => play(track)}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {index + 1}. {track.title}
                      </ThemedText>
                    </Pressable>
                    <View style={styles.rowActions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={index === 0}
                        hitSlop={6}
                        onPress={() =>
                          playlistId &&
                          void run(() => PlaylistService.moveTrack(playlistId, index, index - 1))
                        }>
                        <ThemedText
                          type="smallBold"
                          themeColor={index === 0 ? "textSecondary" : "text"}>
                          ↑
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={index === tracks.length - 1}
                        hitSlop={6}
                        onPress={() =>
                          playlistId &&
                          void run(() => PlaylistService.moveTrack(playlistId, index, index + 1))
                        }>
                        <ThemedText
                          type="smallBold"
                          themeColor={index === tracks.length - 1 ? "textSecondary" : "text"}>
                          ↓
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={6}
                        onPress={() =>
                          playlistId &&
                          void run(() => PlaylistService.removeTrack(playlistId, track.id))
                        }>
                        <ThemedText type="linkPrimary">Remove</ThemedText>
                      </Pressable>
                    </View>
                  </ThemedView>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Pressable accessibilityRole="button" onPress={() => setAdding((value) => !value)}>
                <ThemedText type="linkPrimary">{adding ? "Done" : "Add tracks"}</ThemedText>
              </Pressable>
              {adding ? (
                addable.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Every library track is already here.
                  </ThemedText>
                ) : (
                  addable.map((track) => (
                    <ThemedView key={track.id} type="backgroundElement" style={styles.row}>
                      <ThemedText type="small" numberOfLines={1} style={styles.rowMain}>
                        {track.title}
                      </ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={6}
                        onPress={() =>
                          playlistId &&
                          void run(() => PlaylistService.addTrack(playlistId, track.id))
                        }>
                        <ThemedText type="linkPrimary">Add</ThemedText>
                      </Pressable>
                    </ThemedView>
                  ))
                )
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              style={styles.dangerRow}
              onPress={confirmDelete}>
              <ThemedText type="linkPrimary">Delete playlist</ThemedText>
            </Pressable>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {loading ? "Loading…" : "Playlist not found."}
          </ThemedText>
        )}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  title: {
    flex: 1,
  },
  renameRow: {
    gap: Spacing.three,
  },
  renameInput: {
    width: "100%",
  },
  renameActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: Spacing.three,
  },
  renameButton: {
    paddingHorizontal: Spacing.four,
  },
  section: {
    gap: Spacing.two,
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
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  dangerRow: {
    paddingVertical: Spacing.two,
  },
  empty: {
    textAlign: "center",
    paddingVertical: Spacing.five,
  },
});
