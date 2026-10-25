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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { DownloadControl } from "@/components/online/download-progress";
import { OnlineTrackRow } from "@/components/online/online-track-row";
import { SeriesHeader, type SeriesDownloadTarget } from "@/components/online/series-header";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { GlassChip, GlassProgress } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import {
  EmptyState,
  InlineNotice,
  ListSurface,
  SkeletonRows,
  UserText,
} from "@/components/ui/row";
import { useOnlineCollection } from "@/hooks/use-online-collection";
import { useTheme } from "@/hooks/use-theme";
import { cardWidthFor } from "@/lib/cardLayout";
import type { LocalTrack } from "@/lib/db/types";
import type { FolderPlayMode } from "@/lib/folderPlay";
import { rowPositionFor, type ListRowPosition } from "@/lib/listSurface";
import { formatDuration } from "@/lib/history";
import {
  buildSeriesSections,
  describeKnownTrackCount,
  describeTrackCount,
  findSource,
  seriesScopeKey,
} from "@/lib/online";
import { paletteFor } from "@/lib/palette";
import { describeContextStats } from "@/lib/playbackContext";
import { OnlineCatalogService } from "@/services/OnlineCatalogService";
import { OnlineCollectionService } from "@/services/OnlineCollectionService";
import { usePlayerStore } from "@/store/playerStore";
import {
  bar,
  control,
  iconSize,
  layout,
  miniPlayerInset,
  spacing,
  tile,
  tileRadius,
} from "@/theme/tokens";
import { listPerformance } from "@/lib/listPerformance";

/** Only the opening screenful staggers in; recycled rows render at once. */
const ROW_REVEAL_LIMIT = 10;

/**
 * One `FlatList` cell.
 *
 * A header and its tracks share a section, but they are separate cells so the
 * list can window them independently. `revealIndex` is the *section's* index on
 * both, so every cell of a section animates in lockstep rather than the rows
 * cascading one by one.
 */
type CollectionListItem =
  | {
      kind: "header";
      key: string;
      title: string;
      target: SeriesDownloadTarget | null;
      trackCount: number;
      firstTrackId: string;
      revealIndex: number;
      spaced: boolean;
    }
  | {
      kind: "track";
      key: string;
      track: LocalTrack;
      ordinal: number;
      position: ListRowPosition;
      revealIndex: number;
    };

