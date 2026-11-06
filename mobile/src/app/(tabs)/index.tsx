import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { LibraryFolderCard } from "@/components/library/folder-card";
import { LibraryPlaylistCard } from "@/components/library/playlist-card";
import { LibraryTrackCard } from "@/components/library/track-card";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { SwipePager } from "@/components/motion/SwipePager";
import {
  LanguageButton,
  LanguagePrompt,
} from "@/components/online/language-button";
import { LanguagePickerSheet } from "@/components/online/language-picker-sheet";
import { SourceRow } from "@/components/online/source-row";
import { SmartPlaylistRow } from "@/components/smart-playlist-row";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { GlassChip } from "@/components/ui/glass";
import { KeyboardAwareFlatList } from "@/components/ui/keyboard-scroll-view";
import { PrimaryButton } from "@/components/ui/primary-button";
import { EmptyState, InlineNotice, ListGroup } from "@/components/ui/row";
import { SearchField } from "@/components/ui/search-field";
import { TextField } from "@/components/ui/text-field";
import { useArtworkBackfill } from "@/hooks/use-artwork-backfill";
import { useFolders } from "@/hooks/use-folders";
import { useMissingTracks } from "@/hooks/use-missing-tracks";
import { usePlaylistOrigins } from "@/hooks/use-playlist-origins";
import { usePlaylists } from "@/hooks/use-playlists";
import { useRecentPlays } from "@/hooks/use-recent-plays";
import { useSmartPlaylists } from "@/hooks/use-smart-playlists";
import { useTheme } from "@/hooks/use-theme";
import { cardWidthFor } from "@/lib/cardLayout";
import type { FolderSummary, LocalPlaylist, LocalTrack } from "@/lib/db/types";
import { runWhenIdle } from "@/lib/idle";
import {
  folderSearchFields,
  playlistSearchFields,
  recentSearchFields,
  TITLE_FIELD,
  trackSearchFields,
} from "@/lib/librarySearch";
import { listPerformance } from "@/lib/listPerformance";
import {
  LIBRARY_VIEW_LABELS,
  libraryTabs,
  resolveLibraryView,
  type LibraryView,
  type SearchableLibraryView,
} from "@/lib/libraryTabs";
import { folderKeyToRouteSegment } from "@/lib/mediaFolders";
import { findLanguage, sourcesForLanguage } from "@/lib/online";
import { paletteFor } from "@/lib/palette";
import { describeRecentWhen, recentPlayKey, type RecentPlay } from "@/lib/recentPlays";
import {
  createSearchIndex,
  describeField,
  foldQuery,
  foldText,
  searchIndex,
  type Hit,
  type Range,
  type SearchFieldName,
} from "@/lib/search";
import { FolderService } from "@/services/FolderService";
import { LocalDBService } from "@/services/LocalDBService";
import { PlaylistService } from "@/services/PlaylistService";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { useSettingsStore } from "@/store/settingsStore";
import {
  control,
  dockInset,
  iconSize,
  layout,
  spacing,
  tile,
  tileRadius,
} from "@/theme/tokens";

/**
 * The header block occupies reveal indices 1–6 (language prompt, search field,
 * view toggle, continue card, missing-files alert, add-audio button), so list
 * rows start at 7. Only the opening screenful staggers in — recycled rows past
 * this limit render immediately instead of replaying a 320 ms-delayed fade. See
 * `Reveal`'s `limit`.
 */
const ROW_REVEAL_LIMIT = 13;
const FIRST_ROW_REVEAL_INDEX = 7;

/**
 * How many files one Library visit examines for cover art. Small on purpose:
 * the read is real I/O on the JS thread, and the whole point of the bounded,
 * self-stamping pass is that the next visit picks up where this one stopped.
 */
const ARTWORK_BACKFILL_BATCH = 8;
/** Let the list paint before reading files for covers on a first visit. */
const ARTWORK_BACKFILL_DELAY_MS = 250;
/**
 * Longest the backfill waits for an idle frame before going ahead anyway.
 *
 * An idle callback only arrives when the runtime says the thread is free, and a
 * list that is still settling — or the dock's wave, which never stops while
 * something is playing — can withhold that indefinitely. The timeout is what
 * turns "whenever" into "within about a second".
 */
const ARTWORK_BACKFILL_IDLE_TIMEOUT_MS = 1000;

