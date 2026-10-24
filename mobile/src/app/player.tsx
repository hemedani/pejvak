import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { AnnotationComposer } from "@/components/player/AnnotationComposer";
import { JumpToTimeSheet } from "@/components/player/JumpToTimeSheet";
import { NowPlayingSheet } from "@/components/player/NowPlayingSheet";
import { PlayerContent } from "@/components/player/PlayerContent";
import { QueueSheet } from "@/components/player/QueueSheet";
import { SleepTimerSheet } from "@/components/player/SleepTimerSheet";
import { ThemedText } from "@/components/themed-text";
import { GlassSheet } from "@/components/ui/glass";
import { useTrackAnnotations } from "@/hooks/use-annotations";
import { usePlaybackContext } from "@/hooks/use-playback-context";
import { useSleepTimer } from "@/hooks/use-sleep-timer";
import type { LocalAnnotation, LocalTrack } from "@/lib/db/types";
import { pickAnnotationColor } from "@/lib/annotations";
import { paletteFor } from "@/lib/palette";
import { contextRouteTarget } from "@/lib/playbackContext";
import { formatRemaining } from "@/lib/sleepTimer";
import { formatClock } from "@/lib/time";
import { LocalDBService } from "@/services/LocalDBService";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { usePlayerStore } from "@/store/playerStore";
import { spacing } from "@/theme/tokens";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/**
 * The resume position carried by the route (`/player?trackId=…&positionSec=…`),
 * used when the player is opened from a history entry.
 *
 * Expo Router hands params over as strings, and a malformed one must not become
 * `NaN` and reach the audio engine — anything unparseable is treated as absent,
 * which falls back to the normal "resume where you left off" behaviour.
 */
