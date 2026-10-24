import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { SmartPlaylistRow } from "@/components/smart-playlist-row";
import { ThemedText } from "@/components/themed-text";
import { KeyboardAwareFlatList } from "@/components/ui/keyboard-scroll-view";
import { MediaCard } from "@/components/ui/media-card";
import { PrimaryButton } from "@/components/ui/primary-button";
import {
  addToPlaylistAction,
  deleteAction,
  EmptyState,
  historyAction,
  ListGroup,
  playPlaylistAction,
} from "@/components/ui/row";
import { TextField } from "@/components/ui/text-field";
import { usePlaylists } from "@/hooks/use-playlists";
import { useSmartPlaylists } from "@/hooks/use-smart-playlists";
import { useTheme } from "@/hooks/use-theme";
import type { LocalPlaylist } from "@/lib/db/types";
import { PlaylistService } from "@/services/PlaylistService";
import { dockInset, spacing } from "@/theme/tokens";
import { listPerformance } from "@/lib/listPerformance";

/**
 * Only the opening screenful staggers in — recycled rows past this limit render
 * immediately instead of replaying a delayed fade. See `Reveal`'s `limit`.
 *
 * The header's reveal indices are derived below rather than numbered by hand:
 * the SMART section is conditional, and a hardcoded "saved rows start at 10"
 * would skip a beat whenever it was absent.
 */
const ROW_REVEAL_LIMIT = 12;

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

  const playPlaylist = useCallback(
    async (playlistId: string) => {
      const entryId = await PlaylistService.play(playlistId, 0);
      if (entryId) {
        router.push({ pathname: "/player", params: { trackId: entryId } });
      }
    },
    [router],
  );

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

  const savedHeadingIndex = smart.length > 0 ? 4 : 2;
  const firstSavedRowRevealIndex = savedHeadingIndex + 1;

  return (
    <Screen wash={theme.accent}>
      <KeyboardAwareFlatList
        {...listPerformance}
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
                autoComplete="off"
                importantForAutofill="no"
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={() => void onCreate()}
                containerStyle={styles.createInput}
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
                <Reveal index={3} limit={ROW_REVEAL_LIMIT}>
                  <ListGroup>
                    {smart.map((playlist) => (
                      <SmartPlaylistRow
                        key={playlist.rule.id}
                        playlist={playlist}
                        onPress={() =>
                          router.push({
                            pathname: "/smart/[rule]",
                            params: { rule: playlist.rule.id },
                          })
                        }
                      />
                    ))}
                  </ListGroup>
                </Reveal>
              </View>
            ) : null}

            <Reveal index={savedHeadingIndex}>
              <ThemedText type="overline" themeColor="textTertiary">
                SAVED
              </ThemedText>
            </Reveal>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="playlists"
              title="No playlists yet"
              message="Create one above, then add tracks to it."
            />
          )
        }
        renderItem={({ item, index }) => {
          const resolveTrackIds = async () => {
            const detail = await PlaylistService.loadDetail(item.id);
            return (detail?.tracks ?? [])
              .filter((track) => track.availability !== "missing")
              .map((track) => track.id);
          };

          return (
            <Reveal
              index={firstSavedRowRevealIndex + index}
              limit={ROW_REVEAL_LIMIT}>
              <MediaCard
                title={item.title}
                meta={trackCount(item)}
                paletteKey={item.title}
                onPress={() => router.push(`/playlist/${item.id}`)}
                accessibilityLabel={`Open playlist ${item.title}`}
                accessibilityHint="Opens this playlist"
                actions={[
                  playPlaylistAction({
                    title: item.title,
                    onPress: () => void playPlaylist(item.id),
                    tone: "glass",
                  }),
                  addToPlaylistAction({
                    title: item.title,
                    resolveTrackIds,
                    isBatch: true,
                    tone: "glass",
                  }),
                  historyAction({
                    type: "playlist",
                    contextKey: item.id,
                    title: item.title,
                    tone: "glass",
                  }),
                  deleteAction({
                    title: item.title,
                    onPress: () => confirmDelete(item),
                  }),
                ]}
              />
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
    paddingBottom: spacing.giant + dockInset,
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
});

