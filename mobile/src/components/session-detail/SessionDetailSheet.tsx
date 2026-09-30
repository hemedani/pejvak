/**
 * One listen, opened.
 *
 * The History card says what was heard and for how long; this says *how much of
 * it, where, and when* — and gives the listener the two things a row cannot: a
 * way back into that exact second, and a way to remove the entry.
 *
 * Four decisions worth knowing:
 *
 *   1. **It is a React Native `Modal`, not a router modal.** The player is
 *      itself a `transparentModal`, and a route pushed from inside it would
 *      render *behind* it. A `Modal` is a separate window, so it lands on top of
 *      everything, from anywhere.
 *   2. **The timeline is the point.** Everything else on the sheet is a fact a
 *      caption could carry; the bar is the one thing that answers the question
 *      the card raised and could not answer.
 *   3. **Resume goes through the shared path.** `useResumeHistory` is the same
 *      function the History list uses, so the button and a tap on the card can
 *      never disagree about where the playhead lands.
 *   4. **The content lives in a child that only exists while a request does**, so
 *      every open starts from a clean slate and no effect has to reset state.
 */

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

import { useAddToPlaylist } from "@/components/add-to-playlist";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { ListeningTimelineBar } from "@/components/session-detail/ListeningTimeline";
import { ThemedText } from "@/components/themed-text";
import { GlassChip, GlassSurface } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useResumeHistory, type HistoryResumeTarget } from "@/hooks/use-resume-history";
import { useTheme } from "@/hooks/use-theme";
import {
  describeSpeed,
  formatDuration,
  formatPositionRange,
  formatTimeRange,
  resumeTargetSec,
  stretchResumeTarget,
} from "@/lib/history";
import {
  describeStretchOutcome,
  describeStretchTracks,
} from "@/lib/listeningStretch";
import { timelineForSession, timelineForStretch } from "@/lib/listeningTimeline";
import { paletteFor } from "@/lib/palette";
import { confirmRemoveSession, confirmRemoveStretch } from "@/lib/sessionActions";
import { formatClock } from "@/lib/time";
import { LocalDBService } from "@/services/LocalDBService";
import {
  useSessionDetailStore,
  type SessionDetailRequest,
  type SessionDetailTarget,
} from "@/store/sessionDetailStore";
import { curve, duration, easing, spring, useMotionEnabled } from "@/theme/motion";
import { hairline, radius as radii, spacing } from "@/theme/tokens";

/** Share of the screen height the sheet's body may occupy before it scrolls. */
const BODY_HEIGHT_RATIO = 0.72;
/** How far the sheet must be dragged before releasing dismisses it. */
const DISMISS_FRACTION = 0.28;

type DetailFact = { label: string; value: string };

/** The outcome, in the words the History card already uses for it. */
const OUTCOME_LABELS: Record<ReturnType<typeof describeStretchOutcome>, string> = {
  complete: "Complete — heard through",
  finished: "Finished",
  interrupted: "Interrupted",
  open: "In progress",
};

/**
 * Everything the sheet draws, in one object.
 *
 * A pure function of the target rather than a branch inside the render: the two
 * shapes a listen can arrive in (a whole stretch, a single session) differ only
 * in which rows they are built from, and spreading that difference through the
 * JSX is how the two branches end up disagreeing about a fact's wording.
 */
