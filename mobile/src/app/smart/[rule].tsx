import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { AddToPlaylistButton, useAddToPlaylist } from "@/components/add-to-playlist";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { SegmentedControl } from "@/components/ui/card/segmented-control";
import { GlassChip } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import {
  addToPlaylistAction,
  EmptyState,
  ListGroup,
  ListRow,
  SkeletonRows,
} from "@/components/ui/row";
import { useSmartPlaylist } from "@/hooks/use-smart-playlist";
import { formatDuration } from "@/lib/history";
import { paletteFor } from "@/lib/palette";
import {
  COMMUTE_BUDGETS_SEC,
  DEFAULT_COMMUTE_BUDGET_SEC,
  isSmartRuleId,
  ruleFor,
  type SmartRuleId,
} from "@/lib/smartPlaylists";
import { formatClock } from "@/lib/time";
import { SmartPlaylistService } from "@/services/SmartPlaylistService";
import { control, iconSize, miniPlayerInset, spacing, tile, tileRadius } from "@/theme/tokens";

export default function SmartPlaylistScreen() {
  const params = useLocalSearchParams<{ rule?: string }>();
  const router = useRouter();

  const ruleId: SmartRuleId | null = isSmartRuleId(params.rule) ? params.rule : null;
  const [budgetSec, setBudgetSec] = useState<number>(DEFAULT_COMMUTE_BUDGET_SEC);
  const openPicker = useAddToPlaylist();

  const { data, loading, refresh } = useSmartPlaylist(ruleId, budgetSec);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Memoised so the callbacks below keep a stable dependency: `data?.picks ?? []`
  // would hand them a brand-new array on every render.
  const picks = useMemo(() => data?.picks ?? [], [data]);
  const rule = ruleId ? ruleFor(ruleId) : null;

  const onPlay = useCallback(async () => {
    const entryId = await SmartPlaylistService.play(picks);
    if (entryId) {
      router.push({ pathname: "/player", params: { trackId: entryId } });
    }
  }, [picks, router]);

  const onPlayFrom = useCallback(
    async (index: number) => {
      const entryId = await SmartPlaylistService.play(picks.slice(index));
      if (entryId) {
        router.push({ pathname: "/player", params: { trackId: entryId } });
      }
    },
    [picks, router],
  );

  const onSave = useCallback(async () => {
    if (!rule) {
      return;
    }
    const playlistId = await SmartPlaylistService.saveAsPlaylist(rule.title, picks);
    if (playlistId) {
      // Landing on the new playlist is the confirmation — no toast needed.
      router.push({ pathname: "/playlist/[id]", params: { id: playlistId } });
    }
  }, [picks, router, rule]);

  const budgetOptions = useMemo(
    () =>
      COMMUTE_BUDGETS_SEC.map((value) => ({
        value,
        label: formatDuration(value),
      })),
    [],
  );

  return (
    <Screen wash={paletteFor(ruleId ?? "")[1]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          onBack={() => router.back()}
          overline="SMART"
          title={rule?.title ?? "Smart playlist"}
          subtitle={
            data
              ? picks.length > 0
                ? `${formatDuration(data.totalDurationSec)} · ${data.summary}`
                : undefined
              : loading
                ? "Loading…"
                : undefined
          }
          action={
            picks.length > 0 ? (
              <AddToPlaylistButton
                trackIds={picks.map((pick) => pick.track.id)}
                title={rule?.title ?? "Smart playlist"}
                subtitle={`${picks.length} track${picks.length === 1 ? "" : "s"} from ${rule?.title ?? "this list"}`}
                ramp={paletteFor(ruleId ?? "")}
                artwork={picks[0]?.track.artworkUrl ?? null}
                isBatch
                size={control.lg}
                iconSize={iconSize.lg}
                tone="glass"
              />
            ) : null
          }
        />

        {!rule ? (
          <EmptyState
            icon="info"
            title="That smart playlist does not exist"
            message="Pick one from the library."
          />
        ) : picks.length === 0 ? (
          loading ? (
            <SkeletonRows count={3} />
          ) : (
            <EmptyState
              icon="info"
              title={rule.title}
              message={data?.emptyReason ?? rule.tagline}
            />
          )
        ) : (
          <>
            <Reveal index={1}>
              <PrimaryButton label={`Play ${picks.length} tracks`} onPress={() => void onPlay()} />
            </Reveal>

            {ruleId === "commute" ? (
              <Reveal index={2}>
                <SegmentedControl
                  options={budgetOptions}
                  value={budgetSec}
                  onChange={setBudgetSec}
                  accessibilityLabel="Commute length"
                />
              </Reveal>
            ) : null}

            <Reveal index={3}>
              <View style={styles.chipRow}>
                <GlassChip
                  label="Add to playlist"
                  icon="playlistAdd"
                  onPress={() =>
                    void openPicker({
                      trackIds: picks.map((pick) => pick.track.id),
                      title: rule?.title ?? "Smart playlist",
                      subtitle: `${picks.length} track${picks.length === 1 ? "" : "s"} from this list`,
                      ramp: paletteFor(ruleId ?? ""),
                      isBatch: true,
                    })
                  }
                />
                <GlassChip label="Save as playlist" onPress={() => void onSave()} />
              </View>
            </Reveal>

            <View style={styles.section}>
              <Reveal index={4}>
                <ThemedText type="overline" themeColor="textTertiary">
                  WHY THESE
                </ThemedText>
              </Reveal>

              <ListGroup>
                {picks.map((pick, index) => (
                  <ListRow
                    key={pick.track.id}
                    title={pick.track.title}
                    titleLines={1}
                    detail={pick.reason}
                    leading={
                      <PaletteTile
                        ramp={paletteFor(pick.track.contentHash)}
                        label={pick.track.title}
                        source={pick.track.artworkUrl}
                        size={tile.md}
                        radius={tileRadius(tile.md)}
                        recyclingKey={pick.track.contentHash}
                        dense
                      />
                    }
                    leadingWidth={tile.md}
                    onPress={() => void onPlayFrom(index)}
                    accessibilityLabel={`Play ${pick.track.title}, ${pick.reason}`}
                    trailing={
                      <ThemedText type="numeric" themeColor="textTertiary">
                        {pick.track.durationSec > 0 ? formatClock(pick.track.durationSec) : "—"}
                      </ThemedText>
                    }
                    actions={[
                      addToPlaylistAction({
                        title: pick.track.title,
                        ramp: paletteFor(pick.track.contentHash),
                        artwork: pick.track.artworkUrl,
                        trackIds: [pick.track.id],
                      }),
                    ]}
                  />
                ))}
              </ListGroup>
            </View>
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
});
