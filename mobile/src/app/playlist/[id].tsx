import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { AddToPlaylistButton } from "@/components/add-to-playlist";
import { ContextHistoryButton } from "@/components/context-history";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { KeyboardScrollView } from "@/components/ui/keyboard-scroll-view";
import { PrimaryButton } from "@/components/ui/primary-button";
import {
  EmptyState,
  historyAction,
  InlineNotice,
  ListGroup,
  ListRow,
  SkeletonRows,
} from "@/components/ui/row";
import { TextField } from "@/components/ui/text-field";
import { useTheme } from "@/hooks/use-theme";
import { usePlaylistDetail } from "@/hooks/use-playlist-detail";
import type { LocalTrack } from "@/lib/db/types";
import { paletteFor } from "@/lib/palette";
import { describeContextStats } from "@/lib/playbackContext";
import { PlaylistService } from "@/services/PlaylistService";
import { card as cardTokens, control, iconSize, miniPlayerInset, radius as radii, spacing, tile, tileRadius } from "@/theme/tokens";

export default function PlaylistDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const playlistId = params.id ?? null;
  const { data, loading, refresh } = usePlaylistDetail(playlistId);

  const [renaming, setRenaming] = useState(false);
  const renameGroupRef = useRef<View>(null);
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

  /**
   * Starts the playlist *as a collection*, not as a bare list of tracks: the
   * queue carries a playlist context, which is what records a run against the
   * playlist and lets the player offer to open it again.
   */
  const play = (index: number) => {
    const track = tracks[index];
    if (!playlistId || !track) {
      return;
    }
    void PlaylistService.play(playlistId, index);
    router.push({ pathname: "/player", params: { trackId: track.id } });
  };

  const saveRename = async () => {
    if (!playlistId || titleDraft.trim().length === 0) {
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
      <KeyboardScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {data ? (
          <>
            {renaming ? (
              <Reveal index={0} style={styles.renameBlock}>
                <View ref={renameGroupRef} collapsable={false} style={styles.renameGroup}>
                  <TextField
                    label="Playlist name"
                    value={titleDraft}
                    onChangeText={setTitleDraft}
                    autoFocus
                    autoComplete="off"
                    importantForAutofill="no"
                    revealTargetRef={renameGroupRef}
                    returnKeyType="done"
                    submitBehavior="blurAndSubmit"
                    onSubmitEditing={() => void saveRename()}
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
                </View>
              </Reveal>
            ) : (
              <ScreenHeader
                onBack={() => router.back()}
                overline="PLAYLIST"
                title={data.playlist.title}
                subtitle={[
                  `${tracks.length} track${tracks.length === 1 ? "" : "s"}`,
                  describeContextStats(data.stats),
                ]
                  .filter((part): part is string => part !== null)
                  .join(" · ")}
                action={
                  <View style={styles.headerActions}>
                    <ContextHistoryButton
                      type="playlist"
                      contextKey={playlistId ?? ""}
                      title={data.playlist.title}
                      artwork={tracks[0]?.artworkUrl ?? null}
                      size={control.lg}
                      iconSize={iconSize.lg}
                      tone="glass"
                    />
                    {/* The whole playlist, in one tap: the useful direction
                        here is copying or merging into another list, which is
                        why this is a batch target rather than per-row only. */}
                    {tracks.length > 0 ? (
                      <AddToPlaylistButton
                        trackIds={tracks.map((track) => track.id)}
                        title={data.playlist.title}
                        subtitle={`${tracks.length} track${tracks.length === 1 ? "" : "s"} from this playlist`}
                        ramp={ramp}
                        artwork={tracks[0]?.artworkUrl ?? null}
                        isBatch
                        size={control.lg}
                        iconSize={iconSize.lg}
                        tone="glass"
                      />
                    ) : null}
                    <BouncyIconButton
                      name="edit"
                      accessibilityLabel="Rename playlist"
                      size={control.lg}
                      iconSize={iconSize.md}
                      tone="glass"
                      onPress={() => {
                        setTitleDraft(data.playlist.title);
                        setRenaming(true);
                      }}
                    />
                  </View>
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
                loading ? (
                  <SkeletonRows count={3} />
                ) : (
                  <EmptyState
                    icon="playlists"
                    title="No tracks yet"
                    message="Add music below to start this playlist."
                  />
                )
              ) : (
                <ListGroup>
                  {tracks.map((track, index) => (
                    <ListRow
                      key={track.id}
                      title={`${index + 1}. ${track.title}`}
                      titleLines={2}
                      leading={
                        <PaletteTile
                          ramp={paletteFor(track.contentHash)}
                          label={track.title}
                          source={track.artworkUrl}
                          size={tile.md}
                          radius={tileRadius(tile.md)}
                          recyclingKey={track.contentHash}
                          dense
                        />
                      }
                      leadingWidth={tile.md}
                      onPress={() => play(index)}
                      accessibilityLabel={`Play ${track.title}`}
                      actions={[
                        historyAction({
                          type: "playlist",
                          contextKey: playlistId ?? "",
                          title: data.playlist.title,
                          artwork: tracks[0]?.artworkUrl ?? null,
                        }),
                        {
                          key: "moveUp",
                          width: control.md,
                          priority: 0,
                          icon: "arrowUp",
                          label: `Move ${track.title} up`,
                          onPress: () =>
                            playlistId &&
                            void run(() => PlaylistService.moveTrack(playlistId, index, index - 1)),
                          node: (
                            <BouncyIconButton
                              name="arrowUp"
                              accessibilityLabel={`Move ${track.title} up`}
                              size={control.sm}
                              iconSize={iconSize.sm}
                              tone="ghost"
                              disabled={index === 0}
                              onPress={() =>
                                playlistId &&
                                void run(() => PlaylistService.moveTrack(playlistId, index, index - 1))
                              }
                            />
                          ),
                        },
                        {
                          key: "moveDown",
                          width: control.md,
                          priority: 0,
                          icon: "arrowDown",
                          label: `Move ${track.title} down`,
                          onPress: () =>
                            playlistId &&
                            void run(() => PlaylistService.moveTrack(playlistId, index, index + 1)),
                          node: (
                            <BouncyIconButton
                              name="arrowDown"
                              accessibilityLabel={`Move ${track.title} down`}
                              size={control.sm}
                              iconSize={iconSize.sm}
                              tone="ghost"
                              disabled={index === tracks.length - 1}
                              onPress={() =>
                                playlistId &&
                                void run(() => PlaylistService.moveTrack(playlistId, index, index + 1))
                              }
                            />
                          ),
                        },
                        {
                          key: "remove",
                          width: control.md,
                          priority: 0,
                          icon: "close",
                          label: `Remove ${track.title}`,
                          onPress: () =>
                            playlistId &&
                            void run(() => PlaylistService.removeTrack(playlistId, track.id)),
                          node: (
                            <BouncyIconButton
                              name="close"
                              accessibilityLabel={`Remove ${track.title}`}
                              size={control.sm}
                              iconSize={iconSize.sm}
                              tone="ghost"
                              onPress={() =>
                                playlistId &&
                                void run(() => PlaylistService.removeTrack(playlistId, track.id))
                              }
                            />
                          ),
                        },
                      ]}
                    />
                  ))}
                </ListGroup>
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
                  <InlineNotice
                    tone="neutral"
                    title="Every library track is already here."
                  />
                ) : (
                  <ListGroup>
                    {addable.map((track: LocalTrack) => (
                      <ListRow
                        key={track.id}
                        title={track.title}
                        titleLines={1}
                        leading={
                          <PaletteTile
                            ramp={paletteFor(track.contentHash)}
                            label={track.title}
                            source={track.artworkUrl}
                            size={tile.md}
                            radius={tileRadius(tile.md)}
                            recyclingKey={track.contentHash}
                            dense
                          />
                        }
                        leadingWidth={tile.md}
                        accessibilityLabel={`Add ${track.title}`}
                        trailing={
                          <BouncyIconButton
                            name="add"
                            accessibilityLabel={`Add ${track.title}`}
                            size={control.md}
                            iconSize={iconSize.md}
                            tone="glass"
                            onPress={() =>
                              playlistId &&
                              void run(() => PlaylistService.addTrack(playlistId, track.id))
                            }
                          />
                        }
                      />
                    ))}
                  </ListGroup>
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
        ) : loading ? (
          <SkeletonRows count={4} />
        ) : (
          <EmptyState
            icon="playlists"
            title="Playlist not found"
            message="It may have been deleted on another device."
          />
        )}
      </KeyboardScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + miniPlayerInset,
    gap: spacing.xl,
  },
  renameBlock: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  renameGroup: {
    gap: spacing.lg,
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  textButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  dangerRow: {
    minHeight: cardTokens.rowMinHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.lg,
  },
});
