import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert, RefreshControl, SectionList, Share, StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { SessionCard } from "@/components/session-card";
import { ThemedText } from "@/components/themed-text";
import { GlassChip } from "@/components/ui/glass/GlassChip";
import { useTheme } from "@/hooks/use-theme";
import { useHistory } from "@/hooks/use-history";
import { historyToMarkdown } from "@/lib/exportHistory";
import {
  buildHistorySections,
  HISTORY_SORT_OPTIONS,
  resumeTargetSec,
  type HistoryItem,
} from "@/lib/history";
import { LocalDBService } from "@/services/LocalDBService";
import { useSettingsStore } from "@/store/settingsStore";
import { spacing } from "@/theme/tokens";

export default function HistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { items, loading, refresh } = useHistory();
  const sort = useSettingsStore((state) => state.historySort);
  const setSort = useSettingsStore((state) => state.setHistorySort);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const sections = useMemo(() => buildHistorySections(items, sort), [items, sort]);

  /** Tapping an entry picks up where that session left off. */
  const resume = (item: HistoryItem) => {
    router.push({
      pathname: "/player",
      params: {
        trackId: item.track.id,
        positionSec: String(resumeTargetSec(item)),
      },
    });
  };

  const remove = async (item: HistoryItem) => {
    await LocalDBService.softDeleteSession(item.session.id);
    await refresh();
  };

  const confirmRemove = (item: HistoryItem) => {
    // There is no server-side delete act, so this is a local removal. Saying so
    // up front beats the listener discovering the entry again on another device.
    Alert.alert(
      "Remove from history?",
      `Hides the session for "${item.track.title}" on this device. ` +
        "Copies already synced to your other devices are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void remove(item) },
      ],
    );
  };

  const exportHistory = async () => {
    try {
      await Share.share({
        title: "Listening history",
        message: historyToMarkdown(items),
      });
    } catch {
      // The share sheet was dismissed or sharing is unavailable.
    }
  };

  return (
    <Screen wash={theme.accent}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.session.id}
        renderItem={({ item }) => (
          <SessionCard
            item={item}
            onPress={resume}
            // A session that has not been finalised is still being written by
            // the tracker, so there is nothing sensible to tombstone yet.
            onDelete={item.session.endedAt === null ? undefined : confirmRemove}
          />
        )}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View style={styles.sectionHeader}>
              <ThemedText type="overline" themeColor="textTertiary">
                {section.title}
              </ThemedText>
            </View>
          ) : null
        }
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenHeader
              overline="EVERY SESSION, KEPT"
              title="History"
              subtitle={items.length > 0 ? `${items.length} sessions` : undefined}
              action={
                items.length > 0 ? (
                  <BouncyIconButton
                    name="share"
                    accessibilityLabel="Export listening history"
                    size={42}
                    iconSize={19}
                    tone="glass"
                    onPress={() => void exportHistory()}
                  />
                ) : undefined
              }
            />
            {items.length > 0 ? (
              <View style={styles.sorts}>
                {HISTORY_SORT_OPTIONS.map((option) => (
                  <GlassChip
                    key={option.value}
                    label={option.label}
                    selected={sort === option.value}
                    accessibilityLabel={`Sort history by ${option.label.toLowerCase()}`}
                    onPress={() => void setSort(option.value)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
        }
        ListEmptyComponent={
          loading ? null : (
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              No listening yet. Play a track and your sessions will show up here.
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
    paddingBottom: spacing.giant + 96,
  },
  headerBlock: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  sorts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sectionHeader: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
