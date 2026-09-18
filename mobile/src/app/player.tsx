import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { NowPlayingSheet } from "@/components/player/NowPlayingSheet";
import { PlayerContent } from "@/components/player/PlayerContent";
import { ThemedText } from "@/components/themed-text";
import { GlassSheet } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { useTrackAnnotations } from "@/hooks/use-annotations";
import { useSleepTimer } from "@/hooks/use-sleep-timer";
import type { LocalAnnotation, LocalTrack } from "@/lib/db/types";
import { paletteFor } from "@/lib/palette";
import { formatRemaining, SLEEP_TIMER_CHOICES } from "@/lib/sleepTimer";
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
  const params = useLocalSearchParams<{ trackId?: string; positionSec?: string }>();
  const paramTrackId = params.trackId ?? null;
  const paramPositionSec = parsePositionParam(params.positionSec);

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

  const activeTrackId = paramTrackId ?? storeTrackId;
  const [track, setTrack] = useState<LocalTrack | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftPositionSec, setDraftPositionSec] = useState(0);

  const sleep = useSleepTimer();

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

      // Only take over playback when this is a different track from the one
      // already loaded — opening the sheet from the mini-player must not restart.
      if (usePlayerStore.getState().trackId !== loaded.id) {
        const { queue } = usePlayerStore.getState();
        const existingIndex = queue.indexOf(loaded.id);
        await TrackPlayerService.playQueueAt(
          existingIndex >= 0 ? queue : [loaded.id],
          existingIndex >= 0 ? existingIndex : 0,
          // Explicit, so a history entry lands on *its* session's position
          // rather than the most recent one.
          paramPositionSec,
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
  }, [activeTrackId, paramPositionSec]);

  const ramp = useMemo(
    () => paletteFor(contentHash ?? track?.contentHash ?? title ?? activeTrackId),
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
    if (sleep.active) {
      sleep.cancel();
      return;
    }
    Alert.alert("Sleep timer", "Pause playback after…", [
      ...SLEEP_TIMER_CHOICES.map((minutes) => ({
        text: `${minutes} min`,
        onPress: () => sleep.start(minutes),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const openComposer = () => {
    setEditingId(null);
    setDraftPositionSec(positionSec);
    setDraft("");
    setComposerOpen(true);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setEditingId(null);
    setDraft("");
  };

  const saveNote = async () => {
    if (!track) {
      return;
    }
    if (editingId) {
      const target = annotations.find((annotation) => annotation.id === editingId);
      if (!target) {
        closeComposer();
        return;
      }
      if (await update({ annotation: target, text: draft })) {
        closeComposer();
      }
      return;
    }
    if (await create({ track, positionSec: draftPositionSec, text: draft })) {
      closeComposer();
    }
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
    Alert.alert("Delete note?", "This removes the note and syncs the deletion.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteNote(annotation) },
    ]);
  };

  const selected = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedId) ?? null,
    [annotations, selectedId],
  );

  const composer = composerOpen ? (
    <GlassSheet open tone="surfaceStrong" style={styles.composer}>
      <TextField
        label={`${editingId ? "Edit" : "Note"} at ${formatClock(draftPositionSec)}`}
        value={draft}
        onChangeText={setDraft}
        placeholder="What stood out here?"
        multiline
        autoFocus
      />
      <View style={styles.composerActions}>
        <Pressable accessibilityRole="button" onPress={closeComposer}>
          <ThemedText type="linkPrimary">Cancel</ThemedText>
        </Pressable>
        <PrimaryButton
          label={editingId ? "Save changes" : "Save note"}
          loading={creating}
          disabled={draft.trim().length === 0}
          onPress={() => void saveNote()}
          style={styles.saveButton}
        />
      </View>
    </GlassSheet>
  ) : selected ? (
    <GlassSheet open tone="surfaceStrong" style={styles.composer}>
      <View style={styles.selectedHeader}>
        <ThemedText type="smallBold">{formatClock(selected.positionSec)}</ThemedText>
        <View style={styles.selectedActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setEditingId(selected.id);
              setDraftPositionSec(selected.positionSec);
              setDraft(selected.text);
              setComposerOpen(true);
            }}>
            <ThemedText type="linkPrimary">Edit</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => confirmDelete(selected)}>
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
          isPlaying={isPlaying}
          positionSec={positionSec}
          durationSec={durationSec}
          playbackSpeed={playbackSpeed}
          sleepActive={sleep.active}
          sleepLabel={sleep.active ? formatRemaining(sleep.remainingMs) : "Sleep"}
          error={statusMessage}
          annotations={annotations}
          selectedId={selectedId}
          skipNonce={skip?.nonce}
          skipDirection={skip?.direction}
          onSelectAnnotation={onSelect}
          onClose={() => {
            // Clear the transient panels first, then run the sheet's own exit:
            // it morphs the frame back down to the mini-player and pops the
            // route once that finishes. Popping directly would skip the morph.
            setComposerOpen(false);
            setSelectedId(null);
            close();
          }}
          onToggle={() => TrackPlayerService.togglePlayPause()}
          onNext={() => void TrackPlayerService.next()}
          onPrevious={() => void TrackPlayerService.previous()}
          onRewind={() => void TrackPlayerService.seekTo(Math.max(0, positionSec - 30))}
          onForward={() => void TrackPlayerService.seekTo(positionSec + 30)}
          onSeek={(target) => void TrackPlayerService.seekTo(target)}
          onCycleSpeed={cycleSpeed}
          onOpenSleepTimer={openSleepTimer}
          onAddNote={openComposer}
          composer={composer}
        />
      )}
    </NowPlayingSheet>
  );
}

const styles = StyleSheet.create({
  composer: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  saveButton: {
    flex: 1,
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
