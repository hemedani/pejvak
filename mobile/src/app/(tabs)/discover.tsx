/**
 * Discover — the way out of the library.
 *
 * Three lists, one screen, because they are three answers to the same question
 * ("what should I listen to next?") and the listener should not have to
 * remember which tab holds which:
 *
 *   · **Continue** — collections they are part-way through. Read from
 *     `context_plays`, the same table a folder run writes to, so an online
 *     course and a downloaded one appear on exactly the same terms.
 *   · **Favorites** — collections they deliberately kept.
 *   · **Browse** — every language in the world, with the ones that have sources
 *     marked. Ordered by English name so the order can be explained; filtered by
 *     a search field so forty-six rows are not a scroll.
 *
 * Nothing here reads the network on mount. Continue and Favorites are answered
 * from SQLite, and Browse is a static catalogue — the source is only contacted
 * once the listener has chosen a language and a provider. Opening the app's
 * centre tab must not cost a request.
 *
 * ## The same strip the Library and History have
 *
 * A header, one segmented control, and a pager under them. The three lists are
 * *pages*, not three re-renders of one list: dragging moves the page with the
 * finger and the thumb of the control travels with it, because both are drawn
 * from one shared value. That is the whole mechanism — see `SwipePager` and
 * `SegmentedControl`.
 *
 * What stays above the pager is navigation (the title, the language button, the
 * control) and what goes inside a page is that page's own content. The search
 * field is the interesting case: it filters Browse and nothing else, so it
 * belongs to the Browse page rather than to the chrome. It used to live in the
 * header and appear only on the Browse tab, which would now mean the pager's
 * viewport changing height mid-swipe.
 */

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { SwipePager } from "@/components/motion/SwipePager";
import { CollectionCard } from "@/components/online/collection-card";
import { LanguageButton } from "@/components/online/language-button";
import { LanguagePickerSheet } from "@/components/online/language-picker-sheet";
import { LanguageRow } from "@/components/online/language-row";
import {
  SegmentedControl,
  type SegmentOption,
} from "@/components/ui/card/segmented-control";
import { KeyboardAwareFlatList } from "@/components/ui/keyboard-scroll-view";
import { EmptyState, ListGroup } from "@/components/ui/row";
import { SearchField } from "@/components/ui/search-field";
import {
  useContinueListening,
  useFavoriteCollections,
  type ContinueItem,
} from "@/hooks/use-online-collections";
import { useTheme } from "@/hooks/use-theme";
import type { LocalOnlineCollection } from "@/lib/db/types";
import {
  describeDownloadState,
  describeKnownTrackCount,
  describeTrackCount,
  findLanguage,
  LANGUAGES,
  languageSearchFields,
  sourcesForLanguage,
} from "@/lib/online";
import { describeRunOutcome, runProgressRatio } from "@/lib/playbackContext";
import { createSearchIndex, foldQuery, searchIndex } from "@/lib/search";
import { formatClock } from "@/lib/time";
import { ContextService } from "@/services/ContextService";
import { useSettingsStore } from "@/store/settingsStore";
import { dockInset, spacing } from "@/theme/tokens";
import { listPerformance } from "@/lib/listPerformance";

type DiscoverView = "continue" | "favorites" | "browse";

/**
 * The three lists, each with the glyph that names it.
 *
 * Every tab has one: "Continue" and "Favorites" are two words that start with
 * the same letter and read as the same idea at a glance, and the glyph is what
 * separates "pick up where you left off" from "the ones you kept". Browse is a
 * globe because that is what a list of languages is.
 */
const DISCOVER_VIEWS: readonly SegmentOption<DiscoverView>[] = [
  { value: "continue", label: "Continue", icon: "playCircle" },
  { value: "favorites", label: "Favorites", icon: "bookmark" },
  { value: "browse", label: "Browse", icon: "globe" },
];

/**
 * Where a view sits in the strip.
 *
 * Derived from the list rather than written out beside it, so the control and
 * the pager cannot end up disagreeing about which page a tab belongs to.
 */
function discoverIndexFor(view: DiscoverView): number {
  const index = DISCOVER_VIEWS.findIndex((option) => option.value === view);
  return index < 0 ? 0 : index;
}

/** The second line under a continued collection: how far in, and where. */
function continueMeta(entry: ContinueItem): string {
  const parts = [describeRunOutcome(entry.run).label];
  if (entry.resumeTargetSec > 0) {
    parts.push(`Resume at ${formatClock(entry.resumeTargetSec)}`);
  }
  if (entry.run.trackCount > 0) {
    parts.push(describeTrackCount(entry.run.trackCount));
  }
  // The run is authoritative for progress and the collection row only for its
  // name, so the download state comes from the row and is simply absent when
  // there is no row — a run can outlive a collection the listener removed.
  const download = describeDownloadState(entry.collection?.downloadState);
  if (download) {
    parts.push(download);
  }
  return parts.join(" · ");
}