/**
 * Longest the enrichment reads wait for an idle frame.
 *
 * They are annotation counts and the missing-files alert: they decorate what is
 * already on screen, so a couple of seconds late is invisible. Never arriving
 * would not be.
 */
const SECONDARY_READ_IDLE_TIMEOUT_MS = 2000;

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

type TrackHit = Hit<LocalTrack, SearchFieldName>;
type FolderHit = Hit<FolderSummary, SearchFieldName>;
type PlaylistHit = Hit<LocalPlaylist, SearchFieldName>;
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
function describeElsewhere(
  counts: Record<SearchableLibraryView, number>,
  view: LibraryView,
): string | null {
  // The language tab is a directory, not a search result, so it is never the
  // "it is over there" answer.
  if (view === "language" || counts[view] > 0) {
    return null;
  }
  const others = (Object.keys(counts) as SearchableLibraryView[]).filter(
    (option) => option !== view && counts[option] > 0,
  );
  if (others.length === 0) {
    return null;
  }
  return `Also ${others
    .map((option) => `${counts[option]} under ${LIBRARY_VIEW_LABELS[option]}`)
    .join(" · ")}`;
}

export default function LibraryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = cardWidthFor({
    windowWidth,
    inset: spacing.xl,
    maxContentWidth: layout.maxContentWidth,
  });
  const languageCode = useSettingsStore((state) => state.languageCode);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const language = languageCode ? findLanguage(languageCode) : null;
  const [pickingLanguage, setPickingLanguage] = useState(false);
  const [chosenView, setChosenView] = useState<LibraryView | null>(null);
  const view = resolveLibraryView(chosenView, language !== null);
  const tabs = useMemo(() => libraryTabs(language !== null), [language]);
  const sources = useMemo(
    () => (language ? sourcesForLanguage(language.code) : []),
    [language],
  );
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const { folders, refresh: refreshFolders } = useFolders();
  const { missing, refresh: refreshMissing } = useMissingTracks();
  const { playlists, refresh: refreshPlaylists } = usePlaylists();
  const { playlists: smartPlaylists, refresh: refreshSmartPlaylists } =
    useSmartPlaylists();
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const { run: runArtworkBackfill } = useArtworkBackfill();
  const terms = useMemo(() => foldQuery(query), [query]);
  const searching = terms.length > 0;

  /** True between a drag/momentum starting and the last one ending. */
  const scrollingRef = useRef(false);
  const backfillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTask = useRef<{ cancel: () => void } | null>(null);

  const { recent, refresh: refreshRecent } = useRecentPlays(RECENT_READ_LIMIT);

  /**
   * The playlist half of Recent needs its members' origins, which the playlist
   * row does not carry — one batched read for the handful of playlists the tab
   * can show, rather than a query per card.
   *
   * The Playlists tab is folded into the same read: a playlist opened from
   * Recent and the same playlist listed under Playlists are one row with one
   * badge, and resolving them separately would let the two disagree while one
   * of the reads was still in flight.
   */
  const badgedPlaylists = useMemo(() => {
    const byId = new Map<string, LocalPlaylist>();
    for (const playlist of playlists) {
      byId.set(playlist.id, playlist);
    }
    for (const play of recent) {
      if (play.kind === "playlist") {
        byId.set(play.playlist.id, play.playlist);
      }
    }
    return [...byId.values()];
  }, [playlists, recent]);
  const playlistOrigins = usePlaylistOrigins(badgedPlaylists);

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
  const playlistIndex = useMemo(
    () => createSearchIndex(playlists, playlistSearchFields, TITLE_FIELD),
    [playlists],
  );
  const recentIndex = useMemo(
    () => createSearchIndex(recent, recentSearchFields, TITLE_FIELD),
    [recent],
  );

  /**
   * All four views are searched on every keystroke, not just the visible one.
   *
   * That is the whole point of the counts on the chips: a listener who searches
   * for a folder while the Tracks tab is showing has to be told the folder
   * exists, and the only way to know is to have looked. With the fields already
   * folded this is a few thousand `indexOf` calls — cheap enough to run while
   * the keyboard is open, and far cheaper than the fold it avoids.
   */
  const trackHits = useMemo(() => searchIndex(trackIndex, terms), [trackIndex, terms]);
  const folderHits = useMemo(() => searchIndex(folderIndex, terms), [folderIndex, terms]);
  const playlistHits = useMemo(
    () => searchIndex(playlistIndex, terms),
    [playlistIndex, terms],
  );
  const recentHits = useMemo(() => searchIndex(recentIndex, terms), [recentIndex, terms]);

  const counts: Record<SearchableLibraryView, number> = {
    tracks: trackHits.length,
    folders: folderHits.length,
    playlists: playlistHits.length,
    recent: recentHits.length,
  };
  const totalMatches =
    counts.tracks + counts.folders + counts.playlists + counts.recent;
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
  const playlistRows = useMemo<{ playlist: LocalPlaylist; hit: PlaylistHit | null }[]>(
    () =>
      searching
        ? playlistHits.map((hit) => ({ playlist: hit.item, hit }))
        : playlists.map((playlist) => ({ playlist, hit: null })),
    [searching, playlistHits, playlists],
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
   * Fills in cover art for tracks imported before it was extracted, merging only
   * the rows that changed. Deliberately not awaited by `refresh`: the list has
   * to paint from the rows already in hand, and a tile upgrading from a letter
   * to a cover a moment later costs nothing.
   *
   * Bounded and self-stamping, so the first visits do real work and every visit
   * after that is one cheap query returning nothing. A pass that starts while a
   * scroll is in flight stops between files, because extraction reads real bytes
   * on the JS thread and a fling is the one moment it must not compete.
   */
  const backfillNow = useCallback(async () => {
    const outcome = await runArtworkBackfill(
      ARTWORK_BACKFILL_BATCH,
      () => scrollingRef.current,
    );
    if (outcome.changed.length === 0) {
      return;
    }
    const artworkByTrack = new Map(
      outcome.changed.map((entry) => [entry.trackId, entry.artworkUrl]),
    );
    setTracks((previous) => {
      let changed = false;
      const next = previous.map((track) => {
        const artworkUrl = artworkByTrack.get(track.id);
        if (!artworkUrl || track.artworkUrl === artworkUrl) {
          return track;
        }
        changed = true;
        return { ...track, artworkUrl };
      });
      return changed ? next : previous;
    });
    // A folder card draws its cover from one of its members, so it moves too.
    await refreshFolders();
  }, [refreshFolders, runArtworkBackfill, setTracks]);

  /**
   * Defers a cover-art pass until the screen has settled.
   *
   * An idle frame waits out the transition and the first touches; the timer
   * then gives the first painted frame room to land. Only one pass is ever
   * queued — focusing twice in a row must not read the same files twice.
   */
  const backfillCovers = useCallback(() => {
    idleTask.current?.cancel();
    idleTask.current = runWhenIdle(() => {
      idleTask.current = null;
      if (backfillTimer.current !== null) {
        clearTimeout(backfillTimer.current);
      }
      backfillTimer.current = setTimeout(() => {
        backfillTimer.current = null;
        if (!scrollingRef.current) {
          void backfillNow();
        }
      }, ARTWORK_BACKFILL_DELAY_MS);
    }, ARTWORK_BACKFILL_IDLE_TIMEOUT_MS);
  }, [backfillNow]);

  useEffect(
    () => () => {
      idleTask.current?.cancel();
      if (backfillTimer.current !== null) {
        clearTimeout(backfillTimer.current);
      }
    },
    [],
  );

  /** The reads that only enrich what is already on screen; never block paint. */
  const refreshSecondary = useCallback(async () => {
    const [annotationTotals] = await Promise.all([
      LocalDBService.getAnnotationCounts(),
      // A relink writes to the tracks table too, so the alert has to re-read or
      // it would keep offering to fix something already fixed.
      refreshMissing(),
    ]);
    setAnnotationCounts(annotationTotals);
  }, [refreshMissing, setAnnotationCounts]);

  const refresh = useCallback(async () => {
    const [allTracks] = await Promise.all([
      LocalDBService.getAllTracks(),
      // Playlists are edited elsewhere — the player's add-to sheet, the playlist
      // screen itself — and smart lists are derived from the sessions this very
      // screen's playback writes to, so both are stale by the same argument the
      // folders are.
      refreshPlaylists(),
      refreshSmartPlaylists(),
    ]);
    setTracks(allTracks);
    // Folders are derived from the tracks table, so a rescan or an import can
    // add one without any screen noticing; re-read on focus alongside them.
    const folderRows = await refreshFolders();
    // Recent plays are read from the sessions table, which playback writes to
    // without this screen knowing — so it goes stale for the same reason. The
    // rows just read are shared rather than fetched a second time.
    await refreshRecent({ tracks: allTracks, folders: folderRows });
    // Off the critical path: the list is already painted, and these reads only
    // add counts and alerts to it.
    runWhenIdle(() => {
      void refreshSecondary();
    }, SECONDARY_READ_IDLE_TIMEOUT_MS);
    backfillCovers();
  }, [
    backfillCovers,
    refreshFolders,
    refreshPlaylists,
    refreshRecent,
    refreshSecondary,
    refreshSmartPlaylists,
    setTracks,
  ]);

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

  /**
   * Card-shaped entry points for the two async plays. `MediaCard` is memoised,
   * so its `onPress` has to keep its identity between data loads; a wrapper per
   * card would rebuild the action cluster and defeat the memo comparison.
   */
  const playFolderCard = useCallback(
    (folderKey: string) => {
      void playFolder(folderKey);
    },
    [playFolder],
  );

  const playPlaylistCard = useCallback(
    (playlistId: string) => {
      void playPlaylist(playlistId);
    },
    [playPlaylist],
  );

  // Importing happens on its own screen; `useFocusEffect` above refreshes the
  // list when the user comes back from it.
  const onImport = useCallback(() => {
    router.push("/import");
  }, [router]);

  /**
   * The language the listener picked, chosen here as well as on Discover.
   *
   * It is the same control and the same sheet: the Library's first tab is that
   * language's shelf, so hiding the choice two tabs away made the shelf look
   * like something the app had decided rather than something they had set.
   *
   * Choosing a language now *moves to* that shelf. The tab appears at the moment
   * of the choice, so staying on Tracks would hide the one thing that changed —
   * and the listener who has just said "Persian" is asking to see Persian.
   * Clearing it falls back to Tracks, which is what `resolveLibraryView` does
   * with a "language" view and no language behind it.
   */
  const pickLanguage = useCallback(
    (code: string | null) => {
      void setLanguage(code);
      setChosenView(code ? "language" : "tracks");
    },
    [setLanguage],
  );

  /**
   * Switching view from anywhere — a chip or a swipe.
   *
   * One function rather than two so the swipe and the tap cannot disagree about
   * what changing view means. The query deliberately survives the move: every
   * tab answers it now, the language shelf included, and clearing it on arrival
   * would make the same swipe mean two different things depending on how it was
   * made.
   */
  const goToView = useCallback((next: LibraryView) => {
    setChosenView(next);
  }, []);

  const tabsIndex = tabs.findIndex((tab) => tab.value === view);
  const viewIndex = tabsIndex < 0 ? 0 : tabsIndex;
  const goToViewIndex = useCallback(
    (next: number) => {
      const tab = tabs[next];
      if (tab) {
        goToView(tab.value);
      }
    },
    [goToView, tabs],
  );

  const createPlaylist = useCallback(async () => {
    setCreatingPlaylist(true);
    try {
      await PlaylistService.create(newPlaylistTitle);
      setNewPlaylistTitle("");
      await refreshPlaylists();
    } finally {
      setCreatingPlaylist(false);
    }
  }, [newPlaylistTitle, refreshPlaylists]);

  const confirmDeletePlaylist = useCallback(
    (playlist: LocalPlaylist) => {
      Alert.alert("Delete playlist?", `"${playlist.title}" will be removed.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void PlaylistService.remove(playlist.id).then(refreshPlaylists);
          },
        },
      ]);
    },
    [refreshPlaylists],
  );

  const languagePicker = pickingLanguage ? (
    <LanguagePickerSheet
      currentCode={language?.code ?? null}
      onSelect={pickLanguage}
      onClear={() => pickLanguage(null)}
      onClose={() => setPickingLanguage(false)}
    />
  ) : null;

  /**
   * Everything that must not move when the strip does.
   *
   * The title, the search field and the chips are navigation, and navigation
   * that slid away with the page would put two tab strips on screen at once
   * during a swipe. They sit above the pager and stay put; only the pages move.
   */
  const chrome = (
    <View style={styles.chrome}>
      <ScreenHeader
        overline="YOUR LISTENING SPACE"
        title="Library"
        subtitle={
          view === "language" && language
            ? `${sources.length} source${sources.length === 1 ? "" : "s"} for ${language.nativeName}`
            : searching
              ? `${totalMatches} match${totalMatches === 1 ? "" : "es"}`
              : tracks.length > 0
                ? `${tracks.length} tracks`
                : undefined
        }
        action={
          <View style={styles.headerActions}>
            {/* The pill states the language once there is one. With none, the
                choice is the full-width prompt below the header instead — a
                sentence does not fit a 150pt pill. */}
            {language ? (
              <LanguageButton language={language} onPress={() => setPickingLanguage(true)} />
            ) : null}
            <BouncyIconButton
              name="settings"
              accessibilityLabel="Settings"
              size={control.lg}
              iconSize={iconSize.lg}
              tone="glass"
              onPress={() => router.push("/settings")}
            />
          </View>
        }
      />

      {/* Why a language at all, asked before anything else. It goes away the
          moment one is chosen, which is also when the Online tab appears. */}
      {language === null ? (
        <Reveal index={1}>
          <LanguagePrompt onPress={() => setPickingLanguage(true)} />
        </Reveal>
      ) : null}

      {/* The field sits above the chips, not inside a page, because it belongs
          to the screen: it searches all four lists at once and the chips'
          counts are how it reports that. See `describeElsewhere` for the empty
          case.

          It is here even over the online shelf, which is why the shelf filters
          its sources: a control that came and went with the strip would resize
          the pager under the finger, and a page that jumped 70pt on arrival
          looks like a bug.

          Note this is an *element*, not a component function — a header defined
          as `() => <View/>` gets a fresh component type on every render, which
          remounts the `TextInput` and drops the keyboard on the first
          keystroke. */}
      <Reveal index={2}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles, folders, playlists…"
          hint={hint}
          accessibilityLabel="Search your library"
        />
      </Reveal>

      <Reveal index={3}>
        {/* Every chip carries its view's glyph, and the row *wraps* rather than
            shrinks: five chips with glyphs do not fit across a small phone, and
            a chip whose label is clipped is worse than a chip on a second line.
            The match counts that appear during a search widen the row again.
            Chips grow to share a line while they fit, so four of them still
            read as one strip.

            While a query is active each library chip carries its match count
            *instead of* its glyph — the count is information and the glyph is
            decoration, and they occupy the same slot, so the row cannot start
            clipping the moment a query is typed. "Online" has no count: its tab
            is a short directory of providers, not a list of library items, and
            counting them would make "N matches" in the subtitle a total of two
            different things. */}
        <View style={styles.viewToggle}>
          {tabs.map((tab) => (
            <GlassChip
              key={tab.value}
              label={tab.label}
              icon={tab.icon}
              selected={view === tab.value}
              count={
                searching && tab.value !== "language" ? counts[tab.value] : null
              }
              onPress={() => goToView(tab.value)}
              style={styles.viewChip}
            />
          ))}
        </View>
      </Reveal>
    </View>
  );

  /**
   * The standing furniture of one view, as that view's list header.
   *
   * Per page rather than part of the chrome, because it is *content*: a
   * playlist form belongs above the playlists and nowhere else. The chrome is
   * the opposite — it is navigation, and navigation that slid away with the
   * page would be two tab strips crossing the screen on every swipe.
   *
   * It is a function of the page's own view, not of `view`. A neighbour is
   * built before it is on screen, and handing it the active view would give it
   * the wrong furniture for the frame it is first seen in.
   */
  const furniture = (pageView: LibraryView) => {
    if (pageView === "language") {
      return null;
    }

    if (pageView === "playlists") {
      if (searching) {
        return null;
      }
      return (
        <View style={styles.furniture}>
          <Reveal index={4} style={styles.createRow}>
            <TextField
              label="New playlist"
              value={newPlaylistTitle}
              onChangeText={setNewPlaylistTitle}
              placeholder="Name"
              autoComplete="off"
              importantForAutofill="no"
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={() => void createPlaylist()}
              containerStyle={styles.createInput}
            />
            <PrimaryButton
              label="Create"
              loading={creatingPlaylist}
              disabled={newPlaylistTitle.trim().length === 0}
              onPress={() => void createPlaylist()}
              style={styles.createButton}
            />
          </Reveal>

          {smartPlaylists.length > 0 ? (
            <Reveal index={5} style={styles.smartSection}>
              <ThemedText type="overline" themeColor="textTertiary">
                SMART
              </ThemedText>
              <ListGroup>
                {smartPlaylists.map((playlist) => (
                  <SmartPlaylistRow
                    key={playlist.rule.id}
                    playlist={playlist}
                    onPress={() =>
                      router.push({
                        pathname: "/smart/[rule]",
                        params: { rule: playlist.rule.id },
                      })
                    }
                  />
                ))}
              </ListGroup>
            </Reveal>
          ) : null}
        </View>
      );
    }

    // Tracks, Folders and Recent share the library's standing furniture. The
    // continue card stands aside while searching — it is about one track, and a
    // search result is about the query.
    return (
      <View style={styles.furniture}>
        {continueTrack && !searching ? (
          <Reveal index={4}>
            <Card style={styles.continueCard}>
              <ElasticPressable
                accessibilityRole="button"
                accessibilityLabel={`Continue listening to ${continueTrack.title}`}
                onPress={() => playAt(continueTrack.id)}
                style={styles.continueMain}>
                <PaletteTile
                  ramp={paletteFor(continueTrack.contentHash)}
                  label={continueTrack.title}
                  source={continueTrack.artworkUrl}
                  size={tile.xl}
                  radius={tileRadius(tile.xl)}
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
            </Card>
          </Reveal>
        ) : null}

        {/* Only when something is actually broken. A standing "0 files missing"
            banner would just train the listener to ignore it. */}
        {missing.length > 0 && !searching ? (
          <Reveal index={5}>
            <ElasticPressable
              accessibilityRole="button"
              accessibilityLabel={`${missing.length} file${missing.length === 1 ? "" : "s"} missing. Find them again.`}
              scaleTo={0.985}
              overshootTo={1.004}
              haptic="tap"
              onPress={() => router.push("/missing")}>
              <InlineNotice
                tone="danger"
                title={`${missing.length} file${missing.length === 1 ? "" : "s"} missing`}
                message="Your history is still here — find them again"
              />
            </ElasticPressable>
          </Reveal>
        ) : null}

        {searching ? null : (
          <Reveal index={6}>
            <PrimaryButton label="Add audio" onPress={onImport} />
          </Reveal>
        )}
      </View>
    );
  };

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
    return (
      <Reveal index={FIRST_ROW_REVEAL_INDEX + index} from="below" limit={ROW_REVEAL_LIMIT}>
        <LibraryFolderCard
          folder={folder}
          when={when}
          matched={describeHit(hit)}
          titleRanges={hit?.ranges}
          cardWidth={cardWidth}
          onOpen={openFolder}
          onPlay={playFolderCard}
        />
      </Reveal>
    );
  };

  const renderPlaylist = (
    play: Extract<RecentPlay, { kind: "playlist" }>,
    index: number,
    hit: RowHit | null,
  ) => {
    return (
      <Reveal index={FIRST_ROW_REVEAL_INDEX + index} from="below" limit={ROW_REVEAL_LIMIT}>
        <LibraryPlaylistCard
          playlist={play.playlist}
          lastPlayedAt={play.lastPlayedAt}
          matched={describeHit(hit)}
          origin={playlistOrigins[play.playlist.id]}
          titleRanges={hit?.ranges}
          cardWidth={cardWidth}
          onOpen={openPlaylist}
          onPlay={playPlaylistCard}
        />
      </Reveal>
    );
  };

  /**
   * The same card on the Playlists tab, where it lists *every* playlist rather
   * than the recently opened ones — so it has no "last played" clause to show
   * and gains the one verb that tab can offer and Recent cannot: delete.
   */
  const renderPlaylistRow = (
    playlist: LocalPlaylist,
    index: number,
    hit: RowHit | null,
  ) => {
    return (
      <Reveal index={FIRST_ROW_REVEAL_INDEX + index} from="below" limit={ROW_REVEAL_LIMIT}>
        <LibraryPlaylistCard
          playlist={playlist}
          matched={describeHit(hit)}
          origin={playlistOrigins[playlist.id]}
          titleRanges={hit?.ranges}
          cardWidth={cardWidth}
          onOpen={openPlaylist}
          onPlay={playPlaylistCard}
          onDelete={confirmDeletePlaylist}
        />
      </Reveal>
    );
  };

  const renderRecentTrack = (
    play: Extract<RecentPlay, { kind: "track" }>,
    index: number,
    hit: RowHit | null,
  ) => {
    const { track } = play;

    return (
      <Reveal index={FIRST_ROW_REVEAL_INDEX + index} from="below" limit={ROW_REVEAL_LIMIT}>
        <LibraryTrackCard
          track={track}
          titleRanges={hit?.ranges}
          meta={[
            describeHit(hit),
            `${track.totalPlayCount} play${track.totalPlayCount === 1 ? "" : "s"}`,
            describeRecentWhen(play.lastPlayedAt),
          ]
            .filter((part): part is string => part !== null && part.length > 0)
            .join(" · ")}
          cardWidth={cardWidth}
          onPlay={playTrack}
          accessibilityHint="Plays this track on its own"
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
   * What every page's list shares. The header is *not* here: each page carries
   * its own furniture, and the chrome that used to live in it is now above the
   * pager where a swipe cannot move it.
   *
   * `keyboardShouldPersistTaps` is what makes a result tappable on the first tap
   * while the keyboard is up.
   */
  const onScrollBegin = useCallback(() => {
    scrollingRef.current = true;
  }, []);
  const onScrollEnd = useCallback(() => {
    scrollingRef.current = false;
  }, []);

  const listProps = {
    ...listPerformance,
    contentContainerStyle: styles.list,
    showsVerticalScrollIndicator: false,
    keyboardShouldPersistTaps: "handled" as const,
    keyboardDismissMode: "on-drag" as const,
    onScrollBeginDrag: onScrollBegin,
    onMomentumScrollBegin: onScrollBegin,
    onScrollEndDrag: onScrollEnd,
    onMomentumScrollEnd: onScrollEnd,
  };

  const openSource = useCallback(
    (sourceId: string) => {
      if (!language) {
        return;
      }
      router.push({
        pathname: "/online/source/[id]",
        params: { id: sourceId, language: language.code },
      });
    },
    [language, router],
  );

  /**
   * The shelf's own answer to the query.
   *
   * The search field lives in the chrome, so it is visible over the shelf too —
   * hiding it there would resize the pager the instant the strip arrived. That
   * makes it a field that promises to filter the shelf, so the shelf filters.
   * There are a handful of providers, so a folded substring test is the whole
   * index it needs.
   */
  const visibleSources = useMemo(() => {
    if (!searching) {
      return sources;
    }
    return sources.filter((source) => {
      const haystack = foldText(
        `${source.name} ${source.nativeName} ${source.description}`,
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [searching, sources, terms]);

  /**
   * The language shelf. A provider directory rather than a track list: the
   * listener asked for a language, and the next question they have is which
   * source to open — so the answer stays one tap away instead of a network
   * request on launch.
   */
  const shelf = (
    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      {visibleSources.length > 0 ? (
        <View style={styles.languageSection}>
          <ThemedText type="overline" themeColor="textTertiary">
            SOURCES
          </ThemedText>
          <ListGroup>
            {visibleSources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                onPress={() => openSource(source.id)}
              />
            ))}
          </ListGroup>
        </View>
      ) : (
        <EmptyState
          icon="globe"
          title={
            searching
              ? `No source matches “${query.trim()}”`
              : `No sources for ${language?.name ?? "this language"} yet`
          }
          message={
            searching
              ? "Try another spelling — Persian variants are matched automatically."
              : "We add them as we find them, and the rest of the app is unaffected."
          }
        />
      )}
    </ScrollView>
  );

  /**
   * One page of the strip.
   *
   * A function of the *page's* view rather than of `view`, because the pager
   * builds its neighbours before they are on screen: handing the Tracks page
   * the Folders tab's furniture would show the wrong header for the frame it
   * first slides in. `resolveLibraryView` already guarantees an active
   * "language" view has a language behind it; the fall-through to Tracks is
   * what makes that a guarantee here too rather than an assumption.
   */
  const pageFor = (pageView: LibraryView) => {
    const header = furniture(pageView);

    switch (pageView) {
      case "language":
        return shelf;

      case "folders":
        return (
          <KeyboardAwareFlatList
            {...listProps}
            ListHeaderComponent={header}
            data={folderRows}
            keyExtractor={(item) => item.folder.key || "root"}
            ListEmptyComponent={
              searching ? (
                <EmptyState
                  icon="search"
                  title={`No folder matches “${query.trim()}”`}
                  message="Try another spelling — Persian variants are matched automatically."
                />
              ) : (
                <EmptyState
                  icon="folder"
                  title="No folders yet"
                  message="They appear automatically once your audio sits in folders on the device."
                />
              )
            }
            renderItem={({ item, index }) =>
              renderFolder(item.folder, index, undefined, item.hit)
            }
          />
        );

      case "playlists":
        return (
          <KeyboardAwareFlatList
            {...listProps}
            ListHeaderComponent={header}
            data={playlistRows}
            keyExtractor={(item) => item.playlist.id}
            ListEmptyComponent={
              searching ? (
                <EmptyState
                  icon="search"
                  title={`No playlist matches “${query.trim()}”`}
                  message="Try another spelling — Persian variants are matched automatically."
                />
              ) : (
                <EmptyState
                  icon="playlists"
                  title="No playlists yet"
                  message="Create one above, then add tracks to it."
                />
              )
            }
            renderItem={({ item, index }) =>
              renderPlaylistRow(item.playlist, index, item.hit)
            }
          />
        );

      case "recent":
        return (
          <KeyboardAwareFlatList
            {...listProps}
            ListHeaderComponent={header}
            data={recentRows}
            keyExtractor={(item) => recentPlayKey(item.play)}
            ListEmptyComponent={
              searching ? (
                <EmptyState
                  icon="search"
                  title={`Nothing recent matches “${query.trim()}”`}
                  message="Try another spelling — Persian variants are matched automatically."
                />
              ) : (
                <EmptyState
                  icon="history"
                  title="Nothing played yet"
                  message="Whatever you listen to next — a track, a playlist, or a whole folder — shows up here."
                />
              )
            }
            renderItem={({ item, index }) => renderRecent(item.play, index, item.hit)}
          />
        );

      default:
        return (
          <KeyboardAwareFlatList
            {...listProps}
            ListHeaderComponent={header}
            data={trackRows}
            keyExtractor={(item) => item.track.id}
            ListEmptyComponent={
              searching ? (
                <EmptyState
                  icon="search"
                  title={`No track matches “${query.trim()}”`}
                  message="Try another spelling — Persian variants are matched automatically."
                />
              ) : (
                <EmptyState
                  icon="music"
                  title="No tracks yet"
                  message="Add an audio file to start listening."
                />
              )
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
                  <LibraryTrackCard
                    track={track}
                    titleRanges={hit?.ranges}
                    meta={`${track.totalPlayCount} play${track.totalPlayCount === 1 ? "" : "s"} · ${notes} note${notes === 1 ? "" : "s"}`}
                    // While searching, the least important fact on the card
                    // gives way to the most useful one: why this card is a
                    // result. With no query it is the last-played stamp.
                    detail={matched ?? formatLastPlayed(track.lastPlayedAt)}
                    cardWidth={cardWidth}
                    onPlay={playAt}
                    accessibilityHint="Plays this track, and continues through the library"
                  />
                </Reveal>
              );
            }}
          />
        );
    }
  };

  const renderPage = (pageIndex: number) => {
    const tab = tabs[pageIndex];
    return tab ? pageFor(tab.value) : null;
  };

  return (
    <Screen wash={wash}>
      {chrome}
      {/* The gesture covers the pages, not the chrome: a drag that started on
          the chip strip would be a drag on a control. The strip is a plain
          wrapping row rather than a horizontal scroller for the same reason —
          a second horizontal gesture a few points away is a coin toss the
          listener would feel as unreliability. */}
      <SwipePager
        index={viewIndex}
        count={tabs.length}
        onIndexChange={goToViewIndex}
        renderPage={renderPage}
      />
      {languagePicker}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + dockInset,
  },
  /**
   * The part of the screen a swipe cannot move.
   *
   * It carries the horizontal inset the list used to supply, because it is now
   * the list's sibling rather than its header — and it stops one gap short of
   * the pager so the first row is not flush against the chips.
   */
  chrome: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  /** The standing furniture of one view, above that view's rows. */
  furniture: {
    gap: spacing.lg,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  viewToggle: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xxs,
  },
  /**
   * `flexGrow` rather than `flex: 1`. Equal shares truncate "Playlists" on a
   * narrow phone, and the count badges that appear during a search widen four
   * chips at once. Growing from the label's own width keeps every label whole
   * and lets the row wrap when it genuinely runs out of room.
   */
  viewChip: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxs,
  },
  languageSection: {
    gap: spacing.sm,
  },
  createRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  createInput: {
    flex: 1,
  },
  createButton: {
    paddingHorizontal: spacing.xl,
  },
  smartSection: {
    gap: spacing.sm,
  },
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    paddingRight: spacing.lg,
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
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
