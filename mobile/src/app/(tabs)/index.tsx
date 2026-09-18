import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { AddToPlaylistButton } from "@/components/add-to-playlist";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassChip, GlassProgress, GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useFolders } from "@/hooks/use-folders";
import { useMissingTracks } from "@/hooks/use-missing-tracks";
import { useTheme } from "@/hooks/use-theme";
import type { FolderSummary, LocalTrack } from "@/lib/db/types";
import { describeFolderProgress, folderProgressRatio } from "@/lib/folderPlay";
import { formatDuration } from "@/lib/history";
import { folderKeyToRouteSegment } from "@/lib/mediaFolders";
import { paletteFor } from "@/lib/palette";
import { FolderService } from "@/services/FolderService";
import { LocalDBService } from "@/services/LocalDBService";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { radius as radii, spacing } from "@/theme/tokens";

/**
 * The header block occupies reveal indices 1–4 (view toggle, continue card,
 * missing-files alert, add-audio button), so list rows start at 5. Only the
 * opening screenful staggers in — recycled rows past this limit render
 * immediately instead of replaying a 320 ms-delayed fade. See `Reveal`'s `limit`.
 */
const ROW_REVEAL_LIMIT = 12;
const FIRST_ROW_REVEAL_INDEX = 5;

type LibraryView = "tracks" | "folders";

function formatLastPlayed(value: number | null): string {
  if (!value) {
    return "Never played";
  }
  return `Last played ${new Date(value).toLocaleDateString()}`;
}

