/**
 * One online collection — a show, a course, an album.
 *
 * The screen the whole feature exists for: stream it, keep it, or carry on
 * where you left off. It is deliberately the same shape as the folder screen,
 * because from the listener's side it *is* a folder — a numbered series they are
 * part-way through — and the only difference is where the bytes live.
 *
 * Three things it takes care to get right:
 *
 *   1. **The first tap plays.** No intermediate "are you sure". The primary
 *      action is Continue when there is a place to continue from, Play when
 *      there is not, and Play again when the collection is finished.
 *   2. **Streaming and downloading are not alternatives.** Every row streams;
 *      downloading is what makes it survive a tunnel. So the download control
 *      sits beside the play controls, not instead of them.
 *   3. **It says when it is lying.** If the source could not be reached and the
 *      list came from the device, the screen says so — a stale list presented as
 *      fresh is how a listener ends up trusting the wrong thing.
 */

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { DownloadControl } from "@/components/online/download-progress";
import { OnlineTrackRow } from "@/components/online/online-track-row";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { GlassChip, GlassProgress } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useOnlineCollection } from "@/hooks/use-online-collection";
import { useTheme } from "@/hooks/use-theme";
import type { FolderPlayMode } from "@/lib/folderPlay";
import { formatDuration } from "@/lib/history";
import {
  buildSeriesSections,
  describeKnownTrackCount,
  describeTrackCount,
  findSource,
  isRtlText,
} from "@/lib/online";
import { paletteFor } from "@/lib/palette";
import { describeContextStats } from "@/lib/playbackContext";
import { OnlineCatalogService } from "@/services/OnlineCatalogService";
import { OnlineCollectionService } from "@/services/OnlineCollectionService";
import { usePlayerStore } from "@/store/playerStore";
import { spacing } from "@/theme/tokens";

/**
 * A section header's alignment, decided by its own text.
 *
 * A Persian series title left-aligned in a left-to-right layout reads as a
 * rendering bug, and the trailing bucket's English label would read as one if it
 * were flipped. Same rule the rows already use, applied to the header above them.
 */
function rtlStyle(text: string) {
  return isRtlText(text) ? styles.rtl : undefined;
}

