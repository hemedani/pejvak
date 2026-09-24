/**
 * One collection's listening history: every play-through of this folder or
 * playlist, newest first, including the one still in progress.
 *
 * Mounted once, globally, by the root layout — see `contextHistoryStore` for why
 * it is a store rather than a route. Any surface that names a collection can
 * summon it with one call.
 *
 * Three decisions worth knowing:
 *
 *   1. It is a React Native `Modal`, not a router modal. The player is itself a
 *      `transparentModal`, and a route pushed from inside it would render
 *      *behind* it. A `Modal` is a separate window, so it lands on top of
 *      everything, from anywhere.
 *   2. Both the runs and the stats are read per open, from the collection's own
 *      key. A run started while this sheet was last closed must not be missing,
 *      and a sheet that cached its list would be the one place in the app where
 *      history is stale.
 *   3. The content lives in a child that only exists while a request does, so
 *      every open starts from a clean slate and no effect has to reset state.
 */

import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { ContextPlayCard } from "@/components/context-play-card";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import type { ContextStats, LocalContextPlay } from "@/lib/db/types";
import { paletteFor } from "@/lib/palette";
import { describeContextStats, describeContextType } from "@/lib/playbackContext";
import { confirmRemoveRun } from "@/lib/sessionActions";
import { ContextService } from "@/services/ContextService";
import { LocalDBService } from "@/services/LocalDBService";
import { useContextHistoryStore, type ContextHistoryRequest } from "@/store/contextHistoryStore";
import { curve, duration, easing, spring, useMotionEnabled } from "@/theme/motion";
import { hairline, radius as radii, spacing } from "@/theme/tokens";

/** Share of the screen height the run list may occupy before it scrolls. */
const LIST_HEIGHT_RATIO = 0.5;
/** How far the sheet must be dragged before releasing dismisses it. */
const DISMISS_FRACTION = 0.28;
const ROW_REVEAL_LIMIT = 8;

/**
 * Renders nothing until a collection is being inspected.
 *
 * The conditional lives here, above the content, so the content's hooks and
 * local state are created fresh on every open and torn down on every dismiss.
 */
export function ContextHistorySheet() {
  const request = useContextHistoryStore((state) => state.request);
  if (!request) {
    return null;
  }
  return <ContextHistorySheetContent request={request} />;
}

