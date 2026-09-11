import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnnotationList } from "@/components/annotation-list";
import { AnnotationMarker } from "@/components/annotation-marker";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTrackAnnotations } from "@/hooks/use-annotations";
import type { LocalAnnotation, LocalTrack } from "@/lib/db/types";
import { formatClock } from "@/lib/time";
import { LocalDBService } from "@/services/LocalDBService";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { usePlayerStore } from "@/store/playerStore";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export default function PlayerScreen() {
  const { trackId } = useLocalSearchParams<{ trackId?: string }>();
  const theme = useTheme();

  const [track, setTrack] = useState<LocalTrack | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftPositionSec, setDraftPositionSec] = useState(0);

  const status = usePlayerStore((state) => state.status);
  const positionSec = usePlayerStore((state) => state.positionSec);
  const durationSec = usePlayerStore((state) => state.durationSec);
  const playbackSpeed = usePlayerStore((state) => state.playbackSpeed);
  const error = usePlayerStore((state) => state.error);

  const {
    annotations,
    creating,
    error: noteError,
    create,
    update,
    remove,
  } = useTrackAnnotations(track?.id ?? null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!trackId) {
        return;
      }
      const loaded = await LocalDBService.getTrackById(trackId);
      if (!mounted) {
        return;
      }
      setTrack(loaded);
      if (loaded && usePlayerStore.getState().trackId !== loaded.id) {
        await TrackPlayerService.loadAndPlay(loaded);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [trackId]);

  const selected = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedId) ?? null,
    [annotations, selectedId],
  );

  const isPlaying = status === "playing";
  const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
  const title = track?.title ?? "Now Playing";
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

  const openComposer = () => {
    setEditingId(null);
    setDraftPositionSec(positionSec);
    setDraft("");
    setComposerOpen(true);
  };

  const startEdit = (annotation: LocalAnnotation) => {
    setEditingId(annotation.id);
    setDraftPositionSec(annotation.positionSec);
    setDraft(annotation.text);
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.artwork}>
              <ThemedText style={styles.artworkGlyph}>♪</ThemedText>
            </View>

            <View style={styles.meta}>
              <ThemedText type="smallBold" numberOfLines={2} style={styles.title}>
                {title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {track?.isAudiobook ? "Audiobook" : "Track"}
                {track?.author ? ` · ${track.author}` : ""}
              </ThemedText>
            </View>

            <View style={styles.progressRow}>
              <ThemedView type="backgroundElement" style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(progress * 100)}%`, backgroundColor: theme.tint },
                  ]}
                />
                {annotations.map((annotation) => (
                  <AnnotationMarker
                    key={annotation.id}
                    annotation={annotation}
                    durationSec={durationSec}
                    selected={annotation.id === selectedId}
                    onPress={onSelect}
                  />
                ))}
              </ThemedView>
              <View style={styles.times}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatClock(positionSec)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatClock(durationSec)}
                </ThemedText>
              </View>
            </View>

            {selected ? (
              <ThemedView type="backgroundSelected" style={styles.selectedCard}>
                <View style={styles.selectedHeader}>
                  <ThemedText type="smallBold">
                    {formatClock(selected.positionSec)}
                  </ThemedText>
                  <View style={styles.selectedActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => startEdit(selected)}>
                      <ThemedText type="linkPrimary">Edit</ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => confirmDelete(selected)}>
                      <ThemedText type="linkPrimary">Delete</ThemedText>
                    </Pressable>
                  </View>
                </View>
                <ThemedText type="small">{selected.text}</ThemedText>
              </ThemedView>
            ) : null}

            <View style={styles.controls}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void TrackPlayerService.seekTo(Math.max(0, positionSec - 30))}>
                <ThemedText type="smallBold">-30s</ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                style={styles.playButton}
                onPress={() => TrackPlayerService.togglePlayPause()}>
                <ThemedText style={styles.playGlyph}>{isPlaying ? "❚❚" : "▶"}</ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => void TrackPlayerService.seekTo(positionSec + 30)}>
                <ThemedText type="smallBold">+30s</ThemedText>
              </Pressable>
            </View>

            <View style={styles.secondaryRow}>
              <Pressable
                accessibilityRole="button"
                style={styles.speedButton}
                onPress={cycleSpeed}>
                <ThemedText type="smallBold">{playbackSpeed}x speed</ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!track}
                onPress={openComposer}
                style={[styles.noteButton, { borderColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold">+ Note</ThemedText>
              </Pressable>
            </View>

            {composerOpen ? (
              <ThemedView type="backgroundElement" style={styles.composer}>
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
              </ThemedView>
            ) : null}

            {statusMessage ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.error}>
                {statusMessage}
              </ThemedText>
            ) : null}

            <View style={styles.notes}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Notes
              </ThemedText>
              <AnnotationList
                annotations={annotations}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  artwork: {
    height: 220,
    borderRadius: Spacing.four,
    backgroundColor: "#208AEF",
    alignItems: "center",
    justifyContent: "center",
  },
  artworkGlyph: {
    color: "#ffffff",
    fontSize: 72,
    lineHeight: 84,
  },
  meta: {
    gap: Spacing.one,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
  },
  progressRow: {
    gap: Spacing.two,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  selectedCard: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#208AEF",
    alignItems: "center",
    justifyContent: "center",
  },
  playGlyph: {
    color: "#ffffff",
    fontSize: 24,
    lineHeight: 28,
  },
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  speedButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    backgroundColor: "#F0F0F3",
  },
  noteButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  composer: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  saveButton: {
    flex: 1,
  },
  error: {
    textAlign: "center",
  },
  notes: {
    gap: Spacing.two,
  },
});
