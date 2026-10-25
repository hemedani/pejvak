/**
 * One source's collections — the shows, courses and albums it offers.
 *
 * This is where the feature stops being a directory and starts being a library:
 * every row can be listened to, kept, or downloaded, and the row says which of
 * those the listener has already done. A collection they have never touched
 * looks different from one they saved last week, without a second screen.
 *
 * The download button on the row is deliberate. "Download a course" is a
 * decision a listener makes while looking at the course, not after opening it —
 * and making them open it first would be a step that exists only because the
 * data happened to be loaded in the other order.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Linking, RefreshControl, StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { CollectionCard } from "@/components/online/collection-card";
import { ThemedText } from "@/components/themed-text";
import { useOnlineCatalog } from "@/hooks/use-online-catalog";
import { downloadAction, EmptyState, InlineNotice, SkeletonRows } from "@/components/ui/row";
import { GlassChip } from "@/components/ui/glass";
import { useTheme } from "@/hooks/use-theme";
import {
  describeCollectionLine,
  describeDownloadStatus,
  findLanguage,
  findSource,
  sourceLanguages,
  type OnlineCollection,
} from "@/lib/online";
import { paletteFor } from "@/lib/palette";
import { control, iconSize, miniPlayerInset, spacing } from "@/theme/tokens";
import { listPerformance } from "@/lib/listPerformance";

export default function SourceCollectionsScreen() {
  const params = useLocalSearchParams<{ id?: string; language?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const sourceId = params.id ?? null;
  const source = sourceId ? findSource(sourceId) : null;
  const languages = useMemo(() => (source ? sourceLanguages(source) : []), [source]);
  /**
   * A source that serves more than one language is browsed one language at a
   * time. The choice starts from the language the listener arrived through, so
   * tapping Dutch on the Browse tab opens the Dutch catalogue rather than the
   * source's default.
   */
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(null);
  const languageCode = useMemo(() => {
    if (!source) {
      return null;
    }
    if (chosenLanguage && languages.includes(chosenLanguage)) {
      return chosenLanguage;
    }
    if (params.language && languages.includes(params.language)) {
      return params.language;
    }
    return source.languageCode;
  }, [chosenLanguage, languages, params.language, source]);
  const catalog = useOnlineCatalog(sourceId, languageCode);

  const ramp = useMemo(() => paletteFor(sourceId ?? ""), [sourceId]);

  const onOpenHomepage = useMemo(
    () => () => {
      if (source) {
        void Linking.openURL(source.homepage).catch(() => undefined);
      }
    },
    [source],
  );

  const renderItem = ({ item, index }: { item: OnlineCollection; index: number }) => {
    const local = catalog.saved[item.key];
    const state = local?.downloadState;
    const live = source?.live === true;
    const meta = live ? "Live" : describeCollectionLine(item);

    return (
      <Reveal index={index} limit={10}>
        <CollectionCard
          title={item.title}
          meta={meta}
          artworkUrl={item.artworkUrl}
          paletteKey={item.key}
          isFavorite={local?.isFavorite ?? false}
          onToggleFavorite={() => void catalog.toggleFavorite(item)}
          onPress={() => router.push({ pathname: "/online/[key]", params: { key: item.key } })}
          accessibilityHint="Opens this collection"
          status={live ? null : describeDownloadStatus(state)}
          actions={
            live
              ? undefined
              : [
                  downloadAction({
                    title: item.title,
                    state,
                    onPress: () => void catalog.download(item),
                    color:
                      state === "complete" || state === "downloading"
                        ? theme.accent
                        : undefined,
                  }),
                ]
          }
        />
      </Reveal>
    );
  };

  return (
    <Screen wash={ramp[1]}>
      <FlatList
        {...listPerformance}
        data={catalog.collections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={catalog.refreshing}
            onRefresh={() => void catalog.refresh({ refresh: true })}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenHeader
              onBack={() => router.back()}
              overline="SOURCE"
              title={source?.name ?? "Source"}
              subtitle={source?.description}
              action={
                source ? (
                  <BouncyIconButton
                    name="external"
                    accessibilityLabel="Open the source's site"
                    size={control.lg}
                    iconSize={iconSize.lg}
                    tone="glass"
                    onPress={onOpenHomepage}
                  />
                ) : null
              }
            />
            {languages.length > 1 ? (
              <View style={styles.languages}>
                {languages.map((code) => (
                  <GlassChip
                    key={code}
                    label={findLanguage(code)?.nativeName ?? code}
                    selected={code === languageCode}
                    onPress={() => setChosenLanguage(code)}
                    accessibilityLabel={`Browse ${findLanguage(code)?.name ?? code}`}
                  />
                ))}
              </View>
            ) : null}
            {source ? (
              <ThemedText type="caption" themeColor="textTertiary">
                {source.nativeName} ·{" "}
                {source.live
                  ? "Free live radio, streamed from the source."
                  : "Free to stream. Downloaded collections stay on this device."}
              </ThemedText>
            ) : null}
            {source?.attribution ? (
              <ThemedText type="caption" themeColor="textTertiary">
                {source.attribution}
              </ThemedText>
            ) : null}
            {catalog.error ? (
              <InlineNotice tone="danger" title="Could not load this source" message={catalog.error} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          catalog.loading ? (
            <SkeletonRows count={4} />
          ) : (
            <EmptyState
              icon="compass"
              title="Nothing to play right now"
              message="This source has no collections at the moment. Try again later."
            />
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
    paddingBottom: spacing.giant + miniPlayerInset,
  },
  headerBlock: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  languages: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
