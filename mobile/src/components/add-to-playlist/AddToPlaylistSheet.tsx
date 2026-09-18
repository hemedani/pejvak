/**
 * The add-to-playlist picker.
 *
 * Mounted once, globally, by the root layout — see `addToPlaylistStore` for why
 * it is a store rather than a route. Any surface can summon it with one call and
 * hand over a set of track ids.
 *
 * Four decisions worth knowing:
 *
 *   1. It is a React Native `Modal`, not a router modal. The player is itself a
 *      `transparentModal`, and a route pushed from inside it would render
 *      *behind* it. A `Modal` is a separate window, so it lands on top of
 *      everything, from anywhere.
 *   2. Rows toggle. A filled tick that cannot be un-ticked reads as a bug, so
 *      tapping a playlist that already holds everything removes it. The rule
 *      lives in `actionFor` so the badge and the tap can never disagree.
 *   3. "New playlist" is inline. Making the user leave the sheet, create a
 *      playlist, and find their way back is the single most annoying thing this
 *      screen could do.
 *   4. The content lives in a child that only exists while a request does, so
 *      every open starts from a clean slate — no half-typed playlist name
 *      surviving into the next use, and no effect whose job is to reset state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { MembershipBadge } from "@/components/add-to-playlist/MembershipBadge";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { triggerHaptic } from "@/components/ui/haptics";
import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { useTheme } from "@/hooks/use-theme";
import type { LocalPlaylist } from "@/lib/db/types";
import { paletteFor } from "@/lib/palette";
import {
  actionFor,
  describeMembership,
  describeSelection,
  membershipOf,
} from "@/lib/playlistPicker";
import { PlaylistService } from "@/services/PlaylistService";
import {
  useAddToPlaylistStore,
  type AddToPlaylistRequest,
} from "@/store/addToPlaylistStore";
import { curve, duration, easing, spring, useMotionEnabled } from "@/theme/motion";
import { hairline, radius as radii, spacing } from "@/theme/tokens";

/** Share of the screen height the playlist list may occupy before it scrolls. */
const LIST_HEIGHT_RATIO = 0.46;
/** How far the sheet must be dragged before releasing dismisses it. */
const DISMISS_FRACTION = 0.28;
const ROW_REVEAL_LIMIT = 10;

/**
 * Renders nothing until something is being added.
 *
 * The conditional lives here, above the content, so the content's hooks and
 * local state are created fresh on every open and torn down on every dismiss.
 */
export function AddToPlaylistSheet() {
  const request = useAddToPlaylistStore((state) => state.request);
  if (!request) {
    return null;
  }
  return <AddToPlaylistSheetContent request={request} />;
}

