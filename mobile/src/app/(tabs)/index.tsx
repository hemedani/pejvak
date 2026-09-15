import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useTheme } from "@/hooks/use-theme";
import type { LocalTrack } from "@/lib/db/types";
import { paletteFor } from "@/lib/palette";
import { importAudioFiles } from "@/services/LibraryService";
import { LocalDBService } from "@/services/LocalDBService";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { radius as radii, spacing } from "@/theme/tokens";

/**
 * The header block occupies reveal indices 1 and 2, so list rows start at 3.
 * Only the opening screenful staggers in — recycled rows past this limit render
 * immediately instead of replaying a 320 ms-delayed fade. See `Reveal`'s `limit`.
 */
const ROW_REVEAL_LIMIT = 12;

function formatLastPlayed(value: number | null): string {
  if (!value) {
    return "Never played";
  }
  return `Last played ${new Date(value).toLocaleDateString()}`;
}

export default function LibraryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState(false);

  const continueTrack = useMemo(
    () =>
      tracks
        .filter((item) => item.lastPlayedAt !== null)
        .sort((left, right) => (right.lastPlayedAt ?? 0) - (left.lastPlayedAt ?? 0))[0],
    [tracks],
  );

  const wash = continueTrack ? paletteFor(continueTrack.contentHash)[1] : theme.accent;

  const refresh = useCallback(async () => {
    const [allTracks, counts] = await Promise.all([
      LocalDBService.getAllTracks(),
      LocalDBService.getAnnotationCounts(),
    ]);
    setTracks(allTracks);
    setAnnotationCounts(counts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const playAt = useCallback(
    (index: number) => {
      const ids = tracks.map((track) => track.id);
      const trackId = ids[index];
      if (!trackId) {
        return;
      }
      // The whole library becomes the queue, so next/previous step through it.
      void TrackPlayerService.playQueueAt(ids, index);
      router.push({ pathname: "/player", params: { trackId } });
    },
    [router, tracks],
  );

  const onImport = useCallback(async () => {
    setImporting(true);
    try {
      const imported = await importAudioFiles();
      await refresh();
      const first = imported[0];
      if (imported.length === 1 && first) {
        void TrackPlayerService.playQueueAt([first.id], 0);
        router.push({ pathname: "/player", params: { trackId: first.id } });
      }
    } finally {
      setImporting(false);
    }
  }, [refresh, router]);

  const header = (
    <View style={styles.headerBlock}>
      <ScreenHeader
        overline="YOUR LISTENING SPACE"
        title="Library"
        subtitle={tracks.length > 0 ? `${tracks.length} tracks` : undefined}
        action={
          <BouncyIconButton
            name="settings"
            accessibilityLabel="Settings"
            size={42}
            iconSize={20}
            tone="glass"
            onPress={() => router.push("/settings")}
          />
        }
      />

      {continueTrack ? (
        <Reveal index={1}>
          <GlassSurface tone="surfaceStrong" style={styles.continueCard}>
            <ElasticPressable
              accessibilityRole="button"
              accessibilityLabel={`Continue listening to ${continueTrack.title}`}
              onPress={() => {
                const index = tracks.findIndex((track) => track.id === continueTrack.id);
                playAt(index >= 0 ? index : 0);
              }}
              style={styles.continueMain}>
              <PaletteTile
                ramp={paletteFor(continueTrack.contentHash)}
                label={continueTrack.title}
                size={58}
                radius={16}
              />
              <View style={styles.continueCopy}>
                <ThemedText type="overline" themeColor="textTertiary">
                  CONTINUE LISTENING
                </ThemedText>
                <ThemedText type="bodyStrong" numberOfLines={2}>
                  {continueTrack.title}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {continueTrack.totalPlayCount} play
                  {continueTrack.totalPlayCount === 1 ? "" : "s"}
                </ThemedText>
              </View>
            </ElasticPressable>

            <BouncyIconButton
              name="play"
              accessibilityLabel={`Play ${continueTrack.title}`}
              size={52}
              iconSize={22}
              tone="accent"
              style={{ backgroundColor: paletteFor(continueTrack.contentHash)[1] }}
              onPress={() => {
                const index = tracks.findIndex((track) => track.id === continueTrack.id);
                playAt(index >= 0 ? index : 0);
              }}
            />
          </GlassSurface>
        </Reveal>
      ) : null}

      <Reveal index={2}>
        <PrimaryButton
          label={importing ? "Importing…" : "Add audio files"}
          loading={importing}
          onPress={() => void onImport()}
        />
      </Reveal>
    </View>
  );

  return (
    <Screen wash={wash}>
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
            No tracks yet. Add an audio file to start listening.
          </ThemedText>
        }
        renderItem={({ item, index }) => {
          const notes = annotationCounts[item.id] ?? 0;
          return (
            <Reveal index={index + 3} from="below" limit={ROW_REVEAL_LIMIT}>
              <GlassSurface flat style={styles.row}>
                <ElasticPressable
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${item.title}`}
                  onPress={() => playAt(index)}
                  style={styles.rowMain}>
                  <PaletteTile
                    ramp={paletteFor(item.contentHash)}
                    label={item.title}
                    size={44}
                    radius={13}
                  />
                  <View style={styles.rowCopy}>
                    <ThemedText type="bodyStrong" numberOfLines={1}>
                      {item.title}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                      {item.totalPlayCount} play{item.totalPlayCount === 1 ? "" : "s"} · {notes} note
                      {notes === 1 ? "" : "s"}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
                      {formatLastPlayed(item.lastPlayedAt)}
                    </ThemedText>
                  </View>
                </ElasticPressable>

                <BouncyIconButton
                  name="chevronRight"
                  accessibilityLabel={`Details for ${item.title}`}
                  size={36}
                  iconSize={16}
                  tone="ghost"
                  onPress={() => router.push(`/track/${item.id}`)}
                />
              </GlassSurface>
            </Reveal>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + 96,
  },
  headerBlock: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    paddingRight: spacing.lg,
    borderRadius: 26,
  },
  continueMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    minWidth: 0,
  },
  continueCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
