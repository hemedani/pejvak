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
 */

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { CollectionCard } from "@/components/online/collection-card";
import { LanguageRow } from "@/components/online/language-row";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { GlassChip } from "@/components/ui/glass";
import { TextField } from "@/components/ui/text-field";
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
  LANGUAGES,
  sourcesForLanguage,
  type OnlineLanguage,
} from "@/lib/online";
import { describeRunOutcome, runProgressRatio } from "@/lib/playbackContext";
import { formatClock } from "@/lib/time";
import { ContextService } from "@/services/ContextService";
import { dockInset, spacing } from "@/theme/tokens";

type DiscoverView = "continue" | "favorites" | "browse";

const DISCOVER_VIEWS: readonly { value: DiscoverView; label: string }[] = [
  { value: "continue", label: "Continue" },
  { value: "favorites", label: "Favorites" },
  { value: "browse", label: "Browse" },
];

/**
 * One row, whichever list is showing.
 *
 * A discriminated union rather than three separate lists: the header, the
 * refresh control and the empty state are the same for all three, and three
 * `FlatList`s would mean three copies of them drifting apart.
 */
type DiscoverRow =
  | { kind: "continue"; item: ContinueItem }
  | { kind: "favorite"; item: LocalOnlineCollection }
  | { kind: "language"; item: OnlineLanguage; sourceCount: number };

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

  const query = search.trim().toLowerCase();
  const languages = useMemo(() => {
    if (query.length === 0) {
      return LANGUAGES;
    }
    return LANGUAGES.filter(
      (language) =>
        language.name.toLowerCase().includes(query) ||
        language.nativeName.toLowerCase().includes(query) ||
        language.code === query,
    );
  }, [query]);

  const rows = useMemo<DiscoverRow[]>(() => {
    if (view === "continue") {
      return continuing.map((item) => ({ kind: "continue", item }));
    }
    if (view === "favorites") {
      return favorites.map((item) => ({ kind: "favorite", item }));
    }
    return languages.map((language) => ({
      kind: "language",
      item: language,
      sourceCount: sourcesForLanguage(language.code).length,
    }));
  }, [view, continuing, favorites, languages]);

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

  const renderItem = useCallback(
    ({ item, index }: { item: DiscoverRow; index: number }) => {
      if (item.kind === "continue") {
        const { run, collection, resumeTargetSec } = item.item;
        return (
          <Reveal index={index} limit={10}>
            <CollectionCard
              title={collection?.title ?? run.contextTitle}
              meta={continueMeta(item.item)}
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
      }

      if (item.kind === "favorite") {
        const collection = item.item;
        return (
          <Reveal index={index} limit={10}>
            <CollectionCard
              title={collection.title}
              // A saved collection's size is only known once it has been
              // opened; a run's is always known, which is why the two calls
              // above this one still use `describeTrackCount`.
              meta={favoriteMeta(collection)}
              artworkUrl={collection.artworkUrl}
              paletteKey={collection.key}
              isFavorite
              onToggleFavorite={() => void removeFavorite(collection.key)}
              onPress={() =>
                router.push({ pathname: "/online/[key]", params: { key: collection.key } })
              }
              accessibilityHint="Opens this collection"
            />
          </Reveal>
        );
      }

      return (
        <Reveal index={index} limit={10}>
          <Card>
            <LanguageRow
              language={item.item}
              sourceCount={item.sourceCount}
              onPress={() =>
                router.push({ pathname: "/online/language/[code]", params: { code: item.item.code } })
              }
            />
          </Card>
        </Reveal>
      );
    },
    [removeFavorite, resume, router],
  );

  const subtitle = useMemo(() => {
    if (view === "continue") {
      return continuing.length > 0
        ? `${continuing.length} collection${continuing.length === 1 ? "" : "s"} to carry on with`
        : undefined;
    }
    if (view === "favorites") {
      return favorites.length > 0 ? `${favorites.length} saved` : undefined;
    }
    return `Free audio in ${LANGUAGES.length} languages`;
  }, [view, continuing.length, favorites.length]);

  const loading = view === "continue" ? continueLoading : favoritesLoading;

  const emptyMessage = (() => {
    if (view === "continue") {
      return "Nothing in progress. Start a collection and it will wait for you here.";
    }
    if (view === "favorites") {
      return "No saved collections yet. Tap the bookmark on any collection to keep it here.";
    }
    return query.length > 0
      ? `No language matches “${search.trim()}”.`
      : "No languages to show.";
  })();

  return (
    <Screen wash={theme.accent}>
      <FlatList
        data={rows}
        keyExtractor={(row) =>
          row.kind === "continue"
            ? `c:${row.item.run.contextKey}`
            : row.kind === "favorite"
              ? `f:${row.item.key}`
              : `l:${row.item.code}`
        }
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          view === "browse" ? undefined : (
            <RefreshControl refreshing={loading} onRefresh={() => void refreshAll()} />
          )
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenHeader overline="DISCOVER" title="Listen online" subtitle={subtitle} />
            <View style={styles.filters}>
              {DISCOVER_VIEWS.map((option) => (
                <GlassChip
                  key={option.value}
                  label={option.label}
                  selected={view === option.value}
                  accessibilityLabel={`Show ${option.label.toLowerCase()}`}
                  onPress={() => setView(option.value)}
                />
              ))}
            </View>
            {view === "browse" ? (
              <TextField
                label="Find a language"
                value={search}
                onChangeText={setSearch}
                placeholder="Persian, فارسی…"
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              {emptyMessage}
            </ThemedText>
          )
        }
      />
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
  headerBlock: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
