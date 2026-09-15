import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { useTheme } from "@/hooks/use-theme";
import { usePlaylistDetail } from "@/hooks/use-playlist-detail";
import type { LocalTrack } from "@/lib/db/types";
import { paletteFor } from "@/lib/palette";
import { PlaylistService } from "@/services/PlaylistService";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { spacing } from "@/theme/tokens";

export default function PlaylistDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const playlistId = params.id ?? null;
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

  const tracks = data?.tracks ?? [];

  const play = (index: number) => {
    const track = tracks[index];
    if (!track) {
      return;
    }
    void TrackPlayerService.playQueueAt(
      tracks.map((item) => item.id),
      index,
    );
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

  const addedIds = new Set(tracks.map((track) => track.id));
  const addable = (data?.library ?? []).filter((track: LocalTrack) => !addedIds.has(track.id));
  const ramp = paletteFor(data?.playlist.title ?? playlistId);

  return (
    <Screen wash={ramp[1]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {data ? (
          <>
            {renaming ? (
              <Reveal index={0} style={styles.renameBlock}>
                <TextField
                  label="Playlist name"
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  autoFocus
                />
                <View style={styles.renameActions}>
                  <ElasticPressable
                    accessibilityRole="button"
                    onPress={() => setRenaming(false)}
                    style={styles.textButton}>
                    <ThemedText type="label" themeColor="textSecondary">
                      Cancel
                    </ThemedText>
                  </ElasticPressable>
                  <PrimaryButton
                    label="Save"
                    disabled={titleDraft.trim().length === 0}
                    onPress={() => void saveRename()}
                    style={styles.renameButton}
                  />
                </View>
              </Reveal>
            ) : (
              <ScreenHeader
                onBack={() => router.back()}
                overline="PLAYLIST"
                title={data.playlist.title}
                subtitle={`${tracks.length} track${tracks.length === 1 ? "" : "s"}`}
                action={
                  <BouncyIconButton
                    name="edit"
                    accessibilityLabel="Rename playlist"
                    size={42}
                    iconSize={18}
                    tone="glass"
                    onPress={() => {
                      setTitleDraft(data.playlist.title);
                      setRenaming(true);
                    }}
                  />
                }
              />
            )}

            <View style={styles.section}>
              <Reveal index={1}>
                <ThemedText type="overline" themeColor="textTertiary">
                  TRACKS
                </ThemedText>
              </Reveal>
              {tracks.length === 0 ? (
                <ThemedText type="caption" themeColor="textTertiary">
                  {loading ? "Loading…" : "No tracks yet."}
                </ThemedText>
              ) : (
                tracks.map((track, index) => (
                  <Reveal key={track.id} index={index + 2}>
                    <GlassSurface style={styles.row}>
                      <ElasticPressable
                        accessibilityRole="button"
                        accessibilityLabel={`Play ${track.title}`}
                        onPress={() => play(index)}
                        style={styles.rowMain}>
                        <PaletteTile
                          ramp={paletteFor(track.contentHash)}
                          label={track.title}
                          size={40}
                          radius={12}
                        />
                        <View style={styles.rowCopy}>
                          <ThemedText type="bodyStrong" numberOfLines={1}>
                            {index + 1}. {track.title}
                          </ThemedText>
                        </View>
                      </ElasticPressable>

                      <View style={styles.rowActions}>
                        <BouncyIconButton
                          name="arrowUp"
                          accessibilityLabel="Move up"
                          size={34}
                          iconSize={15}
                          tone="ghost"
                          disabled={index === 0}
                          onPress={() =>
                            playlistId &&
                            void run(() => PlaylistService.moveTrack(playlistId, index, index - 1))
                          }
                        />
                        <BouncyIconButton
                          name="arrowDown"
                          accessibilityLabel="Move down"
                          size={34}
                          iconSize={15}
                          tone="ghost"
                          disabled={index === tracks.length - 1}
                          onPress={() =>
                            playlistId &&
                            void run(() => PlaylistService.moveTrack(playlistId, index, index + 1))
                          }
                        />
                        <BouncyIconButton
                          name="close"
                          accessibilityLabel={`Remove ${track.title}`}
                          size={34}
                          iconSize={15}
                          tone="ghost"
                          onPress={() =>
                            playlistId &&
                            void run(() => PlaylistService.removeTrack(playlistId, track.id))
                          }
                        />
                      </View>
                    </GlassSurface>
                  </Reveal>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Reveal index={20}>
                <ElasticPressable
                  accessibilityRole="button"
                  onPress={() => setAdding((value) => !value)}
                  style={styles.textButton}>
                  <ThemedText type="label" style={{ color: theme.accent }}>
                    {adding ? "Done" : "Add tracks"}
                  </ThemedText>
                </ElasticPressable>
              </Reveal>
              {adding ? (
                addable.length === 0 ? (
                  <ThemedText type="caption" themeColor="textTertiary">
                    Every library track is already here.
                  </ThemedText>
                ) : (
                  addable.map((track: LocalTrack, index: number) => (
                    <Reveal key={track.id} index={21 + index}>
                      <GlassSurface flat style={styles.row}>
                        <View style={styles.rowMain}>
                          <PaletteTile
                            ramp={paletteFor(track.contentHash)}
                            label={track.title}
                            size={40}
                            radius={12}
                          />
                          <ThemedText
                            type="bodyStrong"
                            numberOfLines={1}
                            style={styles.rowCopy}>
                            {track.title}
                          </ThemedText>
                        </View>
                        <BouncyIconButton
                          name="add"
                          accessibilityLabel={`Add ${track.title}`}
                          size={36}
                          iconSize={18}
                          tone="glass"
                          onPress={() =>
                            playlistId &&
                            void run(() => PlaylistService.addTrack(playlistId, track.id))
                          }
                        />
                      </GlassSurface>
                    </Reveal>
                  ))
                )
              ) : null}
            </View>

            <Reveal index={40}>
              <ElasticPressable
                accessibilityRole="button"
                onPress={confirmDelete}
                style={styles.dangerRow}>
                <ThemedText type="label" style={{ color: theme.danger }}>
                  Delete playlist
                </ThemedText>
              </ElasticPressable>
            </Reveal>
          </>
        ) : (
          <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
            {loading ? "Loading…" : "Playlist not found."}
          </ThemedText>
        )}
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
  renameBlock: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  renameActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.lg,
  },
  renameButton: {
    paddingHorizontal: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 20,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  rowCopy: {
    flex: 1,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    // 8 rather than 4: these buttons are 34 pt and pad their touch area out to
    // 44, so a tighter gap would let neighbouring hit areas overlap and turn a
    // missed "move down" into an accidental "remove".
    gap: spacing.sm,
  },
  textButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  dangerRow: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
