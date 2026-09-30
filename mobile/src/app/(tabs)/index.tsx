import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { AddToPlaylistButton, useAddToPlaylist } from "@/components/add-to-playlist";
import { ContextHistoryButton } from "@/components/context-history";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassChip, GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { MediaCard, type MediaCardAction } from "@/components/ui/media-card";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SearchField } from "@/components/ui/search-field";
import { useArtworkBackfill } from "@/hooks/use-artwork-backfill";
import { useFolders } from "@/hooks/use-folders";
import { useMissingTracks } from "@/hooks/use-missing-tracks";
import { useRecentPlays } from "@/hooks/use-recent-plays";
import { useTheme } from "@/hooks/use-theme";
import type { FolderSummary, LocalTrack } from "@/lib/db/types";
import { describeFolderProgress, folderProgressRatio } from "@/lib/folderPlay";
import { formatDuration } from "@/lib/history";
import {
  folderSearchFields,
  recentSearchFields,
  TITLE_FIELD,
  trackSearchFields,
} from "@/lib/librarySearch";
import { folderKeyToRouteSegment } from "@/lib/mediaFolders";
import { paletteFor } from "@/lib/palette";
import { formatPlayCount } from "@/lib/playbackContext";
import { describeRecentWhen, recentPlayKey, type RecentPlay } from "@/lib/recentPlays";
import {
  createSearchIndex,
  describeField,
  foldQuery,
  searchIndex,
  type Hit,
  type Range,
  type SearchFieldName,
} from "@/lib/search";
import { FolderService } from "@/services/FolderService";
import { LocalDBService } from "@/services/LocalDBService";
import { PlaylistService } from "@/services/PlaylistService";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { useContextHistoryStore } from "@/store/contextHistoryStore";
import { spacing } from "@/theme/tokens";

/**
 * The header block occupies reveal indices 1–5 (search field, view toggle,
 * continue card, missing-files alert, add-audio button), so list rows start at
 * 6. Only the opening screenful staggers in — recycled rows past this limit
 * render immediately instead of replaying a 320 ms-delayed fade. See `Reveal`'s
 * `limit`.
 */
const ROW_REVEAL_LIMIT = 12;
const FIRST_ROW_REVEAL_INDEX = 6;

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

/**
 * How many distinct recent plays are *read*, against the twelve the tab shows.
 *
 * The read is deliberately wider than the tab, because a search over the twelve
 * rows the tab happens to show would answer "nothing found" for something the
 * listener played a week ago — and a search that lies is worse than no search.
 * It also keeps the Recent chip's count honest: that count is a promise about
 * the whole list, not about the visible part of it.
 *
 * A constant rather than something that depends on the query, on purpose. A
 * limit that changed when a search started would change the hook's identity,
 * which would re-read the sessions table on the first keystroke and again when
 * the field was cleared. The tab slices this back to `RECENT_LIMIT` instead.
 */
const RECENT_READ_LIMIT = 60;

type LibraryView = "tracks" | "folders" | "recent";

/** The three views, and the words the chips and the hint use for them. */
const VIEW_LABELS: Record<LibraryView, string> = {
  tracks: "Tracks",
  folders: "Folders",
  recent: "Recent",
};

type TrackHit = Hit<LocalTrack, SearchFieldName>;
type FolderHit = Hit<FolderSummary, SearchFieldName>;
type RecentHit = Hit<RecentPlay, SearchFieldName>;

/**
 * The part of a hit a row actually renders.
 *
 * Deliberately not `Hit<Item, …>`: the Recent tab draws the same folder card as
 * the Folders tab, but the hit it holds was computed over a `RecentPlay` — the
 * item type differs while everything the row draws is identical. Typing the
 * parameter as the full generic would force a cast at the one call site that
 * spans the two, and the cast would be the lie.
 */
type RowHit = { field: SearchFieldName; value: string; ranges: Range[] };

function formatLastPlayed(value: number | null): string {
  if (!value) {
    return "Never played";
  }
  return `Last played ${new Date(value).toLocaleDateString()}`;
}

function describeTrackCount(count: number): string {
  return `${count} track${count === 1 ? "" : "s"}`;
}

