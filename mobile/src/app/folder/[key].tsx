import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { AddToPlaylistButton } from "@/components/add-to-playlist";
import { ContextHistoryButton } from "@/components/context-history";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassChip } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import {
  addToPlaylistAction,
  EmptyState,
  historyAction,
  InlineNotice,
  ListGroup,
  ListRow,
  SkeletonRows,
} from "@/components/ui/row";
import { useFolderDetail } from "@/hooks/use-folder-detail";
import {
  describeFolderProgress,
  describeFolderTrackStatus,
  describeMissing,
} from "@/lib/folderPlay";
import { formatDuration } from "@/lib/history";
import { folderKeyFromRouteSegment } from "@/lib/mediaFolders";
import { describeContextStats } from "@/lib/playbackContext";
import { paletteFor } from "@/lib/palette";
import { formatClock } from "@/lib/time";
import { FolderService } from "@/services/FolderService";
import { control, iconSize, spacing, tile, tileRadius } from "@/theme/tokens";

export default function FolderDetailScreen() {
  const params = useLocalSearchParams<{ key?: string }>();
  const router = useRouter();
  const folderKey = folderKeyFromRouteSegment(params.key);
  const { data, loading, refresh } = useFolderDetail(folderKey);
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Memoised because `?? []` makes a fresh array on every render, which would
  // make anything derived from it recompute forever.
  const tracks = useMemo(() => data?.tracks ?? [], [data]);

  /**
   * The queue and the entry point are computed once per render and shared by
   * every action, so tapping a row and pressing Continue can never disagree
   * about the order the folder plays in.
   */
  const plan = useMemo(() => (data ? FolderService.plan(data, "resume") : null), [data]);

  const missingNote = useMemo(() => describeMissing(plan?.missingCount ?? 0), [plan]);

  /**
   * What the folder is, how long it runs, and how often it has been heard
   * through. Joining here rather than in the header keeps the `·` in one place,
   * so a folder that has never been played simply drops that clause.
   */
  const subtitle = useMemo(() => {
    if (!data) {
      return undefined;
    }
    return [
      describeFolderProgress(data.finishedCount, data.tracks.length),
      data.totalDurationSec > 0 ? formatDuration(data.totalDurationSec) : null,
      describeContextStats(data.stats),
    ]
      .filter((part): part is string => part !== null)
      .join(" · ");
  }, [data]);

  const unfinishedCount = data ? data.tracks.length - data.finishedCount : 0;
  const playableCount = plan?.queueIds.length ?? 0;

  /**
   * A playlist is a promise to play something later, so the missing files are
   * left out — offering to add a track whose bytes are gone would only produce a
   * playlist that skips itself.
   */
  const addableIds = useMemo(
    () => tracks.filter((track) => track.availability !== "missing").map((track) => track.id),
    [tracks],
  );

  // Same seed the folder card used, so opening a folder keeps its colour —
  // including the storage-root folder, whose key is the empty string.
  const ramp = paletteFor(folderKey ?? "");

  const start = useCallback(
    async (build: () => ReturnType<typeof FolderService.plan> | null) => {
      if (!data) {
        return;
      }
      const next = build();
      if (!next) {
        return;
      }
      // Drop any "added to queue" line: it describes the previous action and
      // would otherwise sit under a folder that is now playing something else.
      setNotice(null);
      const entryId = await FolderService.startPlan(data, next);
      if (entryId) {
        router.push({ pathname: "/player", params: { trackId: entryId } });
      }
    },
    [data, router],
  );

  const primaryLabel = !data
    ? "Play folder"
    : data.finishedCount === 0
      ? "Play folder"
      : data.finishedCount >= data.tracks.length
        ? "Play again"
        : "Continue";

  const onAddToQueue = useCallback(async () => {
    if (!folderKey) {
      return;
    }
    const added = await FolderService.enqueue(folderKey, "resume");
    setNotice(added > 0 ? `Added ${added} track${added === 1 ? "" : "s"} to the queue.` : null);
  }, [folderKey]);

  const onSaveAsPlaylist = useCallback(async () => {
    if (!folderKey) {
      return;
    }
    const playlistId = await FolderService.saveAsPlaylist(folderKey);
    if (playlistId) {
      router.push({ pathname: "/playlist/[id]", params: { id: playlistId } });
    }
  }, [folderKey, router]);

  return (
    <Screen wash={ramp[1]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          onBack={() => router.back()}
          overline="FOLDER"
          title={data?.name ?? "Folder"}
          subtitle={subtitle ?? (loading ? "Loading…" : undefined)}
          action={
            <View style={styles.headerActions}>
              {/* The folder's history, not this track's. The rows below carry
                  the same control for the same reason: a track inside a folder
                  has no history that is not already part of the folder's. */}
              {data ? (
                <ContextHistoryButton
                  type="folder"
                  contextKey={folderKey ?? ""}
                  title={data.name}
                  artwork={data.tracks[0]?.artworkUrl ?? null}
                  size={control.lg}
                  iconSize={iconSize.lg}
                  tone="glass"
                />
              ) : null}
              {addableIds.length > 0 ? (
                <AddToPlaylistButton
                  trackIds={addableIds}
                  title={data?.name ?? "Folder"}
                  subtitle={`${addableIds.length} track${addableIds.length === 1 ? "" : "s"} from this folder`}
                  ramp={ramp}
                  // The folder's own cover is its first track's, matching the
                  // library card this screen was opened from.
                  artwork={data?.tracks[0]?.artworkUrl ?? null}
                  isBatch
                  size={control.lg}
                  iconSize={iconSize.lg}
                  tone="glass"
                />
              ) : null}
            </View>
          }
        />

        {missingNote ? (
          <Reveal index={0}>
            <InlineNotice
              tone="danger"
              title={missingNote}
              message="Those tracks are skipped during folder play."
            />
          </Reveal>
        ) : null}

        {data && data.tracks.length > 0 ? (
          <>
            <Reveal index={1}>
              <PrimaryButton
                label={primaryLabel}
                disabled={playableCount === 0}
                onPress={() => void start(() => plan)}
              />
            </Reveal>

            <Reveal index={2}>
              <View style={styles.actions}>
                <GlassChip
                  label="Shuffle"
                  onPress={() => void start(() => (data ? FolderService.plan(data, "shuffle") : null))}
                />
                {unfinishedCount > 0 && unfinishedCount < data.tracks.length ? (
                  <GlassChip
                    label={`Unfinished only (${unfinishedCount})`}
                    onPress={() =>
                      void start(() => (data ? FolderService.plan(data, "unfinished") : null))
                    }
                  />
                ) : null}
                <GlassChip label="Add to queue" onPress={() => void onAddToQueue()} />
                <GlassChip label="Save as playlist" onPress={() => void onSaveAsPlaylist()} />
              </View>
            </Reveal>

            {notice ? <InlineNotice tone="accent" title={notice} announce /> : null}

            <View style={styles.section}>
              <Reveal index={3}>
                <ThemedText type="overline" themeColor="textTertiary">
                  TRACKS
                </ThemedText>
              </Reveal>

              <ListGroup>
                {tracks.map((track) => {
                  const status = describeFolderTrackStatus(data.progress[track.id], track);
                  const missing = track.availability === "missing";
                  const rowActions = [
                    historyAction({
                      type: "folder",
                      contextKey: folderKey ?? "",
                      title: data.name,
                      artwork: data.tracks[0]?.artworkUrl ?? null,
                    }),
                  ];
                  // A missing file is skipped by folder play, so it is not
                  // offered to a playlist either.
                  if (!missing) {
                    rowActions.push(
                      addToPlaylistAction({
                        title: track.title,
                        ramp: paletteFor(track.contentHash),
                        artwork: track.artworkUrl,
                        trackIds: [track.id],
                      }),
                    );
                  }
                  return (
                    <ListRow
                      key={track.id}
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
                      title={track.title}
                      titleLines={1}
                      status={status}
                      trailing={
                        <ThemedText type="numeric" themeColor="textTertiary">
                          {track.durationSec > 0 ? formatClock(track.durationSec) : "—"}
                        </ThemedText>
                      }
                      disabled={missing}
                      disabledReason="The file is no longer on this device"
                      onPress={() =>
                        void start(() =>
                          data ? FolderService.planFromTrack(data, track.id) : null,
                        )
                      }
                      accessibilityLabel={
                        missing ? `${track.title}, file missing` : `Play ${track.title}`
                      }
                      actions={rowActions}
                    />
                  );
                })}
              </ListGroup>
            </View>
          </>
        ) : loading ? (
          <SkeletonRows count={4} />
        ) : (
          <EmptyState
            icon="folder"
            title="This folder has no playable audio"
            message="Add audio to it, or scan again if the files moved."
          />
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
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
});