export default function LibraryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [view, setView] = useState<LibraryView>("tracks");
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const { folders, refresh: refreshFolders } = useFolders();
  const { missing, refresh: refreshMissing } = useMissingTracks();

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
    // Folders are derived from the tracks table, so a rescan or an import can
    // add one without any screen noticing; re-read on focus alongside them.
    await refreshFolders();
    // A relink writes to the tracks table too, so the alert has to re-read or
    // it would keep offering to fix something already fixed.
    await refreshMissing();
  }, [refreshFolders, refreshMissing]);

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

  const openFolder = useCallback(
    (folderKey: string) => {
      // Param object rather than an interpolated path: a folder key contains
      // slashes (`Lectures/Physics`) and has to be encoded as one segment. The
      // storage-root folder needs a stand-in too, since its key is empty.
      router.push({
        pathname: "/folder/[key]",
        params: { key: folderKeyToRouteSegment(folderKey) },
      });
    },
    [router],
  );

  /**
   * Plays a folder straight from its card, without opening it. This is the
   * whole point of folder play — one tap continues the course from wherever the
   * listener stopped, so it must not cost a navigation first.
   */
  const playFolder = useCallback(
    async (folderKey: string) => {
      const entryId = await FolderService.play(folderKey, "resume");
      if (entryId) {
        router.push({ pathname: "/player", params: { trackId: entryId } });
      }
    },
    [router],
  );

  // Importing happens on its own screen; `useFocusEffect` above refreshes the
  // list when the user comes back from it.
  const onImport = useCallback(() => {
    router.push("/import");
  }, [router]);

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

      <Reveal index={1}>
        <View style={styles.viewToggle}>
          <GlassChip
            label="Tracks"
            icon="music"
            selected={view === "tracks"}
            onPress={() => setView("tracks")}
          />
          <GlassChip
            label="Folders"
            icon="folder"
            selected={view === "folders"}
            onPress={() => setView("folders")}
          />
        </View>
      </Reveal>

      {continueTrack ? (
        <Reveal index={2}>
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

      {/* Only when something is actually broken. A standing "0 files missing"
          banner would just train the listener to ignore it. */}
      {missing.length > 0 ? (
        <Reveal index={3}>
          <GlassSurface tone="surfaceStrong" style={styles.missingCard}>
            <ElasticPressable
              accessibilityRole="button"
              accessibilityLabel={`${missing.length} file${missing.length === 1 ? "" : "s"} missing. Find them again.`}
              onPress={() => router.push("/missing")}
              style={styles.missingMain}>
              <Icon name="alert" size={20} color={theme.danger} />
              <View style={styles.missingCopy}>
                <ThemedText type="bodyStrong" numberOfLines={1}>
                  {missing.length} file{missing.length === 1 ? "" : "s"} missing
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                  Your history is still here — find them again
                </ThemedText>
              </View>
              <Icon name="chevronRight" size={16} color={theme.textTertiary} />
            </ElasticPressable>
          </GlassSurface>
        </Reveal>
      ) : null}

      <Reveal index={4}>
        <PrimaryButton label="Add audio" onPress={onImport} />
      </Reveal>
    </View>
  );

  const renderFolder = (folder: FolderSummary, index: number) => {
    const ramp = paletteFor(folder.key);
    return (
      <Reveal
        index={FIRST_ROW_REVEAL_INDEX + index}
        from="below"
        limit={ROW_REVEAL_LIMIT}>
        <GlassSurface flat style={styles.row}>
          <ElasticPressable
            accessibilityRole="button"
            accessibilityLabel={`Open folder ${folder.name}`}
            onPress={() => openFolder(folder.key)}
            style={styles.rowMain}>
            <PaletteTile ramp={ramp} label={folder.name} size={44} radius={13} />
            <View style={styles.rowCopy}>
              <ThemedText type="bodyStrong" numberOfLines={1}>
                {folder.name}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                {describeFolderProgress(folder.finishedCount, folder.trackCount)}
                {folder.totalDurationSec > 0 ? ` · ${formatDuration(folder.totalDurationSec)}` : ""}
              </ThemedText>
              <GlassProgress
                progress={folderProgressRatio(folder.finishedCount, folder.trackCount)}
                tint={ramp[1]}
                thickness={4}
                style={styles.folderBar}
              />
            </View>
          </ElasticPressable>

          <BouncyIconButton
            name="play"
            accessibilityLabel={`Play folder ${folder.name}`}
            size={40}
            iconSize={18}
            tone="glass"
            onPress={() => void playFolder(folder.key)}
          />

          {/* The folder's contents are not loaded on this screen, so the ids are
              resolved on tap rather than per card. Missing files are left out,
              matching the folder screen: a playlist is a promise to play
              something later, and a file whose bytes are gone cannot keep it.

              No subtitle, so the sheet counts what was actually resolved
              instead of repeating the card's total and disagreeing with it. */}
          <AddToPlaylistButton
            title={folder.name}
            ramp={ramp}
            isBatch
            size={40}
            iconSize={18}
            tone="glass"
            resolveTrackIds={async () =>
              (await LocalDBService.getTracksByFolder(folder.key))
                .filter((track) => track.availability !== "missing")
                .map((track) => track.id)
            }
          />
        </GlassSurface>
      </Reveal>
    );
  };

  return (
    <Screen wash={wash}>
      {view === "tracks" ? (
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
              <Reveal
                index={FIRST_ROW_REVEAL_INDEX + index}
                from="below"
                limit={ROW_REVEAL_LIMIT}>
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
                        {item.totalPlayCount} play{item.totalPlayCount === 1 ? "" : "s"} · {notes}{" "}
                        note{notes === 1 ? "" : "s"}
                      </ThemedText>
                      <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
                        {formatLastPlayed(item.lastPlayedAt)}
                      </ThemedText>
                    </View>
                  </ElasticPressable>

                  <AddToPlaylistButton
                    trackIds={[item.id]}
                    title={item.title}
                    ramp={paletteFor(item.contentHash)}
                    size={34}
                    iconSize={16}
                    tone="ghost"
                  />

                  <BouncyIconButton
                    name="chevronRight"
                    accessibilityLabel={`Details for ${item.title}`}
                    size={34}
                    iconSize={16}
                    tone="ghost"
                    onPress={() => router.push(`/track/${item.id}`)}
                  />
                </GlassSurface>
              </Reveal>
            );
          }}
        />
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(item) => item.key || "root"}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              No folders yet. They appear automatically once your audio sits in folders on the
              device.
            </ThemedText>
          }
          renderItem={({ item, index }) => renderFolder(item, index)}
        />
      )}
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
  viewToggle: {
    flexDirection: "row",
    gap: spacing.sm,
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
  missingCard: {
    borderRadius: 22,
  },
  missingMain: {
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
  folderBar: {
    marginTop: spacing.xs,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