function parsePositionParam(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export default function PlayerScreen() {
  const params = useLocalSearchParams<{
    trackId?: string;
    positionSec?: string;
  }>();
  const router = useRouter();
  const paramTrackId = params.trackId ?? null;
  const paramPositionSec = parsePositionParam(params.positionSec);

  const { context, position: contextPosition } = usePlaybackContext();

  const storeTrackId = usePlayerStore((state) => state.trackId);
  const title = usePlayerStore((state) => state.title);
  const artist = usePlayerStore((state) => state.artist);
  const artworkUrl = usePlayerStore((state) => state.artworkUrl);
  const contentHash = usePlayerStore((state) => state.contentHash);
  const isAudiobook = usePlayerStore((state) => state.isAudiobook);
  const status = usePlayerStore((state) => state.status);
  const positionSec = usePlayerStore((state) => state.positionSec);
  const durationSec = usePlayerStore((state) => state.durationSec);
  const playbackSpeed = usePlayerStore((state) => state.playbackSpeed);
  const error = usePlayerStore((state) => state.error);
  const skip = usePlayerStore((state) => state.skip);
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);

  const activeTrackId = paramTrackId ?? storeTrackId;
  const [track, setTrack] = useState<LocalTrack | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [sleepSheetOpen, setSleepSheetOpen] = useState(false);
  const [jumpSheetOpen, setJumpSheetOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPositionSec, setDraftPositionSec] = useState(0);
  const [resume, setResume] = useState<{ trackId: string; sec: number } | null>(null);

  const sleep = useSleepTimer();
  // Keyed by track: a resume pin belongs to the entry it came from, so moving to
  // the next track drops it without a state-clearing effect.
  const resumeFromSec = resume?.trackId === activeTrackId ? resume.sec : null;

  const {
    annotations,
    creating,
    error: noteError,
    create,
    update,
    remove,
  } = useTrackAnnotations(activeTrackId);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!activeTrackId) {
        return;
      }
      const loaded = await LocalDBService.getTrackById(activeTrackId);
      if (!mounted || !loaded) {
        return;
      }
      setTrack(loaded);

      // The route names the track and the second the entry resumed from; both
      // have to agree before the pin is drawn, or a stale param would appear on
      // whatever track the player advanced to.
      if (paramPositionSec !== undefined && paramTrackId === loaded.id) {
        setResume({ trackId: loaded.id, sec: paramPositionSec });
      }

      // Only take over playback when this is a different track from the one
      // already loaded — opening the sheet from the mini-player must not restart.
      if (usePlayerStore.getState().trackId !== loaded.id) {
        const { queue, context } = usePlayerStore.getState();
        const existingIndex = queue.indexOf(loaded.id);
        await TrackPlayerService.playQueueAt(
          existingIndex >= 0 ? queue : [loaded.id],
          existingIndex >= 0 ? existingIndex : 0,
          // Explicit, so a history entry lands on *its* session's position
          // rather than the most recent one.
          paramPositionSec,
          // Jumping to a track that is already queued stays inside the
          // collection that queue came from. Replacing the queue with a single
          // track is a deliberate move out of it, so that clears the context.
          existingIndex >= 0 ? context : null,
        );
        return;
      }

      // The requested track is already loaded. Reloading it would restart the
      // audio, so just move the playhead — and resume, because "resume from this
      // entry" means play, even if the player was paused.
      if (paramPositionSec !== undefined) {
        await TrackPlayerService.seekTo(paramPositionSec);
        TrackPlayerService.resume();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTrackId, paramPositionSec, paramTrackId]);

  const ramp = useMemo(
    () =>
      paletteFor(contentHash ?? track?.contentHash ?? title ?? activeTrackId),
    [activeTrackId, contentHash, title, track?.contentHash],
  );

  const isPlaying = status === "playing";
  const resolvedTitle = title ?? track?.title ?? "Now Playing";
  const statusMessage = error ?? noteError;

  const onSelect = (annotation: LocalAnnotation) => {
    setSelectedId(annotation.id);
    void TrackPlayerService.seekTo(annotation.positionSec);
  };

  const cycleSpeed = () => {
    const index = SPEEDS.indexOf(playbackSpeed);
    const next = SPEEDS[(index + 1) % SPEEDS.length] ?? 1;
    void TrackPlayerService.setPlaybackRate(next);
  };

  const openSleepTimer = () => {
    setSleepSheetOpen(true);
  };

  const openJumpToTime = () => {
    setJumpSheetOpen(true);
  };

  const openComposer = () => {
    setEditingId(null);
    setDraftPositionSec(positionSec);
    setComposerOpen(true);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setEditingId(null);
  };

  const saveNote = async (input: {
    text: string;
    tags: string[];
    color: string;
  }): Promise<boolean> => {
    if (!track) {
      return false;
    }
    if (editingId) {
      const target = annotations.find(
        (annotation) => annotation.id === editingId,
      );
      if (!target) {
        closeComposer();
        return false;
      }
      const saved = await update({ annotation: target, ...input });
      if (saved) {
        closeComposer();
      }
      return saved;
    }
    const saved = await create({
      track,
      positionSec: draftPositionSec,
      ...input,
    });
    if (saved) {
      closeComposer();
    }
    return saved;
  };

  const deleteNote = async (annotation: LocalAnnotation) => {
    if (await remove(annotation)) {
      setSelectedId(null);
      if (editingId === annotation.id) {
        closeComposer();
      }
    }
  };

  const confirmDelete = (annotation: LocalAnnotation) => {
    Alert.alert(
      "Delete note?",
      "This removes the note and syncs the deletion.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteNote(annotation),
        },
      ],
    );
  };

  const panels = (
    <>
      {queueOpen ? (
        <QueueSheet
          queue={queue}
          currentIndex={queueIndex}
          context={context}
          onSelect={(index) => {
            setQueueOpen(false);
            // The same queue and the same context: a jump inside a collection is
            // a new session, not a new collection run.
            void TrackPlayerService.playQueueAt([...queue], index, undefined, context);
          }}
          onClose={() => setQueueOpen(false)}
        />
      ) : null}
      {sleepSheetOpen ? (
        <SleepTimerSheet
          active={sleep.active}
          remainingMs={sleep.remainingMs}
          onStart={sleep.start}
          onCancel={sleep.cancel}
          onClose={() => setSleepSheetOpen(false)}
        />
      ) : null}
      {jumpSheetOpen ? (
        <JumpToTimeSheet
          positionSec={positionSec}
          durationSec={durationSec}
          onSeek={(seconds) => void TrackPlayerService.seekTo(seconds)}
          onClose={() => setJumpSheetOpen(false)}
        />
      ) : null}
    </>
  );

  const selected = useMemo(
    () =>
      annotations.find((annotation) => annotation.id === selectedId) ?? null,
    [annotations, selectedId],
  );

  const editingAnnotation = editingId
    ? annotations.find((annotation) => annotation.id === editingId) ?? null
    : null;

  const composer = composerOpen ? (
    <AnnotationComposer
      key={editingId ?? `new-${draftPositionSec}`}
      positionSec={draftPositionSec}
      annotation={editingAnnotation}
      creating={creating}
      initialColor={pickAnnotationColor(annotations.length)}
      onCancel={closeComposer}
      onSave={saveNote}
    />
  ) : selected ? (
    <GlassSheet open tone="surfaceStrong" style={styles.composer}>
      <View style={styles.selectedHeader}>
        <ThemedText type="smallBold">
          {formatClock(selected.positionSec)}
        </ThemedText>
        <View style={styles.selectedActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setEditingId(selected.id);
              setDraftPositionSec(selected.positionSec);
              setComposerOpen(true);
            }}
          >
            <ThemedText type="linkPrimary">Edit</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => confirmDelete(selected)}
          >
            <ThemedText type="linkPrimary">Delete</ThemedText>
          </Pressable>
        </View>
      </View>
      <ThemedText type="small">{selected.text}</ThemedText>
    </GlassSheet>
  ) : null;

  return (
    <NowPlayingSheet ramp={ramp}>
      {({ gesture, reveal, close }) => (
        <PlayerContent
          reveal={reveal}
          headerGesture={gesture}
          trackId={activeTrackId}
          title={resolvedTitle}
          artist={artist ?? track?.author ?? null}
          artworkUrl={artworkUrl ?? track?.artworkUrl ?? null}
          isAudiobook={isAudiobook || (track?.isAudiobook ?? false)}
          ramp={ramp}
          context={context}
          contextPosition={contextPosition}
          onOpenContext={() => {
            // Pushed rather than replacing: the sheet is a transparent modal, so
            // the collection screen sits over it and the back gesture returns to
            // the player the listener left — no need to re-open it.
            if (context) {
              router.push(contextRouteTarget(context));
            }
          }}
          isPlaying={isPlaying}
          positionSec={positionSec}
          durationSec={durationSec}
          playbackSpeed={playbackSpeed}
          sleepActive={sleep.active}
          sleepLabel={
            sleep.active ? formatRemaining(sleep.remainingMs) : "Sleep"
          }
          error={statusMessage}
          annotations={annotations}
          selectedId={selectedId}
          skipNonce={skip?.nonce}
          skipDirection={skip?.direction}
          resumeFromSec={resumeFromSec}
          onSelectAnnotation={onSelect}
          onClose={() => {
            // Clear the transient panels first, then run the sheet's own exit:
            // it morphs the frame back down to the mini-player and pops the
            // route once that finishes. Popping directly would skip the morph.
            setComposerOpen(false);
            setSleepSheetOpen(false);
            setJumpSheetOpen(false);
            setQueueOpen(false);
            setSelectedId(null);
            close();
          }}
          onToggle={() => TrackPlayerService.togglePlayPause()}
          onNext={() => void TrackPlayerService.next()}
          onPrevious={() => void TrackPlayerService.previous()}
          onRewind={() =>
            void TrackPlayerService.seekTo(Math.max(0, positionSec - 30))
          }
          onForward={() => void TrackPlayerService.seekTo(positionSec + 30)}
          onSeek={(target) => void TrackPlayerService.seekTo(target)}
          onCycleSpeed={cycleSpeed}
          onOpenQueue={() => setQueueOpen(true)}
          queueLength={queue.length}
          onOpenSleepTimer={openSleepTimer}
          onOpenJumpToTime={openJumpToTime}
          onAddNote={openComposer}
          composer={composer}
          panels={panels}
        />
      )}
    </NowPlayingSheet>
  );
}

const styles = StyleSheet.create({
  composer: {
    padding: spacing.lg,
  },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
});