function describeTarget(target: SessionDetailTarget): {
  title: string;
  artworkUrl: string | null;
  paletteKey: string;
  overline: string;
  subtitle: string;
  resume: { trackId: string; positionSec: number };
  trackIds: string[];
  facts: DetailFact[];
  /** The listen ran out, so there is nothing ahead of it to resume to. */
  replay: boolean;
  sessionIds: string[];
  removal: string;
} {
  if (target.kind === "session") {
    const { session, track } = target.item;
    const resume = { trackId: track.id, positionSec: resumeTargetSec(target.item) };
    return {
      title: track.title,
      artworkUrl: track.artworkUrl,
      paletteKey: track.contentHash,
      overline: "LISTENING SESSION",
      subtitle: formatTimeRange(session.startedAt, session.endedAt),
      resume,
      trackIds: [track.id],
      replay: session.completed,
      sessionIds: [session.id],
      removal: `the session for "${track.title}"`,
      facts: [
        { label: "Date", value: new Date(session.startedAt).toLocaleDateString() },
        // The span inside the file — the fact a song most wants, and the one the
        // card has no room for.
        {
          label: "Heard",
          value: formatPositionRange(session.startPositionSec, session.endPositionSec),
        },
        { label: "Listened", value: formatDuration(session.durationListenedSec) },
        { label: "Speed", value: describeSpeed(session.playbackSpeed) },
        { label: "Outcome", value: outcomeLabel(session) },
        ...(target.item.contextTitle
          ? [{ label: "Collection", value: target.item.contextTitle }]
          : []),
        ...(track.author ? [{ label: "Author", value: track.author }] : []),
      ],
    };
  }

  const { entry } = target;
  const { stretch } = entry;
  const resolved = stretchResumeTarget(entry);
  const facts: DetailFact[] = [
    { label: "Date", value: new Date(stretch.startedAt).toLocaleDateString() },
    { label: "Listened", value: formatDuration(stretch.listenedSec) },
    { label: "Speed", value: describeSpeed(stretch.playbackSpeed) },
    { label: "Outcome", value: OUTCOME_LABELS[describeStretchOutcome(stretch)] },
  ];
  if (stretch.trackCount > 1) {
    facts.splice(1, 0, { label: "Tracks", value: describeStretchTracks(stretch) });
  } else {
    facts.splice(1, 0, {
      label: "Heard",
      value: formatPositionRange(stretch.startPositionSec, stretch.endPositionSec),
    });
  }
  if (entry.start.contextTitle) {
    facts.push({ label: "Collection", value: entry.start.contextTitle });
  }

  return {
    title: entry.start.track.title,
    artworkUrl: entry.start.track.artworkUrl,
    paletteKey: entry.start.track.contentHash,
    overline: "LISTENING SESSION",
    subtitle: formatTimeRange(stretch.startedAt, stretch.endedAt),
    resume: { trackId: resolved.item.track.id, positionSec: resolved.positionSec },
    trackIds: [...new Set(entry.items.map((item) => item.track.id))],
    facts,
    replay: stretch.completed,
    sessionIds: entry.items.map((item) => item.session.id),
    removal: `the listen for "${entry.start.track.title}"`,
  };
}

function outcomeLabel(session: { completed: boolean; interrupted: boolean; endedAt: number | null }): string {
  if (session.endedAt === null) {
    return "In progress";
  }
  if (session.completed) {
    return "Finished";
  }
  return session.interrupted ? "Interrupted" : "Stopped";
}

/**
 * Renders nothing until a listen is being inspected.
 *
 * The conditional lives here, above the content, so the content's hooks and
 * local state are created fresh on every open and torn down on every dismiss.
 */
export function SessionDetailSheet() {
  const request = useSessionDetailStore((state) => state.request);
  if (!request) {
    return null;
  }
  return <SessionDetailSheetContent request={request} />;
}

