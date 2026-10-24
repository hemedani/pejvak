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

import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { EmptyState, ListGroup, ListRow, type ListRowPosition } from "@/components/ui/row";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { findLanguage, sourcesForLanguage, type OnlineSource } from "@/lib/online";
import { paletteFor } from "@/lib/palette";
import { spacing, tile, tileRadius } from "@/theme/tokens";

/** One provider, as a dense row. */
function SourceRow({
  source,
  onPress,
  position,
}: {
  source: OnlineSource;
  onPress: () => void;
  position?: ListRowPosition;
}) {
  const theme = useTheme();
  const ramp = paletteFor(source.id);

  return (
    <ListRow
      position={position}
      leading={
        /* The mark is a gradient square rather than the provider's logo: we
           do not hotlink their assets, and a deterministic tile keeps the row
           recognisable without borrowing someone else's brand. */
        <View style={[styles.mark, { backgroundColor: ramp[1] }]}>
          <Icon name="radio" size={20} color={theme.onAccent} />
        </View>
      }
      leadingWidth={tile.md}
      title={source.name}
      titleLines={1}
      meta={source.nativeName}
      detail={source.description}
      trailing={<Icon name="chevronRight" size={16} color={theme.textTertiary} />}
      onPress={onPress}
      accessibilityLabel={`${source.name}, ${source.nativeName}`}
      accessibilityHint="Opens this source's collections"
    />
  );
}

export default function LanguageSourcesScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
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
            <Reveal index={1} limit={8}>
              <ListGroup>
                {sources.map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    onPress={() =>
                      router.push({
                        pathname: "/online/source/[id]",
                        params: { id: source.id, language: code },
                      })
                    }
                  />
                ))}
              </ListGroup>
            </Reveal>
          </View>
        ) : (
          <EmptyState
            icon="globe"
            title={`No sources for ${language?.name ?? "this language"} yet`}
            message="We add them as we find them, and the rest of the app is unaffected."
          />
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
  mark: {
    width: tile.md,
    height: tile.md,
    borderRadius: tileRadius(tile.md),
    alignItems: "center",
    justifyContent: "center",
  },
});
