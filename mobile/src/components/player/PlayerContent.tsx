/**
 * The full-screen player's content.
 *
 * Layout, top to bottom: a drag handle / close header, the hero artwork, the
 * track's identity, a scrubbable timeline carrying one marker per annotation,
 * the transport cluster, and the secondary controls plus the notes list.
 *
 * Everything below the header is driven by `reveal` (the sheet's 0→1 morph
 * progress) rather than by its own entrance animation, so the content grows into
 * place *with* the container instead of after it. The artwork scales up from
 * ~0.88 while the controls rise from below, which is what makes the artwork read
 * as having travelled from the mini-player.
 */

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, type PanGesture } from "react-native-gesture-handler";

import { AnnotationList } from "@/components/annotation-list";
import { AnnotationMarker } from "@/components/annotation-marker";
import { AddToPlaylistChip } from "@/components/add-to-playlist";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { CrossfadeArtwork } from "@/components/motion/CrossfadeArtwork";
import { Scrubber } from "@/components/player/Scrubber";
import { TransportControls } from "@/components/player/TransportControls";
import { ThemedText } from "@/components/themed-text";
import { GlassChip } from "@/components/ui/glass/GlassChip";
import { KeyboardScrollView } from "@/components/ui/keyboard-scroll-view";
import { useScheme } from "@/hooks/use-theme";
import type { LocalAnnotation } from "@/lib/db/types";
import { describeContextType, type PlaybackContext } from "@/lib/playbackContext";
import { formatClock } from "@/lib/time";
import { colors, spacing, type AuroraRamp } from "@/theme/tokens";

/**
 * A chip label that cannot grow without bound: a folder key is a path and a
 * playlist title is free text, and either can be longer than the row it sits in.
 */
function shortTitle(title: string, max = 22): string {
  return title.length <= max ? title : `${title.slice(0, max - 1)}…`;
}

/** The morph progress at which the artwork starts growing in. */
const ART_REVEAL_START = 0.22;
/** The morph progress at which the lower content starts rising in. */
const BODY_REVEAL_START = 0.42;

export type PlayerContentProps = {
  /** 0 = collapsed over the mini-player, 1 = full screen. */
  reveal: SharedValue<number>;
  /** The library row being played; null before a track resolves. */
  trackId: string | null;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  isAudiobook: boolean;
  ramp: AuroraRamp;
  /** The folder or playlist the queue came from, if it came from one. */
  context: PlaybackContext | null;
  /** "4 of 12" — where playback is inside that collection, or null. */
  contextPosition: string | null;
  /** Opens the collection's own screen. */
  onOpenContext: () => void;
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  playbackSpeed: number;
  sleepActive: boolean;
  sleepLabel: string;
  error: string | null;
  annotations: LocalAnnotation[];
  selectedId: string | null;
  skipNonce?: number;
  skipDirection?: 1 | -1;
  onSelectAnnotation: (annotation: LocalAnnotation) => void;
  onClose: () => void;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRewind: () => void;
  onForward: () => void;
  /** Where a history entry dropped the playhead, if this playback resumed one. */
  resumeFromSec?: number | null;
  /** Commit a scrub or a tap on the timeline, in seconds. */
  onSeek: (positionSec: number) => void;
  onCycleSpeed: () => void;
  /** Opens the queue: the ordered tracks behind the current one. */
  onOpenQueue: () => void;
  /** The queue's size, so the chip is absent rather than opening an empty sheet. */
  queueLength: number;
  onOpenSleepTimer: () => void;
  onOpenJumpToTime: () => void;
  onAddNote: () => void;
  /** Attached to the header so the sheet can be dragged down to dismiss. */
  headerGesture?: PanGesture;
  /** Annotation composer, owned by the route. */
  composer?: ReactNode;
  /** Sleep-timer and jump-to-time sheets, owned by the route. */
  panels?: ReactNode;
};

