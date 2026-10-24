/**
 * The player's queue, opened from the full-screen player.
 *
 * The queue is an ordered list of ids that can come from anywhere — a folder, a
 * saved playlist, a streamed collection or an ad-hoc list — so the sheet asks
 * the store for the order and the database for the rows, rather than assuming a
 * collection type. It opens scrolled to the current track and highlights it, so
 * "where am I" is answered before the listener scrolls.
 *
 * It is a React Native `Modal` for the same reason the history sheet is: the
 * player is itself a `transparentModal` route, and a route pushed from inside it
 * would render behind it. A `Modal` is a separate window, so it lands on top.
 */

import { useCallback, useEffect, useRef } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { ListRow } from "@/components/ui/row";
import { useQueueTracks } from "@/hooks/use-queue-tracks";
import { useTheme } from "@/hooks/use-theme";
import { joinMeta, plural } from "@/lib/cardMeta";
import { describeContextType, type PlaybackContext } from "@/lib/playbackContext";
import { formatClock } from "@/lib/time";
import { bar, hairline, list as listTokens, radius as radii, spacing } from "@/theme/tokens";

/**
 * Fixed so `getItemLayout` can place the current row before it has rendered.
 *
 * A queue row is deliberately one line — title and duration, no author — so
 * every row is exactly `list.rowMinHeight` and the offset arithmetic stays
 * exact. A second line would make a row with an author taller than one
 * without, and the initial scroll would drift a few pixels per track.
 */
const ROW_HEIGHT = listTokens.rowMinHeight;
/** Rows of context kept above the current track when the sheet opens. */
const LEADING_ROWS = 2;
/** Share of the screen the queue may occupy before it scrolls. */
const LIST_HEIGHT_RATIO = 0.62;

export type QueueSheetProps = {
  queue: readonly string[];
  currentIndex: number;
  context: PlaybackContext | null;
  onSelect: (index: number) => void;
  onClose: () => void;
};

export function QueueSheet({
  queue,
  currentIndex,
  context,
  onSelect,
  onClose,
}: QueueSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { tracks, loading } = useQueueTracks(queue);
  const listRef = useRef<FlatList<string>>(null);

  const current = currentIndex >= 0 && currentIndex < queue.length ? currentIndex : -1;
  const initialIndex = current > LEADING_ROWS ? current - LEADING_ROWS : 0;
  const listMaxHeight = Math.round(windowHeight * LIST_HEIGHT_RATIO);

  /**
   * Follow an advance that happens while the sheet is open.
   *
   * The first render is already positioned by `initialScrollIndex`, so only a
   * *change* scrolls — running this on mount too would animate the list twice.
   */
  const lastIndex = useRef(current);
  useEffect(() => {
    if (lastIndex.current === current) {
      return;
    }
    lastIndex.current = current;
    if (current < 0) {
      return;
    }
    listRef.current?.scrollToIndex({
      index: Math.max(0, current - LEADING_ROWS),
      animated: true,
    });
  }, [current]);

  const select = useCallback(
    (index: number) => {
      // Tapping the row that is already playing is "close", not "restart".
      if (index === current) {
        onClose();
        return;
      }
      onSelect(index);
    },
    [current, onClose, onSelect],
  );

  const renderRow = ({ item: trackId, index }: ListRenderItemInfo<string>) => {
    const track = tracks.get(trackId);
    const selected = index === current;
    const title = track?.title ?? "Unavailable track";
    const duration = track && track.durationSec > 0 ? formatClock(track.durationSec) : null;

    return (
      <View
        style={[
          styles.rowWrap,
          selected ? { backgroundColor: theme.accentSoft } : null,
          !track ? styles.unavailable : null,
        ]}>
        <ListRow
          position="only"
          leadingWidth={28}
          leading={
            selected ? (
              <View style={[styles.nowTile, { backgroundColor: theme.accent }]}>
                <Icon name="play" size={12} color={theme.onAccent} />
              </View>
            ) : (
              <ThemedText type="numeric" themeColor="textTertiary">
                {String(index + 1).padStart(2, "0")}
              </ThemedText>
            )
          }
          title={title}
          titleLines={1}
          trailing={
            duration ? (
              <ThemedText type="numeric" themeColor="textTertiary">
                {duration}
              </ThemedText>
            ) : null
          }
          onPress={() => select(index)}
          disabled={!track}
          disabledReason="This track is no longer in the library"
          accessibilityLabel={
            selected ? `${title}, playing now` : `Play ${title}, track ${index + 1}`
          }
        />
      </View>
    );
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.root}>
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss the queue"
          haptic="none"
          scaleTo={1}
          overshootTo={1}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />

        <GlassSurface
          tone="surfaceStrong"
          radius="panel"
          clip
          elevated
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.grabberArea}>
            <View style={[styles.grabber, { backgroundColor: theme.track }]} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <ThemedText type="overline" themeColor="textTertiary">
                QUEUE
              </ThemedText>
              <ThemedText type="bodyStrong" numberOfLines={1}>
                {context ? context.title : "Now playing"}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                {joinMeta([
                  context ? describeContextType(context.type) : null,
                  plural(queue.length, "track"),
                ])}
              </ThemedText>
            </View>
            <BouncyIconButton
              name="close"
              accessibilityLabel="Close queue"
              size={36}
              iconSize={18}
              tone="ghost"
              onPress={onClose}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.track }]} />

          {loading && queue.length > 0 ? (
            <View style={[styles.loading, { height: ROW_HEIGHT * 3 }]}>
              <ThemedText type="caption" themeColor="textTertiary">
                Loading the queue…
              </ThemedText>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={queue}
              keyExtractor={(trackId, index) => `${index}:${trackId}`}
              renderItem={renderRow}
              getItemLayout={(_, index) => ({
                length: ROW_HEIGHT,
                offset: ROW_HEIGHT * index,
                index,
              })}
              initialScrollIndex={queue.length > 0 ? initialIndex : undefined}
              onScrollToIndexFailed={(info) => {
                listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: false,
                });
              }}
              extraData={current}
              style={{ maxHeight: listMaxHeight }}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
  },
  grabberArea: {
    alignItems: "center",
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  grabber: {
    width: 40,
    height: bar.thin,
    borderRadius: radii.pill,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  divider: {
    height: hairline,
    marginHorizontal: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
  },
  rowWrap: {
    borderRadius: radii.panel,
    overflow: "hidden",
  },
  unavailable: {
    opacity: 0.5,
  },
  nowTile: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
