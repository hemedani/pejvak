/**
 * The sources that serve one language.
 *
 * A deliberately thin screen: its whole job is to answer "who has audio in this
 * language?", and the answer is usually one row. It exists as a screen rather
 * than as a filter on the previous list because the language is the thing the
 * listener chose, and a screen is what makes that choice feel like progress.
 *
 * A language with no source is a real state, not an error: the catalogue is the
 * whole world's languages, so the empty case has to read as "not yet" rather
 * than as a failure.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";

import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { findLanguage, sourcesForLanguage, type OnlineSource } from "@/lib/online";
import { paletteFor } from "@/lib/palette";
import { radius as radii, spacing } from "@/theme/tokens";

/** One provider, as a card. */
function SourceCard({ source, onPress }: { source: OnlineSource; onPress: () => void }) {
  const theme = useTheme();
  const ramp = paletteFor(source.id);

  return (
    <Card style={styles.card}>
      <ElasticPressable
        accessibilityRole="button"
        accessibilityLabel={`${source.name}, ${source.nativeName}`}
        accessibilityHint="Opens this source's collections"
        scaleTo={0.985}
        overshootTo={1.004}
        haptic="light"
        onPress={onPress}
        style={styles.cardPressable}>
        {/* The mark is a gradient square rather than the provider's logo: we do
            not hotlink their assets, and a deterministic tile keeps the row
            recognisable without borrowing someone else's brand. */}
        <View style={[styles.mark, { backgroundColor: ramp[1] }]}>
          <Icon name="radio" size={24} color={theme.onAccent} />
        </View>
        <View style={styles.cardCopy}>
          <ThemedText type="bodyStrong" numberOfLines={1}>
            {source.name}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {source.nativeName}
          </ThemedText>
          <ThemedText type="caption" themeColor="textTertiary" numberOfLines={2}>
            {source.description}
          </ThemedText>
        </View>
        <Icon name="chevronRight" size={18} color={theme.textTertiary} />
      </ElasticPressable>
    </Card>
  );
}

export default function LanguageSourcesScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const code = params.code ?? "";
  const language = useMemo(() => findLanguage(code), [code]);
  const sources = useMemo(() => sourcesForLanguage(code), [code]);

  return (
    <Screen wash={paletteFor(code)[1]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          onBack={() => router.back()}
          overline="LANGUAGE"
          title={language?.nativeName ?? code}
          subtitle={language ? language.name : undefined}
        />

        {sources.length > 0 ? (
          <View style={styles.section}>
            <Reveal index={0}>
              <ThemedText type="overline" themeColor="textTertiary">
                SOURCES
              </ThemedText>
            </Reveal>
            {sources.map((source, index) => (
              <Reveal key={source.id} index={index + 1}>
                <SourceCard
                  source={source}
                  onPress={() =>
                    router.push({ pathname: "/online/source/[id]", params: { id: source.id } })
                  }
                />
              </Reveal>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Icon name="globe" size={28} color={theme.textTertiary} />
            <ThemedText type="caption" themeColor="textTertiary" style={styles.emptyText}>
              No free sources for {language?.name ?? "this language"} yet. We add them as we find
              them, and the rest of the app is unaffected.
            </ThemedText>
          </View>
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
  section: {
    gap: spacing.sm,
  },
  card: {
    padding: spacing.md,
  },
  cardPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  mark: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  empty: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.huge,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    textAlign: "center",
  },
});
