/**
 * Track details — everything the app can say about one audio file.
 *
 * The screen is deliberately a reading surface rather than a control surface:
 * the only actions are play, add to a playlist, and export the notes. What it
 * carries instead is every fact the app holds, in four groups —
 *
 * - **AUDIO** — what the stream itself declares: codec, bitrate, sample rate,
 *   channels, the duration it states, and the cover art it embeds. Read from the
 *   file's own header when this screen opens, never from a stored copy.
 * - **PLAYBACK** — the product's actual differentiator: how many sessions, how
 *   many finished, the longest and the average, the speeds it has been heard at.
 * - **TAGS** — the ID3 tag's own fields, including the ones nothing else in the
 *   app displays: composer, genre, publisher, ISRC, encoder, lyrics.
 * - **FILE** — provenance: where the bytes are, how the library got them, the
 *   content hash that is the track's real identity, and whether it is synced.
 *
 * Facts the file does not have are omitted rather than shown as a dash, which is
 * why the sections are built by `buildTrackFactSections` and not inline here.
 */

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";

import { AddToPlaylistButton } from "@/components/add-to-playlist";
import { AnnotationList } from "@/components/annotation-list";
import { FactList } from "@/components/fact-list";
import { CrossfadeArtwork } from "@/components/motion/CrossfadeArtwork";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { SessionCard } from "@/components/session-card";
import { StatCell } from "@/components/stat-cell";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useAudioInspection } from "@/hooks/use-audio-inspection";
import { useTheme } from "@/hooks/use-theme";
import { useTrackDetail } from "@/hooks/use-track-detail";
import { annotationsToMarkdown } from "@/lib/exportAnnotations";
import { formatDuration, type HistoryItem } from "@/lib/history";
import { paletteFor } from "@/lib/palette";
import { confirmRemoveSession, sessionResumeParams } from "@/lib/sessionActions";
import { buildTrackFactSections } from "@/lib/trackFacts";
import { computeTrackStats, summariseSessions } from "@/lib/trackStats";
import { LocalDBService } from "@/services/LocalDBService";
import { spacing } from "@/theme/tokens";

/**
 * Reveal indices. The header, artwork and play button take 0–2, the stat grid
 * 3–6, and the fact sections start at 7 — one per section plus its heading, so
 * the groups settle in reading order.
 */
const FACTS_START_INDEX = 7;
const FACTS_INDEX_STRIDE = 2;

