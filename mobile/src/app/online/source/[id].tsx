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
import { useMemo } from "react";
import { FlatList, Linking, RefreshControl, StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { CollectionCard } from "@/components/online/collection-card";
import { ThemedText } from "@/components/themed-text";
import { useOnlineCatalog } from "@/hooks/use-online-catalog";
import { downloadAction, EmptyState, InlineNotice, SkeletonRows } from "@/components/ui/row";
import { useTheme } from "@/hooks/use-theme";
import {
  describeDownloadStatus,
  describeKnownTrackCount,
  findSource,
  type OnlineCollection,
} from "@/lib/online";
import { paletteFor } from "@/lib/palette";
import { control, iconSize, spacing } from "@/theme/tokens";

export default function SourceCollectionsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const sourceId = params.id ?? null;
  const source = sourceId ? findSource(sourceId) : null;
  const catalog = useOnlineCatalog(sourceId);

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
    const meta = describeKnownTrackCount(item.trackCount);

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
          status={describeDownloadStatus(state)}
          actions={[
            downloadAction({
              title: item.title,
              state,
              onPress: () => void catalog.download(item),
              color:
                state === "complete" || state === "downloading"
                  ? theme.accent
                  : undefined,
            }),
          ]}
        />
      </Reveal>
    );
  };

  return (
    <Screen wash={ramp[1]}>
      <FlatList
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
            {source ? (
              <ThemedText type="caption" themeColor="textTertiary">
                {source.nativeName} · Free to stream. Downloaded courses stay on this device.
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
    paddingBottom: spacing.giant,
  },
  headerBlock: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
