import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { AnnotationList } from "@/components/annotation-list";
import { SessionCard } from "@/components/session-card";
import { StatCell } from "@/components/stat-cell";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { PrimaryButton } from "@/components/ui/primary-button";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTrackDetail } from "@/hooks/use-track-detail";
import { formatDuration, type HistoryItem } from "@/lib/history";
import { computeTrackStats } from "@/lib/trackStats";

function formatLastPlayed(value: number | null): string {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

export default function TrackDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { data, loading, refresh } = useTrackDetail(id ?? null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const track = data?.track ?? null;
  const stats = computeTrackStats(data?.sessions ?? [], data?.annotations ?? []);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText type="subtitle" numberOfLines={2}>
            {track?.title ?? "Track"}
          </ThemedText>
          {track?.author ? (
            <ThemedText type="small" themeColor="textSecondary">
              {track.author}
            </ThemedText>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <StatCell label="plays" value={String(stats.playCount)} style={styles.statCell} />
          <StatCell
            label="listened"
            value={formatDuration(stats.totalListenTimeSec)}
            style={styles.statCell}
          />
          <StatCell
            label="last played"
            value={formatLastPlayed(stats.lastPlayedAt)}
            style={styles.statCell}
          />
        </View>

        {track ? (
          <PrimaryButton
            label="Play"
            onPress={() =>
              router.push({ pathname: "/player", params: { trackId: track.id } })
            }
          />
        ) : null}

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Sessions
          </ThemedText>
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
            <ThemedText type="small" themeColor="textSecondary">
              {loading ? "Loading…" : "No sessions recorded yet."}
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Notes
          </ThemedText>
          <AnnotationList annotations={data?.annotations ?? []} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  statCell: {
    flex: 1,
  },
  section: {
    gap: Spacing.two,
  },
});
