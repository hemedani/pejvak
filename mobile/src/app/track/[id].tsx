import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";

import { AnnotationList } from "@/components/annotation-list";
import { CrossfadeArtwork } from "@/components/motion/CrossfadeArtwork";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { SessionCard } from "@/components/session-card";
import { StatCell } from "@/components/stat-cell";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useTrackDetail } from "@/hooks/use-track-detail";
import { useTheme } from "@/hooks/use-theme";
import { annotationsToMarkdown } from "@/lib/exportAnnotations";
import { formatDuration, type HistoryItem } from "@/lib/history";
import { paletteFor } from "@/lib/palette";
import { computeTrackStats } from "@/lib/trackStats";
import { spacing } from "@/theme/tokens";

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
  const stats = useMemo(
    () => computeTrackStats(data?.sessions ?? [], annotations),
    [annotations, data?.sessions],
  );
  const ramp = paletteFor(track?.contentHash ?? params.id);

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

  return (
    <Screen wash={ramp[1]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          onBack={() => router.back()}
          overline="TRACK DETAIL"
          title={track?.title ?? "Track"}
          subtitle={track?.author ?? undefined}
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

        <View style={styles.statsRow}>
          <StatCell index={2} label="plays" value={String(stats.playCount)} style={styles.statCell} />
          <StatCell
            index={3}
            label="listened"
            value={formatDuration(stats.totalListenTimeSec)}
            style={styles.statCell}
          />
          <StatCell
            index={4}
            label="last played"
            value={formatLastPlayed(stats.lastPlayedAt)}
            style={styles.statCell}
          />
        </View>

        {track ? (
          <Reveal index={5}>
            <PrimaryButton
              label="Play"
              onPress={() => router.push({ pathname: "/player", params: { trackId: track.id } })}
            />
          </Reveal>
        ) : null}

        {track && annotations.length > 0 ? (
          <Reveal index={6}>
            <ElasticPressable
              accessibilityRole="button"
              onPress={() => void exportNotes()}
              style={styles.exportRow}>
              <Icon name="share" size={16} color={theme.accent} />
              <ThemedText type="label" style={{ color: theme.accent }}>
                Export notes as Markdown
              </ThemedText>
            </ElasticPressable>
          </Reveal>
        ) : null}

        <View style={styles.section}>
          <Reveal index={7}>
            <ThemedText type="overline" themeColor="textTertiary">
              SESSIONS
            </ThemedText>
          </Reveal>
          {data && data.sessions.length > 0 ? (
            data.sessions.map((session) => {
              const item: HistoryItem = {
                session,
                track: {
                  id: data.track.id,
                  title: data.track.title,
                  author: data.track.author,
                  contentHash: data.track.contentHash,
                },
              };
              return <SessionCard key={session.id} item={item} />;
            })
          ) : (
            <ThemedText type="caption" themeColor="textTertiary">
              {loading ? "Loading…" : "No sessions recorded yet."}
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <Reveal index={8}>
            <ThemedText type="overline" themeColor="textTertiary">
              NOTES
            </ThemedText>
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
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statCell: {
    flex: 1,
  },
  exportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 46,
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  section: {
    gap: spacing.sm,
  },
});
