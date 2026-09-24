import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { AddToPlaylistButton } from "@/components/add-to-playlist";
import { ContextHistoryButton } from "@/components/context-history";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassChip, GlassProgress, GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useArtworkBackfill } from "@/hooks/use-artwork-backfill";
import { useFolders } from "@/hooks/use-folders";
import { useMissingTracks } from "@/hooks/use-missing-tracks";
import { useRecentPlays } from "@/hooks/use-recent-plays";
import { useTheme } from "@/hooks/use-theme";
import type { FolderSummary, LocalTrack } from "@/lib/db/types";
import { describeFolderProgress, folderProgressRatio } from "@/lib/folderPlay";
import { formatDuration } from "@/lib/history";
import { folderKeyToRouteSegment } from "@/lib/mediaFolders";
import { paletteFor } from "@/lib/palette";
import { formatPlayCount } from "@/lib/playbackContext";
import { describeRecentWhen, recentPlayKey, type RecentPlay } from "@/lib/recentPlays";
import { FolderService } from "@/services/FolderService";
import { LocalDBService } from "@/services/LocalDBService";
import { PlaylistService } from "@/services/PlaylistService";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { radius as radii, spacing } from "@/theme/tokens";

/**
 * The header block occupies reveal indices 1–4 (view toggle, continue card,
 * missing-files alert, add-audio button), so list rows start at 5. Only the
 * opening screenful staggers in — recycled rows past this limit render
 * immediately instead of replaying a 320 ms-delayed fade. See `Reveal`'s `limit`.
 */
const ROW_REVEAL_LIMIT = 12;
const FIRST_ROW_REVEAL_INDEX = 5;

/**
 * How many files one Library visit examines for cover art. Small on purpose:
 * the read is real I/O on the JS thread, and the whole point of the bounded,
 * self-stamping pass is that the next visit picks up where this one stopped.
 */
const ARTWORK_BACKFILL_BATCH = 8;

/**
 * How many distinct recent plays the Recent tab shows. Short on purpose — it is
 * a way back to what you were doing, not a second history screen.
 */
const RECENT_LIMIT = 12;

type LibraryView = "tracks" | "folders" | "recent";

function formatLastPlayed(value: number | null): string {
  if (!value) {
    return "Never played";
  }
  return `Last played ${new Date(value).toLocaleDateString()}`;
}

function describeTrackCount(count: number): string {
  return `${count} track${count === 1 ? "" : "s"}`;
}