/**
 * The second line under a saved collection: its size, and whether the audio is
 * on this device.
 *
 * Both halves can be missing — a source that cannot state a collection's size
 * before it is opened reports zero, and a collection that was never downloaded
 * has no state worth printing — so the parts are filtered rather than joined
 * blindly. An empty result is correct here: the card omits the line entirely,
 * where "0 tracks · Not downloaded" on all forty-six languages' worth of
 * listings would be noise.
 */
function favoriteMeta(collection: LocalOnlineCollection): string {
  return [
    describeKnownTrackCount(collection.trackCount),
    describeDownloadState(collection.downloadState),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

export default function DiscoverScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [view, setView] = useState<DiscoverView>("continue");
  const [search, setSearch] = useState("");
  const [pickingLanguage, setPickingLanguage] = useState(false);
  const languageCode = useSettingsStore((state) => state.languageCode);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const language = languageCode ? findLanguage(languageCode) : null;

  const {
    items: continuing,
    loading: continueLoading,
    refresh: refreshContinue,
  } = useContinueListening();
  const {
    items: favorites,
    loading: favoritesLoading,
    refresh: refreshFavorites,
    remove: removeFavorite,
  } = useFavoriteCollections();

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshContinue(), refreshFavorites()]);
  }, [refreshContinue, refreshFavorites]);

  useFocusEffect(
    useCallback(() => {
      void refreshAll();
    }, [refreshAll]),
  );

  /**
   * Every language field folded once per catalogue, never per keystroke.
   *
   * The catalogue is static, so the index is built once. Folding here is what
   * makes «فارسي» with an Arabic yeh find «فارسی» — a raw `includes` would miss
   * it, which to the listener is indistinguishable from a search that is broken.
   */
  const languageIndex = useMemo(
    () => createSearchIndex(LANGUAGES, languageSearchFields, "title"),
    [],
  );
  const languageHits = useMemo(
    () => searchIndex(languageIndex, foldQuery(search)),
    [languageIndex, search],
  );
  const searchingLanguages = search.trim().length > 0;

  /**
   * An empty query is not "no matches" — it is the whole catalogue.
   *
   * `searchIndex` deliberately returns nothing for zero terms, so Browse used to
   * open onto an empty state and made the listener type before they could see
   * what was available. The list is the point of the tab, so it shows every
   * language until a query narrows it.
   */
  const visibleLanguages = useMemo(
    () => (searchingLanguages ? languageHits.map((hit) => hit.item) : LANGUAGES),
    [languageHits, searchingLanguages],
  );

  /** Tapping a continued collection picks the collection up, not the track. */
  const resume = useCallback(
    async (run: ContinueItem["run"]) => {
      const trackId = await ContextService.resume(run);
      if (trackId) {
        router.push({ pathname: "/player", params: { trackId } });
      }
    },
    [router],
  );

  const renderContinue = useCallback(
    ({ item, index }: { item: ContinueItem; index: number }) => {
      const { run, collection, resumeTargetSec } = item;
      return (
        <Reveal index={index} limit={10}>
          <CollectionCard
            title={collection?.title ?? run.contextTitle}
            meta={continueMeta(item)}
            artworkUrl={collection?.artworkUrl ?? null}
            paletteKey={run.contextKey}
            progressRatio={runProgressRatio(run.finishedCount, run.trackCount)}
            onPress={() => void resume(run)}
            accessibilityHint={
              resumeTargetSec > 0
                ? "Continues this collection where you left off"
                : "Continues this collection"
            }
          />
        </Reveal>
      );
    },
    [resume],
  );

  const renderFavorite = useCallback(
    ({ item, index }: { item: LocalOnlineCollection; index: number }) => (
      <Reveal index={index} limit={10}>
        <CollectionCard
          title={item.title}
          // A saved collection's size is only known once it has been opened; a
          // run's is always known, which is why the continue card above still
          // uses `describeTrackCount`.
          meta={favoriteMeta(item)}
          artworkUrl={item.artworkUrl}
          paletteKey={item.key}
          isFavorite
          onToggleFavorite={() => void removeFavorite(item.key)}
          onPress={() =>
            router.push({ pathname: "/online/[key]", params: { key: item.key } })
          }
          accessibilityHint="Opens this collection"
        />
      </Reveal>
    ),
    [removeFavorite, router],
  );

  /**
   * The line under the title, on every page and always one line.
   *
   * Not decoration: the pager's height is the screen's height minus this
   * header's, so a subtitle that came and went with the page would resize the
   * viewport while a page was still travelling — a visible jolt in the middle of
   * a swipe. The empty pages state their emptiness here instead of saying
   * nothing.
   */
  const subtitle =
    view === "browse"
      ? `Free audio in ${LANGUAGES.length} languages`
      : view === "favorites"
        ? favorites.length > 0
          ? `${favorites.length} saved`
          : "Nothing saved yet"
        : continuing.length > 0
          ? `${continuing.length} collection${continuing.length === 1 ? "" : "s"} to carry on with`
          : "Nothing in progress";

  const viewIndex = discoverIndexFor(view);

  /**
   * The strip's position, shared with the control above it.
   *
   * One value rather than two: the thumb and the page are the same fact drawn
   * twice, and a control with a spring of its own would slide to the new segment
   * while the page it describes was still travelling — visibly out of step.
   */
  const viewPosition = useSharedValue(viewIndex);

  /**
   * A page chosen by swiping.
   *
   * The strip commits on release, so this lands while the page is still
   * travelling — the tab lights up as the finger lifts, which is what makes the
   * gesture feel performed rather than observed.
   */
  const selectViewIndex = useCallback((next: number) => {
    const option = DISCOVER_VIEWS[next];
    if (option) {
      setView(option.value);
    }
  }, []);

  const languagePicker = pickingLanguage ? (
    <LanguagePickerSheet
      currentCode={language?.code ?? null}
      onSelect={(code) => void setLanguage(code)}
      onClear={() => void setLanguage(null)}
      onClose={() => setPickingLanguage(false)}
    />
  ) : null;

  /**
   * Everything that must not move when the strip does.
   *
   * The title, the language button and the control are navigation; navigation
   * that slid away with the page would put two tab strips on screen at once
   * during a swipe.
   */
  const chrome = (
    <View style={styles.chrome}>
      <ScreenHeader
        overline="DISCOVER"
        title="Listen online"
        subtitle={subtitle}
        action={
          <LanguageButton
            language={language}
            onPress={() => setPickingLanguage(true)}
          />
        }
      />
      <SegmentedControl
        options={DISCOVER_VIEWS}
        value={view}
        onChange={setView}
        position={viewPosition}
        accessibilityLabel="Discover lists"
      />
    </View>
  );

  /**
   * The three pages, each built only when the strip is about to draw it.
   *
   * Functions rather than elements on purpose: the pager keeps one page either
   * side of the finger mounted and asks for them by number, so a page built
   * eagerly would be forty-six language rows constructed on every keystroke of
   * a search that only ever filters one of the three lists.
   */
  const continuePage = () => (
    <KeyboardAwareFlatList
      {...listPerformance}
      data={continuing}
      keyExtractor={(item) => item.run.contextKey}
      renderItem={renderContinue}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={continueLoading}
          onRefresh={() => void refreshContinue()}
        />
      }
      ListEmptyComponent={
        continueLoading ? null : (
          <EmptyState
            icon="playCircle"
            title="Nothing in progress"
            message="Start a collection and it will wait for you here."
          />
        )
      }
    />
  );

  const favoritesPage = () => (
    <KeyboardAwareFlatList
      {...listPerformance}
      data={favorites}
      keyExtractor={(item) => item.key}
      renderItem={renderFavorite}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={favoritesLoading}
          onRefresh={() => void refreshFavorites()}
        />
      }
      ListEmptyComponent={
        favoritesLoading ? null : (
          <EmptyState
            icon="bookmark"
            title="No saved collections"
            message="Tap the bookmark on any collection to keep it here."
          />
        )
      }
    />
  );

  /**
   * The language list, with the field that filters it.
   *
   * The field belongs to this page rather than to the chrome because it filters
   * nothing else — see the note at the top of the file.
   */
  const browsePage = () => (
    <ScrollView
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="English | Dutch | فارسی"
        accessibilityLabel="Find a language"
      />
      {visibleLanguages.length > 0 ? (
        <ListGroup>
          {visibleLanguages.map((entry) => (
            <LanguageRow
              key={entry.code}
              language={entry}
              sourceCount={sourcesForLanguage(entry.code).length}
              onPress={() =>
                router.push({
                  pathname: "/online/language/[code]",
                  params: { code: entry.code },
                })
              }
            />
          ))}
        </ListGroup>
      ) : (
        <EmptyState
          icon={searchingLanguages ? "search" : "globe"}
          title={
            searchingLanguages
              ? `No language matches “${search.trim()}”`
              : "No languages to show"
          }
        />
      )}
    </ScrollView>
  );

  /**
   * One page of the strip.
   *
   * Switched on the *page's* view rather than on `view`, because the pager
   * builds its neighbours before they are on screen: handing the Continue page
   * the Browse list would show the wrong content for the frame it first slides
   * in.
   */
  const pageFor = (pageIndex: number) => {
    const option = DISCOVER_VIEWS[pageIndex];
    if (!option) {
      return null;
    }
    if (option.value === "browse") {
      return browsePage();
    }
    return option.value === "favorites" ? favoritesPage() : continuePage();
  };

  return (
    <Screen wash={theme.accent}>
      {chrome}
      <SwipePager
        index={viewIndex}
        count={DISCOVER_VIEWS.length}
        onIndexChange={selectViewIndex}
        position={viewPosition}
        renderPage={pageFor}
      />
      {languagePicker}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    // The floating tab bar sits over the list, so the last row has to be able
    // to scroll clear of it.
    paddingBottom: spacing.giant + dockInset,
  },
  /**
   * The part of the screen a swipe cannot move.
   *
   * It carries the horizontal inset the list used to supply, because it is now
   * the list's sibling rather than its header — and it stops one gap short of
   * the pager so the first row is not flush against the control.
   */
  chrome: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
});
