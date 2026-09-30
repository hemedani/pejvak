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
import { useTheme } from "@/hooks/use-theme";
import type { DownloadState } from "@/lib/db/types";
import {
  describeDownloadState,
  describeKnownTrackCount,
  findSource,
  type OnlineCollection,
} from "@/lib/online";
import { paletteFor } from "@/lib/palette";
import { spacing } from "@/theme/tokens";

/**
 * The glyph and the accent for a collection's download state.
 *
 * The *words* are not here: `describeDownloadState` owns them, because the same
 * state is drawn on the Continue and Favorites cards too, and a second copy of
 * the mapping would eventually call `cancelled` something else on one of them.
 */
function downloadGlyph(state: DownloadState | undefined): {
  icon: "cloudDownload" | "checkCircle" | "refresh";
  accent: boolean;
} {
  switch (state) {
    case "complete":
      return { icon: "checkCircle", accent: true };
    case "downloading":
      return { icon: "cloudDownload", accent: true };
    case "failed":
      return { icon: "refresh", accent: false };
    case "cancelled":
      return { icon: "refresh", accent: false };
    default:
      return { icon: "cloudDownload", accent: false };
  }
}

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
    const glyph = downloadGlyph(local?.downloadState);
    const meta = [
      describeKnownTrackCount(item.trackCount),
      describeDownloadState(local?.downloadState),
    ]
      .filter((part): part is string => part !== null)
      .join(" · ");

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
          actions={[
            {
              key: "download",
              width: 38,
              priority: 2,
              icon: glyph.icon,
              label:
                local?.downloadState === "complete"
                  ? "Already downloaded"
                  : "Download this collection",
              onPress: () => void catalog.download(item),
              node: (
                <BouncyIconButton
                  name={glyph.icon}
                  accessibilityLabel={
                    local?.downloadState === "complete"
                      ? `${item.title} is downloaded`
                      : `Download ${item.title}`
                  }
                  disabled={local?.downloadState === "downloading"}
                  size={38}
                  iconSize={18}
                  tone="ghost"
                  color={glyph.accent ? theme.accent : undefined}
                  onPress={() => void catalog.download(item)}
                />
              ),
            },
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
                    size={42}
                    iconSize={20}
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
              <ThemedText type="caption" style={{ color: theme.danger }}>
                {catalog.error}
              </ThemedText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          catalog.loading ? null : (
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              This source has nothing to play right now.
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