export default function OnlineCollectionScreen() {
  const params = useLocalSearchParams<{ key?: string }>();
  const key = params.key ?? null;
  const router = useRouter();
  const theme = useTheme();
  const collection = useOnlineCollection(key);
  const [notice, setNotice] = useState<string | null>(null);
  /** So the row that is actually playing says so, rather than every row lying. */
  const currentTrackId = usePlayerStore((state) => state.trackId);

  const {
    meta,
    tracks,
    progress,
    finishedCount,
    totalDurationSec,
    stats,
    jobsByTrack,
    fromCache,
    loading,
    error,
    download,
    refresh,
    startDownload,
    cancelDownload,
    retryDownload,
    deleteDownload,
  } = collection;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  /**
   * What the planner needs, in one object.
   *
   * Memoised on its three inputs so `plan` is not rebuilt on every render — a
   * new object each render would make every `useMemo` below it useless and
   * re-plan the queue while the listener is looking at it.
   */
  const data = useMemo(
    () => (meta ? { meta, tracks, progress } : null),
    [meta, tracks, progress],
  );

  const source = meta ? findSource(meta.sourceId) : null;
  // Seeded on the collection key, so the artwork fallback matches the card the
  // listener tapped to get here.
  const ramp = paletteFor(key ?? "");

  const unfinishedCount = tracks.length - finishedCount;

  const subtitle = useMemo(() => {
    const parts = [describeTrackCount(tracks.length)];
    if (totalDurationSec > 0) {
      parts.push(formatDuration(totalDurationSec));
    }
    const played = describeContextStats(stats);
    if (played) {
      parts.push(played);
    }
    return parts.join(" · ");
  }, [tracks.length, totalDurationSec, stats]);

  const completion = useMemo(() => {
    if (tracks.length === 0) {
      return null;
    }
    if (finishedCount <= 0) {
      return "Not started";
    }
    if (finishedCount >= tracks.length) {
      return "Finished";
    }
    return `${finishedCount} of ${tracks.length} finished`;
  }, [finishedCount, tracks.length]);

  /**
   * The collection's tracks, grouped into the series they actually are.
   *
   * Null when grouping would not help. A shelf whose every episode is a one-off
   * — «خلاصه کتاب», where a summary is one per book — groups into a single
   * "Standalone episodes" bucket, which is the flat list with a header on it. So
   * the test is not "did anything group" but "is there more than one section",
   * and a collection that is one series reads as the list it always was.
   */
  const sections = useMemo(() => {
    const grouped = buildSeriesSections(tracks);
    return grouped.length > 1 ? grouped : null;
  }, [tracks]);

  /**
   * Reveal indices, laid out in reading order.
   *
   * A running counter rather than an index derived from the row: a section
   * header takes a slot of its own, so the row's index alone would animate the
   * second section's first row before the first section's last.
   *
   * Rows are numbered inside their section, not by collection position. A
   * collection's own order is a publish date across *all* of its series, so the
   * positions within one series are not consecutive — «ماجرای شیعه» would read
   * 01, 04, 07 and look broken. Restricted to a series, 01, 02, 03 is both true
   * and readable, and the header carries the name and how many parts there are.
   */
  const blocks = useMemo(() => {
    if (!sections) {
      return null;
    }
    let index = 4;
    return sections.map((section) => {
      const headerIndex = index;
      index += 1;
      const rows = section.tracks.map((track, position) => {
        const revealIndex = index;
        index += 1;
        return { track, position: position + 1, revealIndex };
      });
      return { section, headerIndex, rows };
    });
  }, [sections]);

  /**
   * Start the collection, from a chosen plan.
   *
   * Shared by the primary button and every row, so tapping episode nine and
   * pressing Continue can never disagree about the order the course plays in.
   */
  const start = useCallback(
    async (mode: FolderPlayMode | { trackId: string }) => {
      if (!key || !data) {
        return;
      }
      setNotice(null);
      const next =
        typeof mode === "string"
          ? OnlineCollectionService.plan(data, mode)
          : OnlineCollectionService.planFromTrack(data, mode.trackId);
      if (!next) {
        return;
      }
      const entryId = await OnlineCollectionService.startPlan(data, next);
      if (entryId) {
        router.push({ pathname: "/player", params: { trackId: entryId } });
      }
    },
    [data, key, router],
  );

  const primaryLabel =
    tracks.length === 0
      ? "Play"
      : finishedCount === 0
        ? "Play"
        : finishedCount >= tracks.length
          ? "Play again"
          : "Continue";

  const onToggleFavorite = useCallback(async () => {
    if (!meta) {
      return;
    }
    await OnlineCatalogService.setFavorite(meta.key, !meta.isFavorite);
    await refresh();
  }, [meta, refresh]);

  const onAddToQueue = useCallback(async () => {
    if (!key) {
      return;
    }
    const added = await OnlineCollectionService.enqueue(key, "resume");
    setNotice(added > 0 ? `Added ${added} track${added === 1 ? "" : "s"} to the queue.` : null);
  }, [key]);

  /**
   * Remove the downloaded audio, keeping the collection.
   *
   * Confirmed, because it is the one action on this screen that destroys
   * something the listener waited for. The wording says what survives: on a
   * screen made of play buttons, "delete" could reasonably be read as deleting
   * the course itself, and that is not what happens.
   */
  const confirmDeleteDownload = useCallback(() => {
    if (!meta) {
      return;
    }
    const arrived = download?.done ?? 0;
    Alert.alert(
      arrived > 0 ? "Delete the downloaded audio?" : "Discard this download?",
      arrived > 0
        ? `${arrived} track${arrived === 1 ? "" : "s"} will be removed from this device. "${meta.title}" stays saved, keeps its history, and still streams.`
        : `"${meta.title}" stays saved. Nothing has arrived yet, so only the download queue is cleared.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteDownload();
          },
        },
      ],
    );
  }, [deleteDownload, download, meta]);

  const onOpenSource = useCallback(() => {
    if (!meta?.pageUrl) {
      return;
    }
    void Linking.openURL(meta.pageUrl).catch(() => undefined);
  }, [meta]);

  return (
    <Screen wash={ramp[1]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          onBack={() => router.back()}
          overline={source ? source.name.toUpperCase() : "ONLINE"}
          title={meta?.title ?? "Collection"}
          subtitle={loading && tracks.length === 0 ? "Loading…" : subtitle}
          action={
            <View style={styles.headerActions}>
              {meta ? (
                <BouncyIconButton
                  name={meta.isFavorite ? "bookmarkFilled" : "bookmark"}
                  accessibilityLabel={
                    meta.isFavorite ? "Remove from favorites" : "Save to favorites"
                  }
                  size={42}
                  iconSize={20}
                  tone="glass"
                  color={meta.isFavorite ? theme.accent : undefined}
                  onPress={() => void onToggleFavorite()}
                />
              ) : null}
              {meta?.pageUrl ? (
                <BouncyIconButton
                  name="external"
                  accessibilityLabel="Open on the source's site"
                  size={42}
                  iconSize={20}
                  tone="glass"
                  onPress={onOpenSource}
                />
              ) : null}
            </View>
          }
        />

        {meta ? (
          <Reveal index={0}>
            {/* The hero carries the two things the header cannot: the cover, and
                how far through the collection the listener is. The title is
                deliberately absent — it is already the header's, and a screen
                that says its own name twice reads as a template. */}
            <Card style={styles.hero}>
              <PaletteTile
                ramp={ramp}
                label={meta.title}
                source={meta.artworkUrl}
                size={76}
                radius={18}
              />
              <View style={styles.heroCopy}>
                <ThemedText type="overline" themeColor="textTertiary" numberOfLines={1}>
                  {(source?.nativeName ?? "Online").toUpperCase()}
                </ThemedText>
                <GlassProgress
                  progress={tracks.length > 0 ? finishedCount / tracks.length : 0}
                  tint={theme.accent}
                  thickness={5}
                />
                <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                  {completion ?? describeKnownTrackCount(meta.trackCount)}
                </ThemedText>
              </View>
            </Card>
          </Reveal>
        ) : null}

        {error ? (
          <ThemedText type="caption" style={{ color: theme.danger }}>
            {error}
          </ThemedText>
        ) : null}

        {fromCache && !error ? (
          <ThemedText type="caption" themeColor="textTertiary">
            Showing what is already on this device — the source could not be reached.
          </ThemedText>
        ) : null}

        {tracks.length > 0 ? (
          <>
            <Reveal index={1}>
              <PrimaryButton label={primaryLabel} onPress={() => void start("resume")} />
            </Reveal>

            <Reveal index={2}>
              <View style={styles.actions}>
                <GlassChip
                  label="Shuffle"
                  onPress={() => void start("shuffle")}
                />
                {unfinishedCount > 0 && unfinishedCount < tracks.length ? (
                  <GlassChip
                    label={`Unfinished only (${unfinishedCount})`}
                    onPress={() => void start("unfinished")}
                  />
                ) : null}
                <GlassChip label="Add to queue" onPress={() => void onAddToQueue()} />
                <DownloadControl
                  summary={download}
                  onStart={() => void startDownload()}
                  onCancel={() => void cancelDownload()}
                  onRetry={() => void retryDownload()}
                  onDelete={confirmDeleteDownload}
                />
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
                  {sections ? "SERIES" : "TRACKS"}
                </ThemedText>
              </Reveal>

              {blocks ? (
                blocks.map((block) => (
                  <View key={block.section.key} style={styles.series}>
                    <Reveal index={block.headerIndex}>
                      <View style={styles.seriesHeader}>
                        <View style={styles.seriesCopy}>
                          <ThemedText
                            type="bodyStrong"
                            numberOfLines={2}
                            style={rtlStyle(block.section.title)}>
                            {block.section.title}
                          </ThemedText>
                          <ThemedText
                            type="caption"
                            themeColor="textTertiary"
                            style={rtlStyle(block.section.title)}>
                            {describeTrackCount(block.section.tracks.length)}
                          </ThemedText>
                        </View>
                        {/* The trailing bucket is not a series, so it gets no play
                            control: "play the standalone episodes from the
                            beginning" names no unit at all. A real series does —
                            and its control starts at the series' first episode
                            while the queue stays the whole collection, because a
                            series is a reading of one list rather than a second
                            one. Playback therefore carries on into whatever the
                            collection plays next. */}
                        {block.section.standalone ? null : (
                          <BouncyIconButton
                            name="play"
                            accessibilityLabel={`Play ${block.section.title} from the beginning`}
                            size={36}
                            iconSize={16}
                            tone="glass"
                            onPress={() =>
                              void start({ trackId: block.section.tracks[0].id })
                            }
                          />
                        )}
                      </View>
                    </Reveal>

                    {block.rows.map((row) => (
                      <Reveal key={row.track.id} index={row.revealIndex}>
                        <OnlineTrackRow
                          track={row.track}
                          position={row.position}
                          isCurrent={currentTrackId === row.track.id}
                          job={jobsByTrack[row.track.id] ?? null}
                          onPress={() => void start({ trackId: row.track.id })}
                        />
                      </Reveal>
                    ))}
                  </View>
                ))
              ) : (
                tracks.map((track, index) => (
                  <Reveal key={track.id} index={index + 4}>
                    <OnlineTrackRow
                      track={track}
                      position={index + 1}
                      isCurrent={currentTrackId === track.id}
                      job={jobsByTrack[track.id] ?? null}
                      onPress={() => void start({ trackId: track.id })}
                    />
                  </Reveal>
                ))
              )}
            </View>
          </>
        ) : (
          <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
            {loading ? "Loading…" : "This collection has no playable audio."}
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  series: {
    gap: spacing.sm,
    // Sections sit a level above rows, so they are spaced further apart than the
    // rows inside them — otherwise a header reads as one more row.
    marginTop: spacing.md,
  },
  seriesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  seriesCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  rtl: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