export function PlayerContent({
  reveal,
  trackId,
  title,
  artist,
  artworkUrl,
  isAudiobook,
  ramp,
  context,
  contextPosition,
  onOpenContext,
  isPlaying,
  positionSec,
  durationSec,
  playbackSpeed,
  sleepActive,
  sleepLabel,
  error,
  annotations,
  selectedId,
  skipNonce,
  skipDirection,
  resumeFromSec,
  onSelectAnnotation,
  onClose,
  onToggle,
  onNext,
  onPrevious,
  onRewind,
  onForward,
  onSeek,
  onCycleSpeed,
  onOpenQueue,
  queueLength,
  onOpenSleepTimer,
  onOpenJumpToTime,
  onAddNote,
  headerGesture,
  composer,
  panels,
}: PlayerContentProps) {
  const insets = useSafeAreaInsets();
  const scheme = useScheme();
  const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
  const remainingSec = Math.max(0, durationSec - positionSec);

  // A collection replaces the audiobook/now-playing overline rather than sitting
  // beside it: "FOLDER · 4 OF 12" already says what the thing is, and a second
  // line of context above the title would push the artwork down.
  const overline = context
    ? [describeContextType(context.type).toUpperCase(), contextPosition?.toUpperCase()]
        .filter(Boolean)
        .join(" · ")
    : isAudiobook
      ? "AUDIOBOOK"
      : "NOW PLAYING";

  const artStyle = useAnimatedStyle(() => {
    const grow = Math.min(1, Math.max(0, (reveal.value - ART_REVEAL_START) / (1 - ART_REVEAL_START)));
    return {
      opacity: grow,
      transform: [{ scale: 0.88 + grow * 0.12 }, { translateY: (1 - grow) * 26 }],
    };
  });

  const bodyStyle = useAnimatedStyle(() => {
    const rise = Math.min(1, Math.max(0, (reveal.value - BODY_REVEAL_START) / (1 - BODY_REVEAL_START)));
    return {
      opacity: rise,
      transform: [{ translateY: (1 - rise) * 32 }],
    };
  });

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <BouncyIconButton
        name="chevronDown"
        accessibilityLabel="Close player"
        size={42}
        iconSize={22}
        tone="glass"
        onPress={onClose}
      />
      {/* The canvas behind this header is a lightened gradient in light mode and
          a deepened one in dark mode, so the grabber has to follow the theme —
          a hardcoded white pill disappears entirely in light mode. */}
      <View style={[styles.headerGrabber, { backgroundColor: colors[scheme].textSecondary }]} />
      <View style={styles.headerSpacer} />
    </View>
  );

  return (
    <View style={styles.root}>
      {headerGesture ? (
        <GestureDetector gesture={headerGesture}>
          <Animated.View>{header}</Animated.View>
        </GestureDetector>
      ) : (
        header
      )}

      <KeyboardScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.giant },
        ]}
        showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.artWrap, { shadowColor: ramp[1] }, artStyle]}>
          <CrossfadeArtwork
            source={artworkUrl}
            ramp={ramp}
            label={title}
            radius={30}
            skipNonce={skipNonce}
            skipDirection={skipDirection}
            style={styles.art}
          />
        </Animated.View>

        <Animated.View style={[styles.body, bodyStyle]}>
          <View style={styles.meta}>
            <ThemedText type="overline" themeColor="textSecondary">
              {overline}
            </ThemedText>
            <ThemedText type="title" numberOfLines={2}>
              {title}
            </ThemedText>
            {artist ? (
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                {artist}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.timeline}>
            {/* The timeline sits inside the content's gutter like every other
                block. It used to cancel that padding out and run edge to edge,
                which left the thumb and the end caps with no room to breathe. */}
            <Scrubber
              progress={progress}
              durationSec={durationSec}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              tint={ramp[1]}
              thickness={6}
              resumeFromSec={resumeFromSec}
              onSeek={onSeek}>
              {annotations.map((annotation) => (
                <AnnotationMarker
                  key={annotation.id}
                  annotation={annotation}
                  durationSec={durationSec}
                  selected={annotation.id === selectedId}
                  onPress={onSelectAnnotation}
                />
              ))}
            </Scrubber>
            <View style={styles.times}>
              <ThemedText type="numeric" themeColor="textSecondary">
                {formatClock(positionSec)}
              </ThemedText>
              <ThemedText type="numeric" themeColor="textSecondary">
                −{formatClock(remainingSec)}
              </ThemedText>
            </View>
          </View>

          <TransportControls
            isPlaying={isPlaying}
            onToggle={onToggle}
            onNext={onNext}
            onPrevious={onPrevious}
            onRewind={onRewind}
            onForward={onForward}
          />

          <View style={styles.chips}>
            {/* First, because it answers "what am I in the middle of", which
                comes before "how fast". */}
            {context ? (
              <GlassChip
                label={shortTitle(context.title)}
                icon={context.type === "folder" ? "folder" : "playlists"}
                accessibilityLabel={`Open ${describeContextType(context.type).toLowerCase()} ${context.title}`}
                onPress={onOpenContext}
              />
            ) : null}
            {/* What is playing, and what comes after it. The chip sits beside
                the context rather than inside it: a bare list has no collection
                to open, but it still has a queue. */}
            {queueLength > 0 ? (
              <GlassChip
                label="Queue"
                icon="playlists"
                accessibilityLabel="Show the queue"
                onPress={onOpenQueue}
              />
            ) : null}
            <GlassChip
              label={`${playbackSpeed}×`}
              icon="speed"
              accessibilityLabel={`Playback speed ${playbackSpeed} times`}
              onPress={onCycleSpeed}
            />
            <GlassChip
              label={sleepLabel}
              icon="moon"
              selected={sleepActive}
              onPress={onOpenSleepTimer}
            />
            <GlassChip label="Note" icon="add" onPress={onAddNote} />
            <GlassChip
              label="Go to"
              icon="clock"
              accessibilityLabel="Go to time"
              onPress={onOpenJumpToTime}
            />
            {/* Only once a library row has resolved — before that there is no id
                to hand to the picker. */}
            {trackId ? (
              <AddToPlaylistChip
                trackIds={[trackId]}
                title={title}
                ramp={ramp}
                artwork={artworkUrl}
              />
            ) : null}
          </View>

          {error ? (
            <ThemedText type="caption" themeColor="textSecondary" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}

          {composer}
          {panels}

          <View style={styles.notes}>
            <View style={styles.notesHeader}>
              <ThemedText type="overline" themeColor="textSecondary">
                NOTES
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {annotations.length}
              </ThemedText>
            </View>
            <AnnotationList
              annotations={annotations}
              selectedId={selectedId}
              onSelect={onSelectAnnotation}
            />
          </View>
        </Animated.View>
      </KeyboardScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    // `paddingTop` is set inline from `insets.top`. The sheet is a hand-built
    // full-screen container, so it does not inherit `Screen`'s `SafeAreaView` —
    // without the inset the dismiss button is drawn under the status bar, which is
    // exactly where the clock and the battery live.
    paddingBottom: spacing.xs,
  },
  headerGrabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  headerSpacer: {
    width: 42,
  },
  content: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    gap: spacing.xxl,
  },
  artWrap: {
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 18,
  },
  art: {
    width: "100%",
    aspectRatio: 1,
  },
  body: {
    gap: spacing.xxl,
  },
  meta: {
    gap: spacing.xs,
  },
  timeline: {
    gap: spacing.sm,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  error: {
    textAlign: "center",
  },
  notes: {
    gap: spacing.sm,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