/**
 * The line that explains a hit the listener cannot see.
 *
 * A row found by its author, its file name or the folder it sits in shows that
 * fact in place of its usual metadata — a result whose reason is invisible
 * looks like a wrong result. Null when the match is in the title, where the
 * highlight already says it.
 */
function describeHit(hit: { field: SearchFieldName; value: string } | null): string | null {
  if (hit === null || hit.field === TITLE_FIELD) {
    return null;
  }
  return `${describeField(hit.field)} · ${hit.value}`;
}

/**
 * Where else a query matched, when it matched nothing in the current view.
 *
 * The chips carry the same numbers, but a listener staring at an empty list is
 * not reading the chips. Naming the other tab is the difference between "your
 * search found nothing" and "your search found it over there".
 */
function describeElsewhere(counts: Record<LibraryView, number>, view: LibraryView): string | null {
  if (counts[view] > 0) {
    return null;
  }
  const others = (Object.keys(counts) as LibraryView[]).filter(
    (option) => option !== view && counts[option] > 0,
  );
  if (others.length === 0) {
    return null;
  }
  return `Also ${others.map((option) => `${counts[option]} under ${VIEW_LABELS[option]}`).join(" · ")}`;
}

export default function LibraryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [view, setView] = useState<LibraryView>("tracks");
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const { folders, refresh: refreshFolders } = useFolders();
  const { missing, refresh: refreshMissing } = useMissingTracks();
  const { run: runArtworkBackfill } = useArtworkBackfill();
  // The two card actions that open a global sheet. Taken here rather than
  // through their button components so the overflow menu can offer the same
  // action as a named row — a collapsed control that did nothing would be
  // worse than one that clipped.
  const openPlaylistPicker = useAddToPlaylist();
  const openContextHistory = useContextHistoryStore((state) => state.open);

  const terms = useMemo(() => foldQuery(query), [query]);
  const searching = terms.length > 0;

  const { recent, refresh: refreshRecent } = useRecentPlays(RECENT_READ_LIMIT);

  const continueTrack = useMemo(
    () =>
      tracks
        .filter((item) => item.lastPlayedAt !== null)
        .sort((left, right) => (right.lastPlayedAt ?? 0) - (left.lastPlayedAt ?? 0))[0],
    [tracks],
  );

  const wash = continueTrack ? paletteFor(continueTrack.contentHash)[1] : theme.accent;

  /**
   * Every searchable field of every row, folded once per data load.
   *
   * Keyed on the data rather than on the query on purpose: folding is the
   * expensive half of searching, and doing it per keystroke is what makes a
   * large library's search field stutter. A query only ever scans strings that
   * are already folded.
   */
  const trackIndex = useMemo(
    () => createSearchIndex(tracks, trackSearchFields, TITLE_FIELD),
    [tracks],
  );
  const folderIndex = useMemo(
    () => createSearchIndex(folders, folderSearchFields, TITLE_FIELD),
    [folders],
  );
  const recentIndex = useMemo(
    () => createSearchIndex(recent, recentSearchFields, TITLE_FIELD),
    [recent],
  );

  /**
   * All three views are searched on every keystroke, not just the visible one.
   *
   * That is the whole point of the counts on the chips: a listener who searches
   * for a folder while the Tracks tab is showing has to be told the folder
   * exists, and the only way to know is to have looked. With the fields already
   * folded this is a few thousand `indexOf` calls — cheap enough to run while
   * the keyboard is open, and far cheaper than the fold it avoids.
   */
  const trackHits = useMemo(() => searchIndex(trackIndex, terms), [trackIndex, terms]);
  const folderHits = useMemo(() => searchIndex(folderIndex, terms), [folderIndex, terms]);
  const recentHits = useMemo(() => searchIndex(recentIndex, terms), [recentIndex, terms]);

  const counts: Record<LibraryView, number> = {
    tracks: trackHits.length,
    folders: folderHits.length,
    recent: recentHits.length,
  };
  const totalMatches = counts.tracks + counts.folders + counts.recent;
  const hint = searching ? describeElsewhere(counts, view) : null;

  /**
   * What each tab shows: the hits while searching, the whole list otherwise.
   *
   * `hit` rides alongside the item rather than replacing it, so a row keeps
   * everything it knows and gains only the reason it matched.
   */
  const trackRows = useMemo<{ track: LocalTrack; hit: TrackHit | null }[]>(
    () =>
      searching
        ? trackHits.map((hit) => ({ track: hit.item, hit }))
        : tracks.map((track) => ({ track, hit: null })),
    [searching, trackHits, tracks],
  );
  const folderRows = useMemo<{ folder: FolderSummary; hit: FolderHit | null }[]>(
    () =>
      searching
        ? folderHits.map((hit) => ({ folder: hit.item, hit }))
        : folders.map((folder) => ({ folder, hit: null })),
    [searching, folderHits, folders],
  );
  const recentRows = useMemo<{ play: RecentPlay; hit: RecentHit | null }[]>(
    () =>
      searching
        ? recentHits.map((hit) => ({ play: hit.item, hit }))
        : // The tab keeps its twelve; the read above is only wider so a search
          // can reach past them.
          recent.slice(0, RECENT_LIMIT).map((play) => ({ play, hit: null })),
    [searching, recentHits, recent],
  );

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
    const [allTracks, annotationTotals] = await Promise.all([
      LocalDBService.getAllTracks(),
      LocalDBService.getAnnotationCounts(),
    ]);
    setTracks(allTracks);
    setAnnotationCounts(annotationTotals);
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

  /**
   * Plays one track with the **whole library** behind it, so next/previous step
   * through the library.
   *
   * Takes an id rather than an index because the list it is called from may be
   * the search results, whose positions say nothing about the library's. The
   * queue is deliberately still the full library while searching: a search is a
   * way to *find* something, not a way to redefine what comes next.
   */
  const playAt = useCallback(
    (trackId: string) => {
      const ids = tracks.map((track) => track.id);
      const index = ids.indexOf(trackId);
      if (index < 0) {
        return;
      }
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
        subtitle={
          searching
            ? `${totalMatches} match${totalMatches === 1 ? "" : "es"}`
            : tracks.length > 0
              ? `${tracks.length} tracks`
              : undefined
        }
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

      {/* The field sits above the chips, not inside a tab, because it belongs
          to the screen: it searches all three at once and the chips' counts are
          how it reports that. See `describeElsewhere` for the empty case.

          Note this is an *element*, not a component function — a header defined
          as `() => <View/>` gets a fresh component type on every render, which
          remounts the `TextInput` and drops the keyboard on the first
          keystroke. */}
      <Reveal index={1}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles, folders, files…"
          hint={hint}
          accessibilityLabel="Search your library"
        />
      </Reveal>

      <Reveal index={2}>
        {/* Three chips share the row equally rather than sizing to their
            labels. "Tracks / Folders / Recent" at the chip's own padding is
            wider than a small phone's content column, and a clipped third
            option is worse than a tighter one.

            While a query is active each chip carries its match count, which is
            what stops a search for a folder name being trapped in the Tracks
            tab — "Folders 1" says where to look. */}
        <View style={styles.viewToggle}>
          <GlassChip
            label="Tracks"
            icon="music"
            selected={view === "tracks"}
            count={searching ? counts.tracks : null}
            onPress={() => setView("tracks")}
            style={styles.viewChip}
          />
          <GlassChip
            label="Folders"
            icon="folder"
            selected={view === "folders"}
            count={searching ? counts.folders : null}
            onPress={() => setView("folders")}
            style={styles.viewChip}
          />
          <GlassChip
            label="Recent"
            icon="history"
            selected={view === "recent"}
            count={searching ? counts.recent : null}
            onPress={() => setView("recent")}
            style={styles.viewChip}
          />
        </View>
      </Reveal>

      {/* The continue card, the missing-files alert and the Add button all step
          aside while searching. They are the screen's standing furniture, and a
          search is a focused mode: results belong at the top, not below a
          promotion for something else. */}
      {continueTrack && !searching ? (
        <Reveal index={3}>
          <GlassSurface tone="surfaceStrong" style={styles.continueCard}>
            <ElasticPressable
              accessibilityRole="button"
              accessibilityLabel={`Continue listening to ${continueTrack.title}`}
              onPress={() => playAt(continueTrack.id)}
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
              onPress={() => playAt(continueTrack.id)}
            />
          </GlassSurface>
        </Reveal>
      ) : null}

      {/* Only when something is actually broken. A standing "0 files missing"
          banner would just train the listener to ignore it. */}
      {missing.length > 0 && !searching ? (
        <Reveal index={4}>
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

      {searching ? null : (
        <Reveal index={5}>
          <PrimaryButton label="Add audio" onPress={onImport} />
        </Reveal>
      )}
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
  const renderFolder = (
    folder: FolderSummary,
    index: number,
    when: string | undefined,
    hit: RowHit | null,
  ) => {
    const ramp = paletteFor(folder.key);
    const matched = describeHit(hit);
    /**
     * Resolved on tap rather than per card: a folder holds counts, not its
     * contents, and forty cards each running a query for a button nobody has
     * pressed is the cost this avoids. Missing files are left out, matching the
     * folder screen — a playlist is a promise to play something later, and a
     * file whose bytes are gone cannot keep it.
     */
    const resolveTrackIds = async () =>
      (await LocalDBService.getTracksByFolder(folder.key))
        .filter((track) => track.availability !== "missing")
        .map((track) => track.id);

    return (
      <Reveal index={FIRST_ROW_REVEAL_INDEX + index} from="below" limit={ROW_REVEAL_LIMIT}>
        <MediaCard
          title={folder.name}
          titleRanges={hit?.ranges ?? []}
          // Why it matched comes first while searching, then progress, so a card
          // that runs out of width ellipsises the play count rather than either
          // the reason or the thing being tracked.
          meta={[
            matched,
            describeFolderProgress(folder.finishedCount, folder.trackCount),
            folder.totalDurationSec > 0 ? formatDuration(folder.totalDurationSec) : null,
            formatPlayCount(folder.playCount),
            when ?? null,
          ]
            .filter((part): part is string => part !== null)
            .join(" · ")}
          artworkUrl={folder.artworkUrl}
          paletteKey={folder.key}
          progressRatio={folderProgressRatio(folder.finishedCount, folder.trackCount)}
          onPress={() => openFolder(folder.key)}
          accessibilityLabel={`Open folder ${folder.name}`}
          accessibilityHint="Opens this folder"
          actions={[
            {
              key: "play",
              width: 40,
              priority: 4,
              icon: "play",
              label: `Play ${folder.name}`,
              onPress: () => void playFolder(folder.key),
              node: (
                <BouncyIconButton
                  name="play"
                  accessibilityLabel={`Play folder ${folder.name}`}
                  size={40}
                  iconSize={18}
                  tone="glass"
                  onPress={() => void playFolder(folder.key)}
                />
              ),
            },
            {
              key: "add",
              width: 40,
              priority: 3,
              icon: "playlistAdd",
              label: "Add to a playlist",
              onPress: () =>
                void openPlaylistPicker({
                  title: folder.name,
                  ramp,
                  artwork: folder.artworkUrl,
                  isBatch: true,
                  resolveTrackIds,
                }),
              node: (
                <AddToPlaylistButton
                  title={folder.name}
                  ramp={ramp}
                  artwork={folder.artworkUrl}
                  isBatch
                  size={40}
                  iconSize={18}
                  tone="glass"
                  resolveTrackIds={resolveTrackIds}
                />
              ),
            },
            {
              key: "history",
              width: 40,
              priority: 2,
              icon: "history",
              label: "Listening history",
              onPress: () =>
                openContextHistory({
                  type: "folder",
                  key: folder.key,
                  title: folder.name,
                  artwork: folder.artworkUrl,
                }),
              node: (
                <ContextHistoryButton
                  type="folder"
                  contextKey={folder.key}
                  title={folder.name}
                  artwork={folder.artworkUrl}
                  size={40}
                  iconSize={18}
                  tone="glass"
                />
              ),
            },
          ]}
        />
      </Reveal>
    );
  };

  const renderPlaylist = (
    play: Extract<RecentPlay, { kind: "playlist" }>,
    index: number,
    hit: RowHit | null,
  ) => {
    const { playlist } = play;
    const ramp = paletteFor(playlist.title);
    const matched = describeHit(hit);
    /**
     * Resolved through the service rather than from the playlist's stored items,
     * so this hands over exactly the queue playback would use — and drops
     * missing files for the same reason the folder card does.
     */
    const resolveTrackIds = async () => {
      const detail = await PlaylistService.loadDetail(playlist.id);
      return (detail?.tracks ?? [])
        .filter((track) => track.availability !== "missing")
        .map((track) => track.id);
    };

    return (
      <Reveal index={FIRST_ROW_REVEAL_INDEX + index} from="below" limit={ROW_REVEAL_LIMIT}>
        <MediaCard
          title={playlist.title}
          titleRanges={hit?.ranges ?? []}
          meta={[
            matched,
            describeTrackCount(playlist.items.length),
            describeRecentWhen(play.lastPlayedAt),
          ]
            .filter((part): part is string => part !== null && part.length > 0)
            .join(" · ")}
          paletteKey={playlist.title}
          onPress={() => openPlaylist(playlist.id)}
          accessibilityLabel={`Open playlist ${playlist.title}`}
          accessibilityHint="Opens this playlist"
          actions={[
            {
              key: "play",
              width: 40,
              priority: 4,
              icon: "play",
              label: `Play ${playlist.title}`,
              onPress: () => void playPlaylist(playlist.id),
              node: (
                <BouncyIconButton
                  name="play"
                  accessibilityLabel={`Play playlist ${playlist.title}`}
                  size={40}
                  iconSize={18}
                  tone="glass"
                  onPress={() => void playPlaylist(playlist.id)}
                />
              ),
            },
            {
              key: "add",
              width: 40,
              priority: 3,
              icon: "playlistAdd",
              label: "Add to a playlist",
              onPress: () =>
                void openPlaylistPicker({
                  title: playlist.title,
                  ramp,
                  isBatch: true,
                  resolveTrackIds,
                }),
              node: (
                <AddToPlaylistButton
                  title={playlist.title}
                  ramp={ramp}
                  isBatch
                  size={40}
                  iconSize={18}
                  tone="glass"
                  resolveTrackIds={resolveTrackIds}
                />
              ),
            },
            {
              key: "history",
              width: 40,
              priority: 2,
              icon: "history",
              label: "Listening history",
              onPress: () =>
                openContextHistory({
                  type: "playlist",
                  key: playlist.id,
                  title: playlist.title,
                }),
              node: (
                <ContextHistoryButton
                  type="playlist"
                  contextKey={playlist.id}
                  title={playlist.title}
                  size={40}
                  iconSize={18}
                  tone="glass"
                />
              ),
            },
          ]}
        />
      </Reveal>
    );
  };

  /**
   * The two controls a bare track gets, in both the Tracks and the Recent tab.
   *
   * One function rather than two copies, because the pair is the same for the
   * same reason: a bare track has no collection to show history for, so it gets
   * "add to a playlist" and "open the track", where its own sessions are listed.
   * Both tabs render the same card, so they must not offer different controls.
   */
  const trackActions = (track: LocalTrack): MediaCardAction[] => {
    const ramp = paletteFor(track.contentHash);
    const openDetails = () => router.push(`/track/${track.id}`);

    return [
      {
        key: "add",
        width: 40,
        priority: 2,
        icon: "playlistAdd",
        label: "Add to a playlist",
        onPress: () =>
          void openPlaylistPicker({
            title: track.title,
            ramp,
            artwork: track.artworkUrl,
            trackIds: [track.id],
          }),
        node: (
          <AddToPlaylistButton
            trackIds={[track.id]}
            title={track.title}
            ramp={ramp}
            artwork={track.artworkUrl}
            size={40}
            iconSize={18}
            tone="ghost"
          />
        ),
      },
      {
        key: "details",
        width: 40,
        priority: 1,
        icon: "chevronRight",
        label: "Details",
        onPress: openDetails,
        node: (
          <BouncyIconButton
            name="chevronRight"
            accessibilityLabel={`Details for ${track.title}`}
            size={40}
            iconSize={18}
            tone="ghost"
            onPress={openDetails}
          />
        ),
      },
    ];
  };

  const renderRecentTrack = (
    play: Extract<RecentPlay, { kind: "track" }>,
    index: number,
    hit: RowHit | null,
  ) => {
    const { track } = play;
    const matched = describeHit(hit);

    return (
      <Reveal index={FIRST_ROW_REVEAL_INDEX + index} from="below" limit={ROW_REVEAL_LIMIT}>
        <MediaCard
          title={track.title}
          titleRanges={hit?.ranges ?? []}
          meta={[
            matched,
            `${track.totalPlayCount} play${track.totalPlayCount === 1 ? "" : "s"}`,
            describeRecentWhen(play.lastPlayedAt),
          ]
            .filter((part): part is string => part !== null && part.length > 0)
            .join(" · ")}
          artworkUrl={track.artworkUrl}
          paletteKey={track.contentHash}
          onPress={() => playTrack(track.id)}
          accessibilityLabel={`Play ${track.title}`}
          accessibilityHint="Plays this track on its own"
          actions={trackActions(track)}
        />
      </Reveal>
    );
  };

  const renderRecent = (play: RecentPlay, index: number, hit: RowHit | null) => {
    const when = describeRecentWhen(play.lastPlayedAt);
    switch (play.kind) {
      case "folder":
        return renderFolder(play.folder, index, when, hit);
      case "playlist":
        return renderPlaylist(play, index, hit);
      case "track":
        return renderRecentTrack(play, index, hit);
    }
  };

  /**
   * One list, three datasets. The lists are all `FlatList`s over the same row
   * shape so the keyboard behaviour below is stated once per list rather than
   * per branch — `keyboardShouldPersistTaps` is what makes a result tappable on
   * the first tap while the keyboard is up.
   */
  const listProps = {
    ListHeaderComponent: header,
    contentContainerStyle: styles.list,
    showsVerticalScrollIndicator: false,
    keyboardShouldPersistTaps: "handled" as const,
    keyboardDismissMode: "on-drag" as const,
  };

  return (
    <Screen wash={wash}>
      {view === "tracks" ? (
        <FlatList
          {...listProps}
          data={trackRows}
          keyExtractor={(item) => item.track.id}
          ListEmptyComponent={
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              {searching
                ? `No track matches “${query.trim()}”.`
                : "No tracks yet. Add an audio file to start listening."}
            </ThemedText>
          }
          renderItem={({ item, index }) => {
            const { track, hit } = item;
            const notes = annotationCounts[track.id] ?? 0;
            const matched = describeHit(hit);
            return (
              <Reveal
                index={FIRST_ROW_REVEAL_INDEX + index}
                from="below"
                limit={ROW_REVEAL_LIMIT}>
                <MediaCard
                  title={track.title}
                  titleRanges={hit?.ranges ?? []}
                  meta={`${track.totalPlayCount} play${track.totalPlayCount === 1 ? "" : "s"} · ${notes} note${notes === 1 ? "" : "s"}`}
                  // While searching, the least important fact on the card gives
                  // way to the most useful one: why this card is a result. With
                  // no query it is the last-played stamp.
                  detail={matched ?? formatLastPlayed(track.lastPlayedAt)}
                  artworkUrl={track.artworkUrl}
                  paletteKey={track.contentHash}
                  onPress={() => playAt(track.id)}
                  accessibilityLabel={`Play ${track.title}`}
                  accessibilityHint="Plays this track, and continues through the library"
                  actions={trackActions(track)}
                />
              </Reveal>
            );
          }}
        />
      ) : view === "folders" ? (
        <FlatList
          {...listProps}
          data={folderRows}
          keyExtractor={(item) => item.folder.key || "root"}
          ListEmptyComponent={
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              {searching
                ? `No folder matches “${query.trim()}”.`
                : "No folders yet. They appear automatically once your audio sits in folders on the device."}
            </ThemedText>
          }
          renderItem={({ item, index }) =>
            renderFolder(item.folder, index, undefined, item.hit)
          }
        />
      ) : (
        <FlatList
          {...listProps}
          data={recentRows}
          keyExtractor={(item) => recentPlayKey(item.play)}
          ListEmptyComponent={
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              {searching
                ? `Nothing you played recently matches “${query.trim()}”.`
                : "Nothing played yet. Whatever you listen to next — a track, a playlist, or a whole folder — shows up here."}
            </ThemedText>
          }
          renderItem={({ item, index }) => renderRecent(item.play, index, item.hit)}
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
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