export default function OnlineCollectionScreen() {
  const params = useLocalSearchParams<{ key?: string }>();
  const key = params.key ?? null;
  const router = useRouter();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = cardWidthFor({
    windowWidth,
    inset: spacing.xl,
    maxContentWidth: layout.maxContentWidth,
  });
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

  /**
   * The planner's input, readable from a stable handler.
   *
   * `start` must keep its identity across progress updates or every mounted
   * row's `onPress` changes and the memoised rows re-render during a download.
   * The ref is written in an effect, never during render, and a tap always
   * happens after that effect has run.
   */
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const source = meta ? findSource(meta.sourceId) : null;
  const isLive = source?.live === true;
  // Read as a primitive so the memo below depends on the value rather than on
  // the whole (re-created) collection row.
  const metaSubtitle = meta?.subtitle ?? null;
  // Seeded on the collection key, so the artwork fallback matches the card the
  // listener tapped to get here.
  const ramp = paletteFor(key ?? "");

  const unfinishedCount = tracks.length - finishedCount;

  const subtitle = useMemo(() => {
    if (isLive) {
      return metaSubtitle ? `Live · ${metaSubtitle}` : "Live stream";
    }
    const parts: string[] = [];
    if (metaSubtitle) {
      parts.push(metaSubtitle);
    }
    parts.push(describeTrackCount(tracks.length));
    if (totalDurationSec > 0) {
      parts.push(formatDuration(totalDurationSec));
    }
    const played = describeContextStats(stats);
    if (played) {
      parts.push(played);
    }
    return parts.join(" · ");
  }, [isLive, metaSubtitle, tracks.length, totalDurationSec, stats]);

  const completion = useMemo(() => {
    if (isLive) {
      return "Live stream";
    }
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
  }, [finishedCount, isLive, tracks.length]);

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
   * The list's items: one per row, not one per block.
   *
   * A block used to hold every episode of a series, which meant a 150-episode
   * course mounted 150 rows on first paint — the exact thing a virtualised list
   * is for. Rows are now the cells, and each one knows its own card edge
   * (`position`) so `ListSurface` can draw one card across many cells.
   *
   * Positions are counted *inside* a series, not by collection order: a
   * collection's own order is a publish date across all its series, so
   * «ماجرای شیعه» would read 01, 04, 07 and look broken. Restricted to a
   * series, 01, 02, 03 is both true and readable, and the header carries the
   * name and how many parts there are.
   */
  const items = useMemo<CollectionListItem[]>(() => {
    if (tracks.length === 0) {
      return [];
    }
    if (!sections) {
      return tracks.map((track, index) => ({
        kind: "track",
        key: `track:${track.id}`,
        track,
        ordinal: index + 1,
        position: rowPositionFor(index, tracks.length),
        revealIndex: 4,
      }));
    }

    const flattened: CollectionListItem[] = [];
    sections.forEach((section, sectionIndex) => {
      const first = section.tracks[0];
      if (!first) {
        return;
      }
      flattened.push({
        kind: "header",
        key: `header:${section.key}`,
        title: section.title,
        // The seed is the first episode's own id, so the scope survives a title
        // edit upstream. The standalone bucket is not a unit, so it gets none.
        target:
          !section.standalone && key
            ? {
                scopeKey: seriesScopeKey(key, first.externalId ?? first.id),
                collectionKey: key,
                title: section.title,
                seriesKey: section.key,
                trackIds: section.tracks.map((track) => track.id),
              }
            : null,
        trackCount: section.tracks.length,
        firstTrackId: first.id,
        revealIndex: sectionIndex + 4,
        spaced: sectionIndex > 0,
      });
      section.tracks.forEach((track, index) => {
        flattened.push({
          kind: "track",
          key: `track:${track.id}`,
          track,
          ordinal: index + 1,
          position: rowPositionFor(index, section.tracks.length),
          revealIndex: sectionIndex + 4,
        });
      });
    });
    return flattened;
  }, [key, sections, tracks]);

  /**
   * Start the collection, from a chosen plan.
   *
   * Shared by the primary button and every row, so tapping episode nine and
   * pressing Continue can never disagree about the order the course plays in.
   */
  const start = useCallback(
    async (mode: FolderPlayMode | { trackId: string }) => {
      const current = dataRef.current;
      if (!key || !current) {
        return;
      }
      setNotice(null);
      const next =
        typeof mode === "string"
          ? OnlineCollectionService.plan(current, mode)
          : OnlineCollectionService.planFromTrack(current, mode.trackId);
      if (!next) {
        return;
      }
      const entryId = await OnlineCollectionService.startPlan(current, next);
      if (entryId) {
        router.push({ pathname: "/player", params: { trackId: entryId } });
      }
    },
    [key, router],
  );

  const playTrack = useCallback(
    (trackId: string) => {
      void start({ trackId });
    },
    [start],
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
      <FlatList
        {...listPerformance}
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.content}>
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
                      size={control.lg}
                      iconSize={iconSize.lg}
                      tone="glass"
                      color={meta.isFavorite ? theme.accent : undefined}
                      onPress={() => void onToggleFavorite()}
                    />
                  ) : null}
                  {meta?.pageUrl ? (
                    <BouncyIconButton
                      name="external"
                      accessibilityLabel="Open on the source's site"
                      size={control.lg}
                      iconSize={iconSize.lg}
                      tone="glass"
                      onPress={onOpenSource}
                    />
                  ) : null}
                </View>
              }
            />

            {meta ? (
              <Reveal index={0}>
                {/* The hero carries the two things the header cannot: the cover,
                    and how far through the collection the listener is. The title
                    is deliberately absent — it is already the header's, and a
                    screen that says its own name twice reads as a template. */}
                <Card style={styles.hero}>
                  <PaletteTile
                    ramp={ramp}
                    label={meta.title}
                    source={meta.artworkUrl}
                    size={tile.hero}
                    radius={tileRadius(tile.hero)}
                  />
                  <View style={styles.heroCopy}>
                    <UserText
                      type="overline"
                      themeColor="textTertiary"
                      numberOfLines={1}
                      text={(source?.nativeName ?? "Online").toUpperCase()}
                    />
                    <GlassProgress
                      progress={tracks.length > 0 ? finishedCount / tracks.length : 0}
                      tint={theme.accent}
                      thickness={bar.thick}
                    />
                    <ThemedText
                      type="caption"
                      themeColor="textSecondary"
                      numberOfLines={1}>
                      {completion ?? describeKnownTrackCount(meta.trackCount)}
                    </ThemedText>
                  </View>
                </Card>
              </Reveal>
            ) : null}

            {error ? (
              <InlineNotice
                tone="danger"
                title="Could not load this collection"
                message={error}
                action={
                  <GlassChip
                    label="Try again"
                    icon="refresh"
                    onPress={() => void refresh()}
                  />
                }
              />
            ) : null}

            {fromCache && !error ? (
              <InlineNotice
                title="Showing what is on this device"
                message="The source could not be reached."
              />
            ) : null}

            {tracks.length > 0 ? (
              <>
                <Reveal index={1}>
                  <PrimaryButton label={primaryLabel} onPress={() => void start("resume")} />
                </Reveal>

                {!isLive ? (
                  <Reveal index={2}>
                    <View style={styles.actions}>
                      <GlassChip label="Shuffle" onPress={() => void start("shuffle")} />
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
                ) : null}

                {notice ? (
                  <InlineNotice tone="accent" title={notice} announce />
                ) : null}

                <Reveal index={3}>
                  <ThemedText type="overline" themeColor="textTertiary">
                    {sections ? "SERIES" : "TRACKS"}
                  </ThemedText>
                </Reveal>
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === "header") {
            return (
              <Reveal index={item.revealIndex} limit={ROW_REVEAL_LIMIT}>
                <View
                  style={[
                    styles.sectionHeader,
                    item.spaced ? styles.sectionHeaderSpaced : null,
                  ]}>
                  {/* The trailing bucket is not a series, so it gets no play
                      control: "play the standalone episodes from the beginning"
                      names no unit at all. A real series does — and its control
                      starts at the series' first episode while the queue stays
                      the whole collection, because a series is a reading of one
                      list rather than a second one. Playback therefore carries
                      on into whatever the collection plays next. */}
                  <SeriesHeader
                    title={item.title}
                    trackCount={item.trackCount}
                    target={item.target}
                    subtitle={meta?.title}
                    artwork={meta?.artworkUrl}
                    ramp={ramp}
                    onPlay={() => playTrack(item.firstTrackId)}
                  />
                </View>
              </Reveal>
            );
          }

          return (
            <Reveal index={item.revealIndex} limit={ROW_REVEAL_LIMIT}>
              <ListSurface position={item.position}>
                <OnlineTrackRow
                  track={item.track}
                  ordinal={item.ordinal}
                  position={item.position}
                  isCurrent={currentTrackId === item.track.id}
                  job={jobsByTrack[item.track.id] ?? null}
                  cardWidth={cardWidth}
                  onPress={playTrack}
                />
              </ListSurface>
            </Reveal>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyBlock}>
              <SkeletonRows count={5} />
            </View>
          ) : error ? null : (
            <EmptyState
              icon="music"
              title="No playable audio"
              message="This collection has no playable audio."
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + miniPlayerInset,
  },
  content: {
    gap: spacing.xl,
    // The header is a cell of its own now, so the breathing room the old
    // `contentContainerStyle` gap gave the first block lives here instead.
    paddingBottom: spacing.xl + spacing.md,
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
  sectionHeader: {
    paddingBottom: spacing.sm,
  },
  sectionHeaderSpaced: {
    // Sections sit a level above rows, so they are spaced further apart than the
    // rows inside them — otherwise a header reads as one more row.
    paddingTop: spacing.xl + spacing.md,
  },
  emptyBlock: {
    paddingTop: spacing.lg,
  },
});
