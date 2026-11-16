/**
 * The AI page: four tools, one of them not yet possible.
 *
 * ## What this screen has to do
 *
 * It is a catalogue of things that do not work, which is the hardest kind of
 * page to make honest without making it sad. Three decisions carry it:
 *
 *   1. **Each tool is a card with a mark, not a line of text.** Four rows would
 *      read as a settings list — a list of features is a list of *switches*, and
 *      switches imply they can be turned on. Four cards with their own colour
 *      and glyph read as a product, which is what they are.
 *   2. **The grid says "soon" before you tap.** A card that looks available and
 *      then apologises is a broken promise; a card that is visibly pending is a
 *      roadmap. The pill is small and quiet, but it is on every one of them.
 *   3. **The page explains the reason once, at the bottom.** Repeating "we need
 *      a server" on four cards would be nagging. Saying it once, in a panel
 *      that is about the *cost* rather than the excuse, is the honest version.
 *
 * ## The layout
 *
 * A hero, then a 2×2 grid, then the explanation. The grid is two explicit rows
 * of two rather than a wrapping flex container: percentage widths inside a
 * `flexWrap` row measure differently on every platform once a gap is involved,
 * and two cards that are 3px different in width is the thing that makes a grid
 * look assembled instead of designed. Two rows of `flex: 1` cannot disagree.
 *
 * ## Colour
 *
 * Every tool paints with one of the app's aurora ramps, which is the same
 * vocabulary the library uses to tell tracks apart — so the page belongs to the
 * app rather than sitting beside it. The ramps appear at low alpha, as a wash
 * and a glyph tint, never as a saturated fill; see `AiGlyph` for why.
 */

import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AiGlyph } from "@/components/ai/AiGlyph";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { Screen } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { useScheme, useTheme } from "@/hooks/use-theme";
import {
  AI_FALLBACK_FEATURE,
  AI_FEATURES,
  aiFeatureTint,
  type AiFeature,
} from "@/lib/aiFeatures";
import { withAlpha } from "@/lib/palette";
import { dockInset, hairline, radius as radii, spacing } from "@/theme/tokens";

/**
 * One tool in the grid.
 *
 * The whole card is the target, not the glyph: the glyph is the thing the eye
 * lands on, and a listener who has decided to press it should not have to hit a
 * 44pt circle to do so.
 */
function FeatureCard({ feature, index }: { feature: AiFeature; index: number }) {
  const router = useRouter();
  const theme = useTheme();
  const scheme = useScheme();
  const tint = aiFeatureTint(feature, scheme);

  return (
    <Reveal index={index} style={styles.cell}>
      <Card wash={feature.ramp[0]} clip padded={false} style={styles.card}>
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel={`${feature.title}. ${feature.blurb}. Coming soon.`}
          accessibilityHint="Opens this tool's page"
          haptic="tap"
          onPress={() => router.navigate(`/ai/${feature.id}`)}
          style={styles.cardBody}>
          <View style={styles.cardTop}>
            <AiGlyph feature={feature} size={44} />
            {/* The pill sits opposite the mark so the two occupy one line and
                the title below starts at the card's own edge. */}
            <View style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
              <ThemedText type="overline" style={{ color: theme.accent }}>
                SOON
              </ThemedText>
            </View>
          </View>
          <View style={styles.cardCopy}>
            <ThemedText type="bodyStrong" numberOfLines={2}>
              {feature.title}
            </ThemedText>
            <ThemedText type="caption" themeColor="textTertiary" numberOfLines={2}>
              {feature.blurb}
            </ThemedText>
          </View>
        </ElasticPressable>
        {/* A hairline in the tool's own colour, laid over the card's own border.
            It is what stops four white cards in a grid reading as four tiles of
            the same thing. */}
        <View
          pointerEvents="none"
          style={[styles.cardEdge, { borderColor: withAlpha(tint, 0.34) }]}
        />
      </Card>
    </Reveal>
  );
}

/**
 * The soft bloom behind the page's mark.
 *
 * A radial-ish gradient rather than a `shadow`: a shadow has a hard-ish falloff
 * and a fixed offset, and this needs to be a wide, centred halo that fades to
 * nothing well before its own bounds. It is the one place on the page where
 * colour is allowed to be this loud, because nothing is written on it.
 */