function SessionDetailSheetContent({ request }: { request: SessionDetailRequest }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const motionEnabled = useMotionEnabled();
  const { height: windowHeight } = useWindowDimensions();
  const resumeHistory = useResumeHistory();
  const openPlaylistPicker = useAddToPlaylist();

  const closing = useSessionDetailStore((state) => state.closing);
  const close = useSessionDetailStore((state) => state.close);
  const dismiss = useSessionDetailStore((state) => state.dismiss);

  const { target, onChanged } = request;

  /**
   * One value for the whole gesture: 1 is fully open, 0 fully dismissed, and a
   * drag moves it directly. A separate drag offset would be a second thing to
   * keep in step — and would need resetting on every open, which is an effect
   * whose only job is to undo the last one.
   */
  const progress = useSharedValue(0);
  const [sheetHeight, setSheetHeight] = useState(0);

  const detail = useMemo(() => describeTarget(target), [target]);
  const ramp = paletteFor(detail.paletteKey);
  const timeline = useMemo(
    () =>
      target.kind === "session"
        ? timelineForSession(target.item, detail.resume)
        : timelineForStretch(target.entry),
    [detail.resume, target],
  );

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

  /**
   * Picks the listen back up. The sheet is dismissed *before* navigating rather
   * than after: the player is a route behind this Modal, so pushing first would
   * open it out of sight and only reveal it once the exit animation had run.
   */
  const onResume = useCallback(() => {
    const target_: HistoryResumeTarget =
      target.kind === "session"
        ? { kind: "session", item: target.item }
        : { kind: "stretch", entry: target.entry };
    dismiss();
    void resumeHistory(target_);
  }, [dismiss, resumeHistory, target]);

  const onAddToPlaylist = useCallback(() => {
    void openPlaylistPicker({
      title: detail.title,
      ramp,
      artwork: detail.artworkUrl,
      trackIds: detail.trackIds,
    });
  }, [detail, openPlaylistPicker, ramp]);

  const remove = useCallback(async () => {
    await LocalDBService.softDeleteSessions(detail.sessionIds);
    onChanged?.();
    dismiss();
  }, [detail.sessionIds, dismiss, onChanged]);

  const onDelete = useCallback(() => {
    // The confirmation belongs to the shared module: it already knows that a
    // stretch can stand for hours of listening across several files, and that
    // the removal is local-only.
    if (target.kind === "session") {
      confirmRemoveSession(target.item, () => void remove());
    } else {
      confirmRemoveStretch(target.entry, () => void remove());
    }
  }, [remove, target]);

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

  const bodyMaxHeight = Math.round(windowHeight * BODY_HEIGHT_RATIO);
  const resumeLabel = `${detail.replay ? "Replay from" : "Resume at"} ${formatClock(detail.resume.positionSec)}`;

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
            accessibilityLabel="Close session details"
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
                it across the body would race the ScrollView's own vertical drag,
                and whichever won would make the other feel broken. */}
            <GestureDetector gesture={pan}>
              <View>
                <View style={styles.grabberArea}>
                  <View style={[styles.grabber, { backgroundColor: theme.track }]} />
                </View>

                <View style={styles.header}>
                  <PaletteTile
                    ramp={ramp}
                    label={detail.title}
                    source={detail.artworkUrl}
                    size={52}
                    radius={16}
                  />
                  <View style={styles.headerCopy}>
                    <ThemedText type="overline" themeColor="textTertiary">
                      {detail.overline}
                    </ThemedText>
                    <ThemedText type="bodyStrong" numberOfLines={2}>
                      {detail.title}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                      {detail.subtitle}
                    </ThemedText>
                  </View>
                  <BouncyIconButton
                    name="close"
                    accessibilityLabel="Close session details"
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
              style={{ maxHeight: bodyMaxHeight }}
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={false}>
              <ListeningTimelineBar timeline={timeline} tint={ramp[1]} />

              <View style={styles.facts}>
                {detail.facts.map((fact, index) => (
                  <View
                    key={fact.label}
                    style={[
                      styles.factRow,
                      index > 0
                        ? { borderTopWidth: hairline, borderTopColor: theme.glassBorder }
                        : null,
                    ]}>
                    <ThemedText type="caption" themeColor="textSecondary">
                      {fact.label}
                    </ThemedText>
                    <ThemedText type="bodyStrong" numberOfLines={1} style={styles.factValue}>
                      {fact.value}
                    </ThemedText>
                  </View>
                ))}
              </View>

              <PrimaryButton label={resumeLabel} onPress={onResume} />

              <View style={styles.secondary}>
                <GlassChip
                  label="Playlist"
                  icon="playlistAdd"
                  accessibilityLabel={`Add ${detail.title} to a playlist`}
                  onPress={onAddToPlaylist}
                />
                <GlassChip
                  label="Remove from history"
                  icon="trash"
                  accessibilityLabel={`Remove ${detail.removal} from history`}
                  onPress={onDelete}
                  style={{ borderColor: theme.danger }}
                />
              </View>
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
  },
  body: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  facts: {
    borderRadius: radii.md,
    overflow: "hidden",
  },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  factValue: {
    flexShrink: 1,
    textAlign: "right",
  },
  secondary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
