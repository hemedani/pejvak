import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassChip, GlassSurface } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useFolderDetail } from "@/hooks/use-folder-detail";
import { useTheme } from "@/hooks/use-theme";
import type { LocalTrack } from "@/lib/db/types";
import { describeFolderProgress, describeMissing } from "@/lib/folderPlay";
import { formatDuration } from "@/lib/history";
import { folderKeyFromRouteSegment } from "@/lib/mediaFolders";
import { paletteFor } from "@/lib/palette";
import { formatClock } from "@/lib/time";
import { FolderService } from "@/services/FolderService";
import { spacing } from "@/theme/tokens";

/** How a row's state line should read, before the theme resolves it to a colour. */
type TrackStateTone = "secondary" | "tertiary" | "danger";

/**
 * A track's place in the folder, as one short line under its title.
 *
 * "Finished" and "Resume at 8:31" are the two facts that decide whether folder
 * play will skip a track or drop into the middle of it, so they are worth
 * stating rather than leaving to be inferred from a progress bar.
 */
function trackStateLabel(
  progress: { finished: boolean; resumeSec: number } | undefined,
  track: LocalTrack,
): { text: string; tone: TrackStateTone } {
  if (track.availability === "missing") {
    return { text: "File missing", tone: "danger" };
  }
  if (progress?.finished) {
    return { text: "Finished", tone: "tertiary" };
  }
  if (progress && progress.resumeSec > 0) {
    return { text: `Resume at ${formatClock(progress.resumeSec)}`, tone: "secondary" };
  }
  return { text: "Not started", tone: "tertiary" };
}

export default function FolderDetailScreen() {
  const params = useLocalSearchParams<{ key?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const folderKey = folderKeyFromRouteSegment(params.key);
  const { data, loading, refresh } = useFolderDetail(folderKey);
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const tracks = data?.tracks ?? [];

  /**
   * The queue and the entry point are computed once per render and shared by
   * every action, so tapping a row and pressing Continue can never disagree
   * about the order the folder plays in.
   */
  const plan = useMemo(() => (data ? FolderService.plan(data, "resume") : null), [data]);

  const missingNote = useMemo(() => describeMissing(plan?.missingCount ?? 0), [plan]);

  const unfinishedCount = data ? data.tracks.length - data.finishedCount : 0;
  const playableCount = plan?.queueIds.length ?? 0;

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
          subtitle={
            data
              ? `${describeFolderProgress(data.finishedCount, data.tracks.length)}${
                  data.totalDurationSec > 0 ? ` · ${formatDuration(data.totalDurationSec)}` : ""
                }`
              : loading
                ? "Loading…"
                : undefined
          }
        />

        {missingNote ? (
          <Reveal index={0}>
            <ThemedText type="caption" style={{ color: theme.danger }}>
              {missingNote} — those tracks are skipped during folder play.
            </ThemedText>
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

            {notice ? (
              <ThemedText type="caption" themeColor="textSecondary">
                {notice}
              </ThemedText>
            ) : null}

            <View style={styles.section}>
              <Reveal index={3}>
                <ThemedText type="overline" themeColor="textTertiary">
                  TRACKS
                </ThemedText>
              </Reveal>

              {tracks.map((track, index) => {
                const state = trackStateLabel(data.progress[track.id], track);
                const missing = track.availability === "missing";
                const stateColor =
                  state.tone === "danger"
                    ? theme.danger
                    : state.tone === "secondary"
                      ? theme.textSecondary
                      : theme.textTertiary;
                return (
                  <Reveal key={track.id} index={index + 4}>
                    <GlassSurface flat style={styles.row}>
                      <ElasticPressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          missing ? `${track.title}, file missing` : `Play ${track.title}`
                        }
                        accessibilityState={{ disabled: missing }}
                        disabled={missing}
                        onPress={() =>
                          void start(() => (data ? FolderService.planFromTrack(data, track.id) : null))
                        }
                        style={styles.rowMain}>
                        <PaletteTile
                          ramp={paletteFor(track.contentHash)}
                          label={track.title}
                          size={40}
                          radius={12}
                        />
                        <View style={styles.rowCopy}>
                          <ThemedText
                            type="bodyStrong"
                            numberOfLines={1}
                            themeColor={missing ? "textTertiary" : undefined}>
                            {track.title}
                          </ThemedText>
                          <ThemedText
                            type="caption"
                            style={{ color: stateColor }}
                            numberOfLines={1}>
                            {state.text}
                          </ThemedText>
                        </View>
                      </ElasticPressable>

                      <ThemedText type="caption" themeColor="textTertiary">
                        {track.durationSec > 0 ? formatClock(track.durationSec) : "—"}
                      </ThemedText>
                    </GlassSurface>
                  </Reveal>
                );
              })}
            </View>
          </>
        ) : (
          <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
            {loading ? "Loading…" : "This folder has no playable audio."}
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
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
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
    gap: spacing.xxs,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
