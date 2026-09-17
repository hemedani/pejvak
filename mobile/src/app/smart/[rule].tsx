import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassChip, GlassSurface } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useSmartPlaylist } from "@/hooks/use-smart-playlist";
import { useTheme } from "@/hooks/use-theme";
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
import { spacing } from "@/theme/tokens";

/** Reveal indices for the header block; list rows start after it. */
const FIRST_ROW_REVEAL_INDEX = 5;

export default function SmartPlaylistScreen() {
  const params = useLocalSearchParams<{ rule?: string }>();
  const router = useRouter();
  const theme = useTheme();

  const ruleId: SmartRuleId | null = isSmartRuleId(params.rule) ? params.rule : null;
  const [budgetSec, setBudgetSec] = useState<number>(DEFAULT_COMMUTE_BUDGET_SEC);

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

  const budgetChips = useMemo(
    () =>
      COMMUTE_BUDGETS_SEC.map((value) => ({
        value,
        label: formatDuration(value),
        selected: value === budgetSec,
      })),
    [budgetSec],
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
        />

        {!rule ? (
          <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
            That smart playlist does not exist.
          </ThemedText>
        ) : picks.length === 0 ? (
          <Reveal index={0}>
            <GlassSurface tone="surfaceStrong" style={styles.emptyCard}>
              <ThemedText type="bodyStrong">{rule.title}</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {data?.emptyReason ?? rule.tagline}
              </ThemedText>
            </GlassSurface>
          </Reveal>
        ) : (
          <>
            <Reveal index={1}>
              <PrimaryButton label={`Play ${picks.length} tracks`} onPress={() => void onPlay()} />
            </Reveal>

            {ruleId === "commute" ? (
              <Reveal index={2}>
                <View style={styles.chipRow}>
                  {budgetChips.map((chip) => (
                    <GlassChip
                      key={chip.value}
                      label={chip.label}
                      selected={chip.selected}
                      onPress={() => setBudgetSec(chip.value)}
                    />
                  ))}
                </View>
              </Reveal>
            ) : null}

            <Reveal index={3}>
              <View style={styles.chipRow}>
                <GlassChip label="Save as playlist" onPress={() => void onSave()} />
              </View>
            </Reveal>

            <View style={styles.section}>
              <Reveal index={4}>
                <ThemedText type="overline" themeColor="textTertiary">
                  WHY THESE
                </ThemedText>
              </Reveal>

              {picks.map((pick, index) => (
                <Reveal key={pick.track.id} index={FIRST_ROW_REVEAL_INDEX + index}>
                  <GlassSurface flat style={styles.row}>
                    <ElasticPressable
                      accessibilityRole="button"
                      accessibilityLabel={`Play ${pick.track.title}, ${pick.reason}`}
                      onPress={() => void onPlayFrom(index)}
                      style={styles.rowMain}>
                      <PaletteTile
                        ramp={paletteFor(pick.track.contentHash)}
                        label={pick.track.title}
                        size={40}
                        radius={12}
                      />
                      <View style={styles.rowCopy}>
                        <ThemedText type="bodyStrong" numberOfLines={1}>
                          {pick.track.title}
                        </ThemedText>
                        {/* The reason is the point of the list, so it is stated
                            rather than hidden behind a tap. */}
                        <ThemedText type="caption" style={{ color: theme.textSecondary }} numberOfLines={2}>
                          {pick.reason}
                        </ThemedText>
                      </View>
                    </ElasticPressable>

                    <ThemedText type="caption" themeColor="textTertiary">
                      {pick.track.durationSec > 0 ? formatClock(pick.track.durationSec) : "—"}
                    </ThemedText>
                  </GlassSurface>
                </Reveal>
              ))}
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
    paddingBottom: spacing.giant,
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
  emptyCard: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: 24,
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
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