function AddToPlaylistSheetContent({ request }: { request: AddToPlaylistRequest }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const motionEnabled = useMotionEnabled();
  const { height: windowHeight } = useWindowDimensions();

  const closing = useAddToPlaylistStore((state) => state.closing);
  const close = useAddToPlaylistStore((state) => state.close);
  const dismiss = useAddToPlaylistStore((state) => state.dismiss);

  /**
   * One value for the whole gesture: 1 is fully open, 0 fully dismissed, and a
   * drag moves it directly. A separate drag offset would be a second thing to
   * keep in step — and would need resetting on every open, which is an effect
   * whose only job is to undo the last one.
   */
  const progress = useSharedValue(0);
  const [sheetHeight, setSheetHeight] = useState(0);

  /** `null` means "not loaded yet", so loading needs no state of its own. */
  const [playlists, setPlaylists] = useState<LocalPlaylist[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const trackIds = useMemo(() => request.trackIds, [request]);

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
    void PlaylistService.list().then((rows) => {
      if (!cancelled) {
        setPlaylists(rows);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const refresh = useCallback(async () => {
    setPlaylists(await PlaylistService.list());
  }, []);

  // Memoised so `memberships` below is not invalidated on every render while
  // the list is still loading.
  const rows = useMemo(() => playlists ?? [], [playlists]);

  const memberships = useMemo(
    () => new Map(rows.map((playlist) => [playlist.id, membershipOf(playlist.items, trackIds)])),
    [rows, trackIds],
  );

  const toggle = useCallback(
    async (playlist: LocalPlaylist) => {
      const membership = membershipOf(playlist.items, trackIds);
      if (actionFor(membership.state) === "remove") {
        await PlaylistService.removeTracks(playlist.id, trackIds);
      } else {
        await PlaylistService.addTracks(playlist.id, trackIds);
      }
      triggerHaptic(membership.state === "none" ? "success" : "light");
      await refresh();
    },
    [refresh, trackIds],
  );

  const submitNewPlaylist = useCallback(async () => {
    const title = draftTitle.trim();
    if (!title) {
      return;
    }
    setBusy(true);
    try {
      await PlaylistService.createWithTracks(title, trackIds);
      setDraftTitle("");
      setComposing(false);
      triggerHaptic("success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [draftTitle, refresh, trackIds]);

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

  const ramp = request.ramp ?? paletteFor(request.title);
  const listMaxHeight = Math.round(windowHeight * LIST_HEIGHT_RATIO);

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
            accessibilityLabel="Close add to playlist"
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
                  <PaletteTile ramp={ramp} label={request.title} size={48} radius={15} />
                  <View style={styles.headerCopy}>
                    <ThemedText type="overline" themeColor="textTertiary">
                      ADD TO PLAYLIST
                    </ThemedText>
                    <ThemedText type="bodyStrong" numberOfLines={1}>
                      {request.title}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                      {request.subtitle ?? describeSelection(trackIds)}
                    </ThemedText>
                  </View>
                  <BouncyIconButton
                    name="close"
                    accessibilityLabel="Close"
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
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              {composing ? (
                <View style={styles.composer}>
                  <TextField
                    label="New playlist"
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    placeholder="Name"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => void submitNewPlaylist()}
                  />
                  <View style={styles.composerActions}>
                    <PrimaryButton
                      label="Cancel"
                      variant="ghost"
                      onPress={() => {
                        setComposing(false);
                        setDraftTitle("");
                      }}
                      style={styles.composerButton}
                    />
                    <PrimaryButton
                      label="Create & add"
                      loading={busy}
                      disabled={draftTitle.trim().length === 0}
                      onPress={() => void submitNewPlaylist()}
                      style={styles.composerButton}
                    />
                  </View>
                </View>
              ) : (
                <Reveal index={1} limit={ROW_REVEAL_LIMIT}>
                  <ElasticPressable
                    accessibilityRole="button"
                    accessibilityLabel="Create a new playlist"
                    haptic="light"
                    onPress={() => setComposing(true)}
                    style={styles.row}>
                    <View
                      style={[
                        styles.newTile,
                        { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                      ]}>
                      <Icon name="add" size={22} color={theme.accent} />
                    </View>
                    <View style={styles.rowCopy}>
                      <ThemedText type="bodyStrong">New playlist</ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary">
                        Name it and add {describeSelection(trackIds).toLowerCase()} in one step
                      </ThemedText>
                    </View>
                    <Icon name="chevronRight" size={16} color={theme.textTertiary} />
                  </ElasticPressable>
                </Reveal>
              )}

              {rows.length > 0 ? (
                <View style={[styles.divider, { backgroundColor: theme.track }]} />
              ) : null}

              {rows.map((playlist, index) => {
                const membership = memberships.get(playlist.id) ?? {
                  state: "none" as const,
                  count: 0,
                  total: 0,
                };
                return (
                  <Reveal key={playlist.id} index={index + 2} limit={ROW_REVEAL_LIMIT}>
                    <ElasticPressable
                      accessibilityRole="button"
                      accessibilityLabel={`${actionFor(membership.state) === "remove" ? "Remove from" : "Add to"} ${playlist.title}`}
                      haptic="none"
                      onPress={() => void toggle(playlist)}
                      style={styles.row}>
                      <PaletteTile
                        ramp={paletteFor(playlist.title)}
                        label={playlist.title}
                        size={40}
                        radius={12}
                      />
                      <View style={styles.rowCopy}>
                        <ThemedText type="bodyStrong" numberOfLines={1}>
                          {playlist.title}
                        </ThemedText>
                        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                          {describeMembership(membership, playlist.items.length)}
                        </ThemedText>
                      </View>
                      <MembershipBadge state={membership.state} />
                    </ElasticPressable>
                  </Reveal>
                );
              })}

              {playlists !== null && rows.length === 0 && !composing ? (
                <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
                  No playlists yet. Create one above and {describeSelection(trackIds).toLowerCase()}{" "}
                  will go straight into it.
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
    gap: spacing.xxs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    minHeight: 56,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  newTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  composer: {
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  composerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  composerButton: {
    flex: 1,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
});