function ContextHistorySheetContent({ request }: { request: ContextHistoryRequest }) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const motionEnabled = useMotionEnabled();
  const { height: windowHeight } = useWindowDimensions();

  const closing = useContextHistoryStore((state) => state.closing);
  const close = useContextHistoryStore((state) => state.close);
  const dismiss = useContextHistoryStore((state) => state.dismiss);

  /**
   * One value for the whole gesture: 1 is fully open, 0 fully dismissed, and a
   * drag moves it directly. A separate drag offset would be a second thing to
   * keep in step — and would need resetting on every open, which is an effect
   * whose only job is to undo the last one.
   */
  const progress = useSharedValue(0);
  const [sheetHeight, setSheetHeight] = useState(0);

  /** `null` means "not loaded yet", so loading needs no state of its own. */
  const [runs, setRuns] = useState<LocalContextPlay[] | null>(null);
  const [stats, setStats] = useState<ContextStats | null>(null);

  const { type, key, title } = request;

  /**
   * The single owner of the open/closed frame. One effect rather than two,
   * because a value driven from two effects is a value nobody can reason about:
   * whichever ran last would win.
   */
  useEffect(() => {
    if (!closing) {
      progress.value = motionEnabled ? withSpring(1, spring.sheet) : 1;
      return;
    }
    if (!motionEnabled) {
      dismiss();
      return;
    }
    progress.value = withTiming(0, curve(easing.outQuint, duration.quick), (finished) => {
      if (finished) {
        scheduleOnRN(dismiss);
      }
    });
  }, [closing, dismiss, motionEnabled, progress]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      ContextService.runs(type, key),
      ContextService.stats(type, key),
    ]).then(([rows, totals]) => {
      if (!cancelled) {
        setRuns(rows);
        setStats(totals);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key, type]);

  const refresh = useCallback(async () => {
    const [rows, totals] = await Promise.all([
      ContextService.runs(type, key),
      ContextService.stats(type, key),
    ]);
    setRuns(rows);
    setStats(totals);
  }, [key, type]);

  /**
   * Picks a run back up. The sheet is dismissed *before* navigating rather than
   * after: the player is a route behind this Modal, so pushing first would open
   * it out of sight and only reveal it once the exit animation had run.
   */
  const resume = useCallback(
    async (run: LocalContextPlay) => {
      const trackId = await ContextService.resume(run);
      dismiss();
      if (trackId) {
        router.push({ pathname: "/player", params: { trackId } });
      }
    },
    [dismiss, router],
  );

  /**
   * Opens the collection itself. Built from the request rather than from the run
   * that was tapped: every row here belongs to the same collection, so the
   * collection the sheet was opened for is the only correct destination.
   */
  const openCollection = useCallback(() => {
    dismiss();
    router.push(ContextService.routeFor({ type, key }));
  }, [dismiss, key, router, type]);

  const remove = useCallback(
    async (run: LocalContextPlay) => {
      await LocalDBService.softDeleteContextPlay(run.id);
      await refresh();
    },
    [refresh],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Only a deliberate downward drag counts, so a tap or a wobble on the
        // handle never starts a dismiss.
        .activeOffsetY([-8, 8])
        .onUpdate((event) => {
          const travel = sheetHeight || windowHeight;
          progress.value = Math.max(0, Math.min(1, 1 - event.translationY / travel));
        })
        .onEnd((event) => {
          const committed = progress.value < 1 - DISMISS_FRACTION || event.velocityY > 900;
          if (committed) {
            scheduleOnRN(close);
          } else {
            progress.value = withSpring(1, spring.sheet);
          }
        }),
    [close, progress, sheetHeight, windowHeight],
  );

  // `windowHeight` rather than a guess at the sheet's own height: before the
  // first layout pass this is the only value guaranteed to put the sheet fully
  // off-screen, and it stops the entrance jumping once the real height lands.
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * windowHeight }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const ramp = paletteFor(title);
  const listMaxHeight = Math.round(windowHeight * LIST_HEIGHT_RATIO);
  const typeLabel = describeContextType(type);
  const totals = stats ? describeContextStats(stats) : null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          <ElasticPressable
            accessibilityRole="button"
            accessibilityLabel="Close history"
            haptic="none"
            scaleTo={1}
            overshootTo={1}
            onPress={close}
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
          />
        </Animated.View>

        <Animated.View style={[styles.sheetHost, sheetStyle]}>
          <GlassSurface
            tone="surfaceStrong"
            radius={34}
            clip
            elevated
            onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
            style={styles.sheet}>
            {/* Drag-to-dismiss covers the handle and the header only. Stretching
                it across the list would race the ScrollView's own vertical drag,
                and whichever won would make the other feel broken. */}
            <GestureDetector gesture={pan}>
              <View>
                <View style={styles.grabberArea}>
                  <View style={[styles.grabber, { backgroundColor: theme.track }]} />
                </View>

                <View style={styles.header}>
                  <PaletteTile
                    ramp={ramp}
                    label={title}
                    source={request.artwork ?? null}
                    size={48}
                    radius={15}
                  />
                  <View style={styles.headerCopy}>
                    <ThemedText type="overline" themeColor="textTertiary">
                      LISTENING HISTORY
                    </ThemedText>
                    <ThemedText type="bodyStrong" numberOfLines={1}>
                      {title}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                      {totals ? `${typeLabel} · ${totals}` : typeLabel}
                    </ThemedText>
                  </View>
                  <BouncyIconButton
                    name="close"
                    accessibilityLabel="Close history"
                    size={36}
                    iconSize={18}
                    tone="ghost"
                    onPress={close}
                  />
                </View>
              </View>
            </GestureDetector>

            <View style={[styles.divider, { backgroundColor: theme.track }]} />

            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}>
              {runs !== null && runs.length > 0 ? (
                <Reveal index={1} limit={ROW_REVEAL_LIMIT}>
                  <ElasticPressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${typeLabel.toLowerCase()} ${title}`}
                    haptic="light"
                    onPress={openCollection}
                    style={styles.openRow}>
                    <View
                      style={[
                        styles.openTile,
                        { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                      ]}>
                      <Icon
                        name={type === "folder" ? "folder" : "playlists"}
                        size={20}
                        color={theme.accent}
                      />
                    </View>
                    <View style={styles.rowCopy}>
                      <ThemedText type="bodyStrong">Open this {typeLabel.toLowerCase()}</ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary">
                        Its tracks, and every control it has
                      </ThemedText>
                    </View>
                    <Icon name="chevronRight" size={16} color={theme.textTertiary} />
                  </ElasticPressable>
                </Reveal>
              ) : null}

              {runs !== null && runs.length > 0 ? (
                <View style={[styles.divider, { backgroundColor: theme.track }]} />
              ) : null}

              {(runs ?? []).map((run, index) => (
                <Reveal key={run.id} index={index + 2} limit={ROW_REVEAL_LIMIT}>
                  <ContextPlayCard
                    run={run}
                    onPress={(entry) => void resume(entry)}
                    onOpen={openCollection}
                    onDelete={(entry) => confirmRemoveRun(entry, () => void remove(entry))}
                  />
                </Reveal>
              ))}

              {runs !== null && runs.length === 0 ? (
                <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
                  Nothing has been played from this {typeLabel.toLowerCase()} yet. Start it and
                  the play-through will show up here.
                </ThemedText>
              ) : null}
            </ScrollView>
          </GlassSurface>

          <View style={{ height: insets.bottom + spacing.md }} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetHost: {
    width: "100%",
  },
  sheet: {
    paddingBottom: spacing.lg,
  },
  grabberArea: {
    alignItems: "center",
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  divider: {
    height: hairline,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  openRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    minHeight: 56,
  },
  openTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
});
