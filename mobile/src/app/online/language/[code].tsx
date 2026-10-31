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
import { SourceRow } from "@/components/online/source-row";
import { ThemedText } from "@/components/themed-text";
import { EmptyState, ListGroup } from "@/components/ui/row";
import { findLanguage, sourcesForLanguage } from "@/lib/online";
import { paletteFor } from "@/lib/palette";
import { miniPlayerInset, spacing } from "@/theme/tokens";

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
    paddingBottom: spacing.giant + miniPlayerInset,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
});
