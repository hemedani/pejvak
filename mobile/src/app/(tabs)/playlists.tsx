import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { SmartPlaylistRow } from "@/components/smart-playlist-row";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { usePlaylists } from "@/hooks/use-playlists";
import { useSmartPlaylists } from "@/hooks/use-smart-playlists";
import { useTheme } from "@/hooks/use-theme";
import type { LocalPlaylist } from "@/lib/db/types";
import { paletteFor } from "@/lib/palette";
import { PlaylistService } from "@/services/PlaylistService";
import { radius as radii, spacing } from "@/theme/tokens";

/**
 * The header block (create row, SMART section, SAVED heading) occupies reveal
 * indices 1–9, so saved-playlist rows start at 10. Only the opening screenful
 * staggers in — recycled rows past this limit render immediately instead of
 * replaying a delayed fade. See `Reveal`'s `limit`.
 */
const ROW_REVEAL_LIMIT = 12;
const FIRST_SAVED_ROW_REVEAL_INDEX = 10;

function trackCount(playlist: LocalPlaylist): string {
  const count = playlist.items.length;
  return `${count} track${count === 1 ? "" : "s"}`;
}

export default function PlaylistsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { playlists, loading, refresh } = usePlaylists();
  const { playlists: smart, refresh: refreshSmart } = useSmartPlaylists();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // Smart lists are derived from listening history, so they go stale the
      // moment a track is played — re-read them alongside the saved ones.
      void refresh();
      void refreshSmart();
    }, [refresh, refreshSmart]),
  );

  const onCreate = async () => {
    setBusy(true);
    try {
      await PlaylistService.create(title);
      setTitle("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (playlist: LocalPlaylist) => {
    Alert.alert("Delete playlist?", `"${playlist.title}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void PlaylistService.remove(playlist.id).then(refresh);
        },
      },
    ]);
  };

  return (
    <Screen wash={theme.accent}>
      <FlatList
        data={playlists}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenHeader
              overline="COLLECTIONS"
              title="Playlists"
              subtitle={playlists.length > 0 ? `${playlists.length} saved` : undefined}
            />
            <Reveal index={1} style={styles.createRow}>
              <TextField
                label="New playlist"
                value={title}
                onChangeText={setTitle}
                placeholder="Name"
                returnKeyType="done"
                onSubmitEditing={() => void onCreate()}
                style={styles.createInput}
              />
              <PrimaryButton
                label="Create"
                loading={busy}
                disabled={title.trim().length === 0}
                onPress={() => void onCreate()}
                style={styles.createButton}
              />
            </Reveal>

            {smart.length > 0 ? (
              <View style={styles.smartSection}>
                <Reveal index={2}>
                  <ThemedText type="overline" themeColor="textTertiary">
                    SMART
                  </ThemedText>
                </Reveal>
                {smart.map((playlist, index) => (
                  <Reveal key={playlist.rule.id} index={index + 3} limit={ROW_REVEAL_LIMIT}>
                    <SmartPlaylistRow
                      playlist={playlist}
                      onPress={() =>
                        router.push({
                          pathname: "/smart/[rule]",
                          params: { rule: playlist.rule.id },
                        })
                      }
                    />
                  </Reveal>
                ))}
              </View>
            ) : null}

            <Reveal index={9}>
              <ThemedText type="overline" themeColor="textTertiary">
                SAVED
              </ThemedText>
            </Reveal>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              No playlists yet. Create one above, then add tracks to it.
            </ThemedText>
          )
        }
        renderItem={({ item, index }) => (
          <Reveal index={FIRST_SAVED_ROW_REVEAL_INDEX + index} limit={ROW_REVEAL_LIMIT}>
            <GlassSurface flat style={styles.row}>
              <ElasticPressable
                accessibilityRole="button"
                accessibilityLabel={`Open playlist ${item.title}`}
                onPress={() => router.push(`/playlist/${item.id}`)}
                style={styles.rowMain}>
                <PaletteTile
                  ramp={paletteFor(item.title)}
                  label={item.title}
                  size={44}
                  radius={13}
                />
                <View style={styles.rowCopy}>
                  <ThemedText type="bodyStrong" numberOfLines={1}>
                    {item.title}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {trackCount(item)}
                  </ThemedText>
                </View>
              </ElasticPressable>

              <BouncyIconButton
                name="trash"
                accessibilityLabel={`Delete playlist ${item.title}`}
                size={36}
                iconSize={17}
                tone="ghost"
                onPress={() => confirmDelete(item)}
              />
            </GlassSurface>
          </Reveal>
        )}
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
  createRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  createInput: {
    flex: 1,
  },
  createButton: {
    paddingHorizontal: spacing.xl,
  },
  smartSection: {
    gap: spacing.sm,
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