function formatLastPlayed(value: number | null): string {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

export default function TrackDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { data, loading, refresh } = useTrackDetail(params.id ?? null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const track = data?.track ?? null;
  const annotations = useMemo(() => data?.annotations ?? [], [data?.annotations]);
  const sessions = useMemo(() => data?.sessions ?? [], [data?.sessions]);
  const stats = useMemo(() => computeTrackStats(sessions, annotations), [annotations, sessions]);
  const summary = useMemo(() => summariseSessions(sessions), [sessions]);
  const ramp = paletteFor(track?.contentHash ?? params.id);

  const { inspection, loading: readingFile, error: fileError } = useAudioInspection(track);

  const sections = useMemo(
    () =>
      track
        ? buildTrackFactSections({
            track,
            stats,
            summary,
            info: inspection.info,
            details: inspection.tag.details,
            tag: inspection.tag,
            artworkBytes: inspection.artworkBytes,
            artworkMime: inspection.artworkMime,
          })
        : [],
    [inspection, stats, summary, track],
  );

  const exportNotes = async () => {
    if (!track) {
      return;
    }
    try {
      await Share.share({
        title: `${track.title} — annotations`,
        message: annotationsToMarkdown(track, annotations),
      });
    } catch {
      // The share sheet was dismissed or sharing is unavailable.
    }
  };

  /** Replays a session from where it left off — the same rule History uses. */
  const replay = (item: HistoryItem) => {
    router.push({ pathname: "/player", params: sessionResumeParams(item) });
  };

  const remove = async (item: HistoryItem) => {
    await LocalDBService.softDeleteSession(item.session.id);
    await refresh();
  };

  const confirmRemove = (item: HistoryItem) => {
    confirmRemoveSession(item, () => void remove(item));
  };

  const missing = track?.availability === "missing";

  /** One status line for the AUDIO group: why it is short, or why it is gone. */
  const audioNote = readingFile ? "Reading the audio file…" : fileError;
  const hasAudioSection = sections.some((section) => section.title === "AUDIO");

  return (
    <Screen wash={ramp[1]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          onBack={() => router.back()}
          overline={track?.isAudiobook ? "AUDIOBOOK" : "TRACK"}
          title={track?.title ?? "Track"}
          subtitle={track?.author ?? undefined}
          action={
            track ? (
              <AddToPlaylistButton
                trackIds={[track.id]}
                title={track.title}
                ramp={ramp}
                artwork={track.artworkUrl}
                size={42}
                iconSize={20}
                tone="glass"
              />
            ) : null
          }
        />

        <Reveal index={1}>
          <View style={[styles.artWrap, { shadowColor: ramp[1] }]}>
            <CrossfadeArtwork
              source={track?.artworkUrl}
              ramp={ramp}
              label={track?.title}
              radius={28}
              style={styles.art}
            />
          </View>
        </Reveal>

        {/* A missing file is the one thing on this screen that changes what the
            buttons do, so it is stated before them rather than in the FILE
            group further down. */}
        {missing ? (
          <Reveal index={2}>
            <GlassSurface tone="surfaceStrong" style={styles.missingCard}>
              <ElasticPressable
                accessibilityRole="button"
                accessibilityLabel="Find missing files"
                onPress={() => router.push("/missing")}
                style={styles.missingRow}>
                <Icon name="alert" size={20} color={theme.danger} />
                <View style={styles.missingCopy}>
                  <ThemedText type="bodyStrong">File missing</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    Your history is still here — find the file again
                  </ThemedText>
                </View>
                <Icon name="chevronRight" size={16} color={theme.textTertiary} />
              </ElasticPressable>
            </GlassSurface>
          </Reveal>
        ) : null}

        {track ? (
          <Reveal index={2}>
            <PrimaryButton
              label={missing ? "File missing" : "Play"}
              disabled={missing}
              onPress={() => router.push({ pathname: "/player", params: { trackId: track.id } })}
            />
          </Reveal>
        ) : null}

        <View style={styles.statsRow}>
          <StatCell index={3} label="sessions" value={String(stats.playCount)} style={styles.statCell} />
          <StatCell
            index={4}
            label="finished"
            value={String(summary.completedCount)}
            style={styles.statCell}
          />
          <StatCell
            index={5}
            label="listened"
            value={formatDuration(stats.totalListenTimeSec)}
            style={styles.statCell}
          />
          <StatCell
            index={6}
            label="last played"
            value={formatLastPlayed(stats.lastPlayedAt)}
            style={styles.statCell}
          />
        </View>

        {sections.map((section, sectionIndex) => (
          <View key={section.title} style={styles.section}>
            <Reveal index={FACTS_START_INDEX + sectionIndex * FACTS_INDEX_STRIDE}>
              <ThemedText type="overline" themeColor="textTertiary">
                {section.title}
              </ThemedText>
            </Reveal>
            <Reveal index={FACTS_START_INDEX + sectionIndex * FACTS_INDEX_STRIDE + 1}>
              <FactList facts={section.facts} />
              {/* The AUDIO group is the one built from a read that may still be
                  in flight, so its status belongs under its own heading — a
                  caption at the foot of the panel would sit under FILE and read
                  as if it were about the file's location. */}
              {section.title === "AUDIO" && audioNote ? (
                <ThemedText type="caption" themeColor="textTertiary" style={styles.audioNote}>
                  {audioNote}
                </ThemedText>
              ) : null}
            </Reveal>
          </View>
        ))}

        {/* Defensive: the AUDIO group is dropped when it has nothing to say,
            which is exactly the case where the read failed. Without this the
            reason would never reach the screen. */}
        {!hasAudioSection && audioNote ? (
          <ThemedText type="caption" themeColor="textTertiary">
            {audioNote}
          </ThemedText>
        ) : null}

        <View style={styles.section}>
          <Reveal index={FACTS_START_INDEX + sections.length * FACTS_INDEX_STRIDE}>
            <ThemedText type="overline" themeColor="textTertiary">
              SESSIONS
            </ThemedText>
          </Reveal>
          {sessions.length > 0 ? (
            sessions.map((session) => {
              const item: HistoryItem = {
                session,
                track: {
                  id: track?.id ?? "",
                  title: track?.title ?? "",
                  author: track?.author ?? null,
                  contentHash: track?.contentHash ?? "",
                  isAudiobook: track?.isAudiobook ?? false,
                  artworkUrl: track?.artworkUrl ?? null,
                },
              };
              return (
                <SessionCard
                  key={session.id}
                  item={item}
                  onPress={replay}
                  // A session still being written has nothing to tombstone yet.
                  onDelete={session.endedAt === null ? undefined : confirmRemove}
                />
              );
            })
          ) : (
            <ThemedText type="caption" themeColor="textTertiary">
              {loading ? "Loading…" : "No sessions recorded yet."}
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <Reveal index={FACTS_START_INDEX + (sections.length + 1) * FACTS_INDEX_STRIDE}>
            <View style={styles.sectionHeader}>
              <ThemedText type="overline" themeColor="textTertiary">
                NOTES
              </ThemedText>
              {annotations.length > 0 ? (
                <ElasticPressable
                  accessibilityRole="button"
                  accessibilityLabel="Export notes as Markdown"
                  onPress={() => void exportNotes()}
                  style={styles.exportRow}>
                  <Icon name="share" size={15} color={theme.accent} />
                  <ThemedText type="label" style={{ color: theme.accent }}>
                    Export
                  </ThemedText>
                </ElasticPressable>
              ) : null}
            </View>
          </Reveal>
          <AnnotationList annotations={annotations} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant,
    gap: spacing.xl,
  },
  artWrap: {
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.45,
    shadowRadius: 36,
    elevation: 14,
  },
  art: {
    width: "100%",
    aspectRatio: 1.35,
  },
  missingCard: {
    borderRadius: 22,
  },
  missingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    minWidth: 0,
  },
  missingCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  statCell: {
    // Two per row on a phone; the wrap handles a fourth without a nested grid.
    flexGrow: 1,
    flexBasis: "45%",
  },
  section: {
    gap: spacing.sm,
  },
  audioNote: {
    paddingTop: spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    minHeight: 24,
  },
  exportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
