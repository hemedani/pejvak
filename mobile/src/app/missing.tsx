/**
 * The files that moved out from under the library.
 *
 * Pejvak references audio in place rather than copying it, so a moved folder
 * leaves rows pointing at nothing. Those rows are not lost data — they are the
 * ones holding the listening history — so this screen exists to say so plainly
 * and to point the user at the one action that fixes them.
 *
 * It groups by source folder on purpose: "5 files missing from Lectures" tells
 * the listener which folder to hand the scan, where a flat list of filenames
 * would not.
 */

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import {
  EmptyState,
  InlineNotice,
  ListGroup,
  ListRow,
  SkeletonRows,
} from "@/components/ui/row";
import { useMissingTracks } from "@/hooks/use-missing-tracks";
import { useTheme } from "@/hooks/use-theme";
import { paletteFor } from "@/lib/palette";
import { describeStake, groupByFolder, summariseMissing } from "@/services/RelinkService";
import { iconSize, miniPlayerInset, spacing, tile, tileRadius } from "@/theme/tokens";

export default function MissingFilesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { missing, loading, refresh } = useMissingTracks();

  // A relink happens on the import screen, so this has to re-read on the way
  // back or it would keep listing files that are already fixed.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const groups = useMemo(() => groupByFolder(missing), [missing]);

  return (
    <Screen wash={theme.accent}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          onBack={() => router.back()}
          overline="LIBRARY"
          title="Missing files"
          subtitle={summariseMissing(missing)}
        />

        {missing.length === 0 ? (
          loading ? (
            <SkeletonRows count={3} />
          ) : (
            <EmptyState
              icon="check"
              title="Every file is where it should be"
              message="Nothing in your library is pointing at a file that has moved or been deleted."
            />
          )
        ) : (
          <>
            <Reveal index={1}>
              <InlineNotice
                tone="danger"
                icon="alert"
                title="Nothing here is lost"
                message={
                  "Pejvak plays your audio where it already lives instead of copying it, so moving a folder leaves these tracks behind. Point a scan at the new location and they are re-pointed in place — your history and notes stay attached, because a file's content is what identifies it, not its path."
                }
                action={
                  <PrimaryButton label="Find them again" onPress={() => router.push("/import")} />
                }
              />
            </Reveal>

            {groups.map((group, groupIndex) => (
              <View key={group.folderKey ?? "__no_folder__"} style={styles.section}>
                <Reveal index={groupIndex + 2}>
                  <View style={styles.groupHead}>
                    <Icon name="folder" size={13} color={theme.textTertiary} />
                    <ThemedText type="overline" themeColor="textTertiary" numberOfLines={1}>
                      {group.folderName}
                    </ThemedText>
                    <ThemedText type="overline" themeColor="textTertiary">
                      {group.tracks.length}
                    </ThemedText>
                  </View>
                </Reveal>

                <ListGroup>
                  {group.tracks.map((item) => {
                    const stake = describeStake(item);
                    return (
                      <ListRow
                        key={item.track.id}
                        title={item.track.title}
                        titleLines={1}
                        detail={stake ?? "Never played"}
                        leading={
                          <PaletteTile
                            ramp={paletteFor(item.track.contentHash)}
                            label={item.track.title}
                            source={item.track.artworkUrl}
                            size={tile.md}
                            radius={tileRadius(tile.md)}
                            recyclingKey={item.track.contentHash}
                            dense
                          />
                        }
                        leadingWidth={tile.md}
                        trailing={
                          <Icon name="chevronRight" size={iconSize.sm} color={theme.textTertiary} />
                        }
                        accessibilityLabel={`Open ${item.track.title}`}
                        onPress={() =>
                          router.push({
                            pathname: "/track/[id]",
                            params: { id: item.track.id },
                          })
                        }
                      />
                    );
                  })}
                </ListGroup>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + miniPlayerInset,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