function Bloom({ tint }: { tint: string }) {
  return (
    <View pointerEvents="none" style={styles.bloom}>
      <LinearGradient
        colors={[withAlpha(tint, 0.24), withAlpha(tint, 0)]}
        start={{ x: 0.5, y: 0.35 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bloomFill}
      />
    </View>
  );
}

export default function AiScreen() {
  const theme = useTheme();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const tint = aiFeatureTint(AI_FALLBACK_FEATURE, scheme);

  // Two explicit rows of two. See the file header for why this is not a wrap.
  const rows = [AI_FEATURES.slice(0, 2), AI_FEATURES.slice(2, 4)];

  return (
    <Screen wash={theme.accent} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: dockInset + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}>
        <Reveal index={0} style={styles.hero}>
          <View style={styles.mark}>
            <Bloom tint={tint} />
            <AiGlyph feature={AI_FALLBACK_FEATURE} size={72} tone="hero" />
          </View>
          <ThemedText type="overline" themeColor="textTertiary" style={styles.overline}>
            PEJVAK AI
          </ThemedText>
          <ThemedText type="display" style={styles.title}>
            Your library, understood.
          </ThemedText>
          <ThemedText type="body" themeColor="textSecondary" style={styles.lede}>
            Four tools that read, clean and speak for your recordings. None of them are
            live yet — they need a server, and that is the one thing we do not have.
          </ThemedText>
        </Reveal>

        <View style={styles.grid}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.gridRow}>
              {row.map((feature, columnIndex) => (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  index={1 + rowIndex * 2 + columnIndex}
                />
              ))}
            </View>
          ))}
        </View>

        <Reveal index={5}>
          <Card variant="inset" style={styles.why}>
            <ThemedText type="overline" themeColor="textTertiary">
              WHY NONE OF THIS IS ON
            </ThemedText>
            <ThemedText type="heading" style={styles.whyTitle}>
              A machine, and the bill for it
            </ThemedText>
            <ThemedText type="body" themeColor="textSecondary" style={styles.whyBody}>
              Transcribing an hour of audio, or lifting a voice back out of hiss, is not
              something a phone can do well. It takes a machine built for it, and that
              machine is a monthly bill rather than a one-off purchase. That bill is the
              whole reason these four are still switched off.
            </ThemedText>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: theme.textTertiary }]} />
              <ThemedText type="caption" themeColor="textTertiary">
                Server · not provisioned
              </ThemedText>
            </View>
          </Card>
        </Reveal>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xxxl,
  },
  hero: {
    gap: spacing.sm,
  },
  mark: {
    width: 72,
    height: 72,
    marginBottom: spacing.md,
  },
  bloom: {
    position: "absolute",
    // Deliberately much larger than the mark and offset up and to the left, so
    // the halo reads as light falling on the page rather than as a halo drawn
    // around a circle.
    left: -84,
    top: -84,
    width: 240,
    height: 240,
  },
  bloomFill: {
    flex: 1,
    borderRadius: 120,
  },
  overline: {
    letterSpacing: 2,
  },
  title: {
    marginTop: -spacing.xs,
  },
  lede: {
    marginTop: spacing.xs,
    // A reading measure rather than the full column: at 380pt the paragraph ran
    // to 68 characters a line, which is where prose stops being scanned and
    // starts being worked through.
    maxWidth: 340,
  },
  grid: {
    gap: spacing.md,
  },
  gridRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  cell: {
    flex: 1,
  },
  card: {
    borderRadius: radii.card,
  },
  cardBody: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
    // A floor, not a fixed height: the two cards in a row must agree, and a
    // long Persian title is allowed to grow the pair rather than be clipped.
    minHeight: 156,
    justifyContent: "space-between",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardCopy: {
    gap: spacing.xxs,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
  },
  cardEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.card,
    borderWidth: hairline,
  },
  why: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  whyTitle: {
    marginTop: -spacing.xxs,
  },
  whyBody: {
    lineHeight: 24,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
