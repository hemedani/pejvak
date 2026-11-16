/**
 * One tool, before it exists.
 *
 * ## Why this is a screen and not a toast
 *
 * Four buttons on a page that all answer with the same apology could have been
 * four toasts. They are not, because the apology is the *content* here: the
 * reason these tools are off is a decision about money, and a listener who has
 * just tapped "Transcribe audio" deserves more than a line sliding past at the
 * bottom of the screen. The page states the message, then says what the tool
 * would have done, so the answer to "why can't I use this?" and the answer to
 * "what would it have given me?" sit in the same place.
 *
 * ## The message
 *
 * `AI_COMING_SOON_HEADLINE` and `AI_COMING_SOON_BODY` are the two halves of one
 * sentence pair, and they are rendered as a headline and a paragraph rather
 * than as one block of text. The words are the requested ones, unchanged and in
 * order — only the typesetting differs, because a single paragraph would have
 * buried "Coming soon." in the middle of its own explanation.
 *
 * ## The mark
 *
 * The tool's own glyph, at 104pt, inside two concentric rings. The rings are
 * the page's only ornament: they say "not yet switched on" without a lock icon
 * or a greyed-out card, both of which would read as a fault rather than as a
 * plan.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AiGlyph } from "@/components/ai/AiGlyph";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useScheme } from "@/hooks/use-theme";
import {
  AI_COMING_SOON_BODY,
  AI_COMING_SOON_HEADLINE,
  AI_FALLBACK_FEATURE,
  aiFeatureFor,
  aiFeatureTint,
} from "@/lib/aiFeatures";
import { withAlpha } from "@/lib/palette";
import { hairline, miniPlayerInset, spacing } from "@/theme/tokens";

export default function AiFeatureScreen() {
  const params = useLocalSearchParams<{ feature?: string }>();
  const router = useRouter();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();

  // A link can carry anything. An unknown id lands on a page that is still
  // true — "AI tools" — rather than on a redirect that flashes and leaves.
  const feature = aiFeatureFor(params.feature) ?? AI_FALLBACK_FEATURE;
  const tint = aiFeatureTint(feature, scheme);

  const leave = () => {
    // Reached from the grid this pops back to it; reached from a link there is
    // nothing behind it, so it replaces rather than emptying the stack.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/ai");
    }
  };

  return (
    <Screen wash={tint} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: miniPlayerInset + insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader
          overline="PEJVAK AI"
          title={feature.title}
          onBack={leave}
          index={0}
        />

        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${feature.title}. ${AI_COMING_SOON_HEADLINE} ${AI_COMING_SOON_BODY}`}
          style={styles.hero}>
          <View style={styles.rings}>
            <View
              style={[
                styles.ring,
                styles.ringOuter,
                { borderColor: withAlpha(tint, 0.1) },
              ]}
            />
            <View
              style={[
                styles.ring,
                styles.ringInner,
                { borderColor: withAlpha(tint, 0.2) },
              ]}
            />
            <AiGlyph feature={feature} size={104} tone="hero" />
          </View>

          <ThemedText type="display" style={styles.headline}>
            {AI_COMING_SOON_HEADLINE}
          </ThemedText>
          <ThemedText type="body" themeColor="textSecondary" style={styles.message}>
            {AI_COMING_SOON_BODY}
          </ThemedText>
        </View>

        <Card variant="inset" style={styles.card}>
          <ThemedText type="overline" themeColor="textTertiary">
            WHAT IT WILL DO
          </ThemedText>
          <ThemedText type="body" themeColor="textSecondary" style={styles.detail}>
            {feature.detail}
          </ThemedText>
        </Card>

        <PrimaryButton label="Back to the tools" variant="ghost" onPress={leave} />
      </ScrollView>
    </Screen>
  );
}

/** The two rings around the mark, and the mark's own box. */
const RING_OUTER = 232;
const RING_INNER = 168;

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xxl,
  },
  hero: {
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  rings: {
    width: RING_OUTER,
    height: RING_OUTER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  ring: {
    position: "absolute",
    borderWidth: hairline,
  },
  ringOuter: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
  },
  ringInner: {
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: RING_INNER / 2,
  },
  headline: {
    textAlign: "center",
  },
  message: {
    textAlign: "center",
    lineHeight: 24,
    // Centred text needs a shorter measure than ragged-right text before it
    // stops reading as a paragraph and starts reading as a block.
    maxWidth: 320,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  detail: {
    lineHeight: 24,
  },
});
