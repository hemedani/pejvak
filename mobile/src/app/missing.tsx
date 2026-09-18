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

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useMissingTracks } from "@/hooks/use-missing-tracks";
import { useTheme } from "@/hooks/use-theme";
import { paletteFor } from "@/lib/palette";
import { describeStake, groupByFolder, summariseMissing } from "@/services/RelinkService";
import { spacing } from "@/theme/tokens";

const ROW_REVEAL_LIMIT = 12;

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
          <Reveal index={1}>
            <GlassSurface tone="surfaceStrong" style={styles.card}>
              <View style={styles.cardHead}>
                <Icon name="check" size={18} color={theme.accent} />
                <ThemedText type="bodyStrong">
                  {loading ? "Checking…" : "Every file is where it should be"}
                </ThemedText>
              </View>
              <ThemedText type="caption" themeColor="textSecondary">
                Nothing in your library is pointing at a file that has moved or been deleted.
              </ThemedText>
            </GlassSurface>
          </Reveal>
        ) : (
          <>
            <Reveal index={1}>
              <GlassSurface tone="surfaceStrong" style={styles.card}>
                <View style={styles.cardHead}>
                  <Icon name="alert" size={18} color={theme.danger} />
                  <ThemedText type="bodyStrong">Nothing here is lost</ThemedText>
                </View>
                <ThemedText type="caption" themeColor="textSecondary">
                  Pejvak plays your audio where it already lives instead of copying it, so moving a
                  folder leaves these tracks behind. Point a scan at the new location and they are
                  re-pointed in place — your history and notes stay attached, because a file&apos;s
                  content is what identifies it, not its path.
                </ThemedText>
                <PrimaryButton label="Find them again" onPress={() => router.push("/import")} />
              </GlassSurface>
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

                {group.tracks.map((item, index) => {
                  const stake = describeStake(item);
                  return (
                    <Reveal
                      key={item.track.id}
                      index={index + groupIndex + 3}
                      limit={ROW_REVEAL_LIMIT}>
                      <GlassSurface flat style={styles.row}>
                        <ElasticPressable
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${item.track.title}`}
                          onPress={() =>
                            router.push({
                              pathname: "/track/[id]",
                              params: { id: item.track.id },
                            })
                          }
                          style={styles.rowMain}>
                          <PaletteTile
                            ramp={paletteFor(item.track.contentHash)}
                            label={item.track.title}
                            size={40}
                            radius={12}
                          />
                          <View style={styles.rowCopy}>
                            <ThemedText type="bodyStrong" numberOfLines={1}>
                              {item.track.title}
                            </ThemedText>
                            <ThemedText
                              type="caption"
                              style={{ color: stake ? theme.textSecondary : theme.textTertiary }}
                              numberOfLines={1}>
                              {stake ?? "Never played"}
                            </ThemedText>
                          </View>
                        </ElasticPressable>
                        <Icon name="chevronRight" size={16} color={theme.textTertiary} />
                      </GlassSurface>
                    </Reveal>
                  );
                })}
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
    paddingBottom: spacing.giant,
    gap: spacing.xl,
  },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 28,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 20,
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
    minWidth: 0,
  },
});