export default function LibraryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [view, setView] = useState<LibraryView>("tracks");
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const { folders, refresh: refreshFolders } = useFolders();
  const { missing, refresh: refreshMissing } = useMissingTracks();
  const { recent, refresh: refreshRecent } = useRecentPlays(RECENT_LIMIT);
  const { run: runArtworkBackfill } = useArtworkBackfill();

  const continueTrack = useMemo(
    () =>
      tracks
        .filter((item) => item.lastPlayedAt !== null)
        .sort((left, right) => (right.lastPlayedAt ?? 0) - (left.lastPlayedAt ?? 0))[0],
    [tracks],
  );

  const wash = continueTrack ? paletteFor(continueTrack.contentHash)[1] : theme.accent;

  /**
   * Fills in cover art for tracks imported before it was extracted, then
   * re-reads the rows only if something was found. Deliberately not awaited by
   * `refresh`: the list has to paint from the rows already in hand, and a tile
   * upgrading from a letter to a cover a moment later costs nothing.
   *
   * Bounded and self-stamping, so the first visits do real work and every visit
   * after that is one cheap query returning nothing.
   */
  const backfillCovers = useCallback(async () => {
    const found = await runArtworkBackfill(ARTWORK_BACKFILL_BATCH);
    if (found === 0) {
      return;
    }
    setTracks(await LocalDBService.getAllTracks());
    // A folder card draws its cover from one of its members, so it moves too.
    await refreshFolders();
  }, [refreshFolders, runArtworkBackfill]);

  const refresh = useCallback(async () => {
    const [allTracks, counts] = await Promise.all([
      LocalDBService.getAllTracks(),
      LocalDBService.getAnnotationCounts(),
    ]);
    setTracks(allTracks);
    setAnnotationCounts(counts);
    // Folders are derived from the tracks table, so a rescan or an import can
    // add one without any screen noticing; re-read on focus alongside them.
    await refreshFolders();
    // A relink writes to the tracks table too, so the alert has to re-read or
    // it would keep offering to fix something already fixed.
    await refreshMissing();
    // Recent plays are read from the sessions table, which playback writes to
    // without this screen knowing — so it goes stale for the same reason.
    await refreshRecent();
    void backfillCovers();
  }, [backfillCovers, refreshFolders, refreshMissing, refreshRecent]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const playAt = useCallback(
    (index: number) => {
      const ids = tracks.map((track) => track.id);
      const trackId = ids[index];
      if (!trackId) {
        return;
      }
      // The whole library becomes the queue, so next/previous step through it.
      void TrackPlayerService.playQueueAt(ids, index);
      router.push({ pathname: "/player", params: { trackId } });
    },
    [router, tracks],
  );

  /**
   * Plays one track on its own, as the queue.
   *
   * Deliberately not `playAt`: the Recent tab's track rows are shortcuts to a
   * single file, and making the whole library the queue behind it would turn
   * "play this again" into "start the library from here".
   */
  const playTrack = useCallback(
    (trackId: string) => {
      void TrackPlayerService.playQueueAt([trackId], 0);
      router.push({ pathname: "/player", params: { trackId } });
    },
    [router],
  );

  const openFolder = useCallback(
    (folderKey: string) => {
      // Param object rather than an interpolated path: a folder key contains
      // slashes (`Lectures/Physics`) and has to be encoded as one segment. The
      // storage-root folder needs a stand-in too, since its key is empty.
      router.push({
        pathname: "/folder/[key]",
        params: { key: folderKeyToRouteSegment(folderKey) },
      });
    },
    [router],
  );

  /**
   * Plays a folder straight from its card, without opening it. This is the
   * whole point of folder play — one tap continues the course from wherever the
   * listener stopped, so it must not cost a navigation first.
   */
  const playFolder = useCallback(
    async (folderKey: string) => {
      const entryId = await FolderService.play(folderKey, "resume");
      if (entryId) {
        router.push({ pathname: "/player", params: { trackId: entryId } });
      }
    },
    [router],
  );

  const openPlaylist = useCallback(
    (playlistId: string) => {
      router.push({ pathname: "/playlist/[id]", params: { id: playlistId } });
    },
    [router],
  );

  /** Plays a playlist as a collection, so the play-through is recorded. */
  const playPlaylist = useCallback(
    async (playlistId: string) => {
      const entryId = await PlaylistService.play(playlistId, 0);
      if (entryId) {
        router.push({ pathname: "/player", params: { trackId: entryId } });
      }
    },
    [router],
  );

  // Importing happens on its own screen; `useFocusEffect` above refreshes the
  // list when the user comes back from it.
  const onImport = useCallback(() => {
    router.push("/import");
  }, [router]);

  const header = (
    <View style={styles.headerBlock}>
      <ScreenHeader
        overline="YOUR LISTENING SPACE"
        title="Library"
        subtitle={tracks.length > 0 ? `${tracks.length} tracks` : undefined}
        action={
          <BouncyIconButton
            name="settings"
            accessibilityLabel="Settings"
            size={42}
            iconSize={20}
            tone="glass"
            onPress={() => router.push("/settings")}
          />
        }
      />

      <Reveal index={1}>
        {/* Three chips share the row equally rather than sizing to their
            labels. "Tracks / Folders / Recent" at the chip's own padding is
            wider than a small phone's content column, and a clipped third
            option is worse than a tighter one. */}
        <View style={styles.viewToggle}>
          <GlassChip
            label="Tracks"
            icon="music"
            selected={view === "tracks"}
            onPress={() => setView("tracks")}
            style={styles.viewChip}
          />
          <GlassChip
            label="Folders"
            icon="folder"
            selected={view === "folders"}
            onPress={() => setView("folders")}
            style={styles.viewChip}
          />
          <GlassChip
            label="Recent"
            icon="history"
            selected={view === "recent"}
            onPress={() => setView("recent")}
            style={styles.viewChip}
          />
        </View>
      </Reveal>

      {continueTrack ? (
        <Reveal index={2}>
          <GlassSurface tone="surfaceStrong" style={styles.continueCard}>
            <ElasticPressable
              accessibilityRole="button"
              accessibilityLabel={`Continue listening to ${continueTrack.title}`}
              onPress={() => {
                const index = tracks.findIndex((track) => track.id === continueTrack.id);
                playAt(index >= 0 ? index : 0);
              }}
              style={styles.continueMain}>
              <PaletteTile
                ramp={paletteFor(continueTrack.contentHash)}
                label={continueTrack.title}
                source={continueTrack.artworkUrl}
                size={58}
                radius={16}
              />
              <View style={styles.continueCopy}>
                <ThemedText type="overline" themeColor="textTertiary">
                  CONTINUE LISTENING
                </ThemedText>
                <ThemedText type="bodyStrong" numberOfLines={2}>
                  {continueTrack.title}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {continueTrack.totalPlayCount} play
                  {continueTrack.totalPlayCount === 1 ? "" : "s"}
                </ThemedText>
              </View>
            </ElasticPressable>

            <BouncyIconButton
              name="play"
              accessibilityLabel={`Play ${continueTrack.title}`}
              size={52}
              iconSize={22}
              tone="accent"
              style={{ backgroundColor: paletteFor(continueTrack.contentHash)[1] }}
              onPress={() => {
                const index = tracks.findIndex((track) => track.id === continueTrack.id);
                playAt(index >= 0 ? index : 0);
              }}
            />
          </GlassSurface>
        </Reveal>
      ) : null}

      {/* Only when something is actually broken. A standing "0 files missing"
          banner would just train the listener to ignore it. */}
      {missing.length > 0 ? (
        <Reveal index={3}>
          <GlassSurface tone="surfaceStrong" style={styles.missingCard}>
            <ElasticPressable
              accessibilityRole="button"
              accessibilityLabel={`${missing.length} file${missing.length === 1 ? "" : "s"} missing. Find them again.`}
              onPress={() => router.push("/missing")}
              style={styles.missingMain}>
              <Icon name="alert" size={20} color={theme.danger} />
              <View style={styles.missingCopy}>
                <ThemedText type="bodyStrong" numberOfLines={1}>
                  {missing.length} file{missing.length === 1 ? "" : "s"} missing
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                  Your history is still here — find them again
                </ThemedText>
              </View>
              <Icon name="chevronRight" size={16} color={theme.textTertiary} />
            </ElasticPressable>
          </GlassSurface>
        </Reveal>
      ) : null}

      <Reveal index={4}>
        <PrimaryButton label="Add audio" onPress={onImport} />
      </Reveal>
    </View>
  );

  /**
   * A folder card, shared by the Folders tab and the Recent tab.
   *
   * One implementation rather than two, so the same folder cannot show a
   * different progress figure or a different set of buttons depending on which
   * tab it was reached from. `when` is the only thing Recent adds, and it goes
   * last in the fact line so it is the first clause to ellipsise.
   */
  const renderFolder = (folder: FolderSummary, index: number, when?: string) => {
    const ramp = paletteFor(folder.key);
    return (
      <Reveal
        index={FIRST_ROW_REVEAL_INDEX + index}
        from="below"
        limit={ROW_REVEAL_LIMIT}>
        <GlassSurface flat style={styles.row}>
          <ElasticPressable
            accessibilityRole="button"
            accessibilityLabel={`Open folder ${folder.name}`}
            onPress={() => openFolder(folder.key)}
            style={styles.rowMain}>
            <PaletteTile
              ramp={ramp}
              label={folder.name}
              source={folder.artworkUrl}
              size={44}
              radius={13}
            />
            <View style={styles.rowCopy}>
              <ThemedText type="bodyStrong" numberOfLines={1}>
                {folder.name}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                {/* Progress first, so a card that runs out of width ellipsises
                    the play count rather than the thing being tracked. */}
                {[
                  describeFolderProgress(folder.finishedCount, folder.trackCount),
                  folder.totalDurationSec > 0 ? formatDuration(folder.totalDurationSec) : null,
                  formatPlayCount(folder.playCount),
                  when ?? null,
                ]
                  .filter((part): part is string => part !== null)
                  .join(" · ")}
              </ThemedText>
              <GlassProgress
                progress={folderProgressRatio(folder.finishedCount, folder.trackCount)}
                tint={ramp[1]}
                thickness={4}
                style={styles.folderBar}
              />
            </View>
          </ElasticPressable>

          <BouncyIconButton
            name="play"
            accessibilityLabel={`Play folder ${folder.name}`}
            size={40}
            iconSize={18}
            tone="glass"
            onPress={() => void playFolder(folder.key)}
          />

          {/* The folder's contents are not loaded on this screen, so the ids are
              resolved on tap rather than per card. Missing files are left out,
              matching the folder screen: a playlist is a promise to play
              something later, and a file whose bytes are gone cannot keep it.

              No subtitle, so the sheet counts what was actually resolved
              instead of repeating the card's total and disagreeing with it. */}
          <AddToPlaylistButton
            title={folder.name}
            ramp={ramp}
            artwork={folder.artworkUrl}
            isBatch
            size={40}
            iconSize={18}
            tone="glass"
            resolveTrackIds={async () =>
              (await LocalDBService.getTracksByFolder(folder.key))
                .filter((track) => track.availability !== "missing")
                .map((track) => track.id)
            }
          />

          <ContextHistoryButton
            type="folder"
            contextKey={folder.key}
            title={folder.name}
            artwork={folder.artworkUrl}
            size={40}
            iconSize={18}
            tone="glass"
          />
        </GlassSurface>
      </Reveal>
    );
  };

  const renderPlaylist = (play: Extract<RecentPlay, { kind: "playlist" }>, index: number) => {
    const { playlist } = play;
    const ramp = paletteFor(playlist.title);
    return (
      <Reveal index={FIRST_ROW_REVEAL_INDEX + index} from="below" limit={ROW_REVEAL_LIMIT}>
        <GlassSurface flat style={styles.row}>
          <ElasticPressable
            accessibilityRole="button"
            accessibilityLabel={`Open playlist ${playlist.title}`}
            onPress={() => openPlaylist(playlist.id)}
            style={styles.rowMain}>
            <PaletteTile ramp={ramp} label={playlist.title} size={44} radius={13} />
            <View style={styles.rowCopy}>
              <ThemedText type="bodyStrong" numberOfLines={1}>
                {playlist.title}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                {[describeTrackCount(playlist.items.length), describeRecentWhen(play.lastPlayedAt)]
                  .filter((part) => part.length > 0)
                  .join(" · ")}
              </ThemedText>
            </View>
          </ElasticPressable>

          <BouncyIconButton
            name="play"
            accessibilityLabel={`Play playlist ${playlist.title}`}
            size={40}
            iconSize={18}
            tone="glass"
            onPress={() => void playPlaylist(playlist.id)}
          />

          {/* Resolved through the service rather than from the playlist's stored
              items, so this hands over exactly the queue playback would use —
              and drops missing files for the same reason the folder card does. */}
          <AddToPlaylistButton
            title={playlist.title}
            ramp={ramp}
            isBatch
            size={40}
            iconSize={18}
            tone="glass"
            resolveTrackIds={async () => {
              const detail = await PlaylistService.loadDetail(playlist.id);
              return (detail?.tracks ?? [])
                .filter((track) => track.availability !== "missing")
                .map((track) => track.id);
            }}
          />

          <ContextHistoryButton
            type="playlist"
            contextKey={playlist.id}
            title={playlist.title}
            size={40}
            iconSize={18}
            tone="glass"
          />
        </GlassSurface>
      </Reveal>
    );
  };

  const renderRecentTrack = (play: Extract<RecentPlay, { kind: "track" }>, index: number) => {
    const { track } = play;
    return (
      <Reveal index={FIRST_ROW_REVEAL_INDEX + index} from="below" limit={ROW_REVEAL_LIMIT}>
        <GlassSurface flat style={styles.row}>
          <ElasticPressable
            accessibilityRole="button"
            accessibilityLabel={`Play ${track.title}`}
            onPress={() => playTrack(track.id)}
            style={styles.rowMain}>
            <PaletteTile
              ramp={paletteFor(track.contentHash)}
              label={track.title}
              source={track.artworkUrl}
              size={44}
              radius={13}
            />
            <View style={styles.rowCopy}>
              <ThemedText type="bodyStrong" numberOfLines={1}>
                {track.title}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                {[
                  `${track.totalPlayCount} play${track.totalPlayCount === 1 ? "" : "s"}`,
                  describeRecentWhen(play.lastPlayedAt),
                ].join(" · ")}
              </ThemedText>
            </View>
          </ElasticPressable>

          {/* A bare track has no collection to show history for, so it gets the
              same pair the Tracks tab gives it: add to a playlist, and open the
              track — where its own sessions are listed. */}
          <AddToPlaylistButton
            trackIds={[track.id]}
            title={track.title}
            ramp={paletteFor(track.contentHash)}
            artwork={track.artworkUrl}
            size={34}
            iconSize={16}
            tone="ghost"
          />

          <BouncyIconButton
            name="chevronRight"
            accessibilityLabel={`Details for ${track.title}`}
            size={34}
            iconSize={16}
            tone="ghost"
            onPress={() => router.push(`/track/${track.id}`)}
          />
        </GlassSurface>
      </Reveal>
    );
  };

  const renderRecent = (play: RecentPlay, index: number) => {
    const when = describeRecentWhen(play.lastPlayedAt);
    switch (play.kind) {
      case "folder":
        return renderFolder(play.folder, index, when);
      case "playlist":
        return renderPlaylist(play, index);
      case "track":
        return renderRecentTrack(play, index);
    }
  };

  return (
    <Screen wash={wash}>
      {view === "tracks" ? (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              No tracks yet. Add an audio file to start listening.
            </ThemedText>
          }
          renderItem={({ item, index }) => {
            const notes = annotationCounts[item.id] ?? 0;
            return (
              <Reveal
                index={FIRST_ROW_REVEAL_INDEX + index}
                from="below"
                limit={ROW_REVEAL_LIMIT}>
                <GlassSurface flat style={styles.row}>
                  <ElasticPressable
                    accessibilityRole="button"
                    accessibilityLabel={`Play ${item.title}`}
                    onPress={() => playAt(index)}
                    style={styles.rowMain}>
                    <PaletteTile
                      ramp={paletteFor(item.contentHash)}
                      label={item.title}
                      source={item.artworkUrl}
                      size={44}
                      radius={13}
                    />
                    <View style={styles.rowCopy}>
                      <ThemedText type="bodyStrong" numberOfLines={1}>
                        {item.title}
                      </ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                        {item.totalPlayCount} play{item.totalPlayCount === 1 ? "" : "s"} · {notes}{" "}
                        note{notes === 1 ? "" : "s"}
                      </ThemedText>
                      <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
                        {formatLastPlayed(item.lastPlayedAt)}
                      </ThemedText>
                    </View>
                  </ElasticPressable>

                  <AddToPlaylistButton
                    trackIds={[item.id]}
                    title={item.title}
                    ramp={paletteFor(item.contentHash)}
                    artwork={item.artworkUrl}
                    size={34}
                    iconSize={16}
                    tone="ghost"
                  />

                  <BouncyIconButton
                    name="chevronRight"
                    accessibilityLabel={`Details for ${item.title}`}
                    size={34}
                    iconSize={16}
                    tone="ghost"
                    onPress={() => router.push(`/track/${item.id}`)}
                  />
                </GlassSurface>
              </Reveal>
            );
          }}
        />
      ) : view === "folders" ? (
        <FlatList
          data={folders}
          keyExtractor={(item) => item.key || "root"}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              No folders yet. They appear automatically once your audio sits in folders on the
              device.
            </ThemedText>
          }
          renderItem={({ item, index }) => renderFolder(item, index)}
        />
      ) : (
        <FlatList
          data={recent}
          keyExtractor={recentPlayKey}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              Nothing played yet. Whatever you listen to next — a track, a playlist, or a whole
              folder — shows up here.
            </ThemedText>
          }
          renderItem={({ item, index }) => renderRecent(item, index)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + 96,
  },
  headerBlock: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  viewToggle: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  viewChip: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    paddingRight: spacing.lg,
    borderRadius: 26,
  },
  continueMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    minWidth: 0,
  },
  continueCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  missingCard: {
    borderRadius: 22,
  },
  missingMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    minWidth: 0,
  },
  missingCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
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
  folderBar: {
    marginTop: spacing.xs,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
