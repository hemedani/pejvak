/**
 * The AI page: a promise, behind glass.
 *
 * There is nothing to do here yet, so the screen is deliberately *about* that.
 * The shape it takes is the shape the feature will have: a library of audio
 * underneath, and a panel over it that tells you what is coming. The list is
 * the point — the panel is glass over real content, not a card floating on an
 * empty canvas, and that is what makes the announcement read as "this will sit
 * on top of your library" rather than as a placeholder.
 *
 * ## Why the backdrop is blurred but visible
 *
 * The panel has to be the thing you read, so the list behind it is out of focus
 * and dimmed. It must not be *erased*, though: the backdrop is the whole reason
 * the panel reads as glass rather than as a card on a flat screen, and a blur
 * strong enough to remove it leaves a wash with no depth in it. So the frost is
 * gentle, the dim is light, and the panel's own fill is translucent enough to
 * carry the list's colour through. The backdrop is still sample content rather
 * than the listener's library — a half-visible real title would be a puzzle, and
 * the panel is the only thing that should be read.
 *
 * ## The glass is the app's own
 *
 * `GlassSurface` is the same material as the dock and the sheets: a native blur
 * of what is behind it, a translucent fill, and a specular top edge. On Android
 * that blur needs a target — `GlassBlurTarget` renders the backdrop inside a
 * view the panel can blur, and the panel as its sibling.
 */

import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AmbientWash } from "@/components/motion/AmbientWash";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { Screen } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import {
  GlassBlurTarget,
  GlassSurface,
  useBlurTarget,
} from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { useScheme, useTheme } from "@/hooks/use-theme";
import { paletteFor } from "@/lib/palette";
import { dockInset, radius as radii, spacing, tile } from "@/theme/tokens";

/**
 * What is behind the glass.
 *
 * Invented rather than read from the library. The screen has no data of its
 * own, and pulling the listener's real titles in would mean a database read on
 * a screen that cannot act on the answer — for a list nobody is meant to read.
 */
const BACKDROP: readonly { title: string; meta: string; length: string }[] = [
  { title: "The Art of Noticing", meta: "Audiobook · Rob Walker", length: "6h 12m" },
  { title: "Night Train to Shiraz", meta: "Audiobook · Parisa Ahmadi", length: "9h 41m" },
  { title: "Deep Work, Deep Rest", meta: "Podcast · 42 min", length: "42m" },
  { title: "A History of Silence", meta: "Documentary series", length: "1h 08m" },
  { title: "Letters from the North", meta: "Audiobook · Fiction", length: "11h 03m" },
  { title: "The Long Listen", meta: "Podcast · Episode 14", length: "58m" },
  { title: "How We Remember", meta: "Lecture series", length: "2h 20m" },
  { title: "Seasons of a Small Town", meta: "Audiobook · Memoir", length: "7h 55m" },
  { title: "Notes on Attention", meta: "Podcast · 31 min", length: "31m" },
  { title: "The Quiet Hours", meta: "Audiobook · Essays", length: "5h 34m" },
  { title: "Wandering the Silk Road", meta: "Documentary series", length: "3h 12m" },
  { title: "On Keeping a Notebook", meta: "Essay · 24 min", length: "24m" },
];

/**
 * How hard the screen blurs the list behind the panel.
 *
 * Low on purpose. `GlassSurface` blurs again inside the card, so the list is
 * softened twice over by the time it is seen through the panel; a heavy frost
 * here would only flatten the parts of the screen the panel does not cover.
 */
const FROST = 28;

/**
 * The dim between the frost and the panel, as a fraction of the theme's scrim.
 *
 * The scrim exists so a modal can hide the screen behind it. This panel is not
 * hiding anything — it is sitting on the list — so it takes a fraction of it.
 */
const DIM = 0.45;

/** One row of the backdrop. Nothing here is interactive. */
function BackdropRow({ item }: { item: (typeof BACKDROP)[number] }) {
  return (
    <View style={styles.row}>
      <PaletteTile
        ramp={paletteFor(item.title)}
        label={item.title}
        size={tile.lg}
        radius={radii.tile}
        dense
      />
      <View style={styles.rowCopy}>
        <ThemedText type="bodyStrong" numberOfLines={1}>
          {item.title}
        </ThemedText>
        <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
          {item.meta}
        </ThemedText>
      </View>
      <ThemedText type="numeric" themeColor="textTertiary">
        {item.length}
      </ThemedText>
    </View>
  );
}

/**
 * The frost over the whole backdrop.
 *
 * A panel only blurs what is behind *it*, so the card alone would leave the
 * strip of list around its edges sharp — which is why the frost is full-bleed.
 * But it is a *light* frost: enough to put the list out of focus and behind
 * glass, not enough to erase it. The list is the reason this screen is not an
 * empty canvas with a card on it, and a blur heavy enough to hide it turns the
 * backdrop into a flat wash — which is what this used to be, and what it looked
 * like.
 *
 * On Android the blur needs the target view the backdrop was rendered into; on
 * iOS a `BlurView` blurs whatever is behind it and ignores the ref. Same rule as
 * `GlassSurface`, spelled out here because this is a bare `BlurView`.
 */
function ScreenFrost() {
  const scheme = useScheme();
  const target = useBlurTarget();

  if (Platform.OS === "android" && target === null) {
    return null;
  }

  return (
    <BlurView
      intensity={FROST}
      tint={scheme === "dark" ? "dark" : "light"}
      blurMethod="dimezisBlurViewSdk31Plus"
      blurTarget={target ?? undefined}
      style={StyleSheet.absoluteFill}
    />
  );
}

export default function AiScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Screen wash={theme.accent} edges={[]} constrain={false}>
      {/* The backdrop is the layer the panel blurs. It carries its own canvas
          colour so the blur has something solid to work with on Android: a
          transparent target blurs to nothing, and the list would then sit on
          whatever the screen wash happened to be rather than on a page. */}
      <GlassBlurTarget
        style={StyleSheet.absoluteFill}
        background={
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.canvas }]}>
            <AmbientWash color={theme.accent} intensity={0.55} />
            <View style={styles.backdrop} pointerEvents="none">
              {BACKDROP.map((item) => (
                <BackdropRow key={item.title} item={item} />
              ))}
            </View>
          </View>
        }>
        <ScreenFrost />

        {/* The dim sits between the frost and the panel: it settles the list
            back a step so the panel has something to sit in front of, without
            taking the colour out of it. */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim, opacity: DIM }]}
        />

        <View
          style={[
            styles.host,
            {
              paddingTop: insets.top + spacing.xxxl,
              paddingBottom: dockInset + insets.bottom,
            },
          ]}>
          <GlassSurface
            tone="surfaceStrong"
            radius={radii.xxl}
            intensity={46}
            fillOpacity={0.5}
            elevated
            clip
            style={styles.card}>
            <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
              <Icon name="ai" size={26} color={theme.accent} />
            </View>

            <ThemedText type="overline" themeColor="textTertiary" style={styles.overline}>
              AI
            </ThemedText>
            <ThemedText type="display" style={styles.title}>
              Coming Soon
            </ThemedText>

            <ThemedText type="body" themeColor="textSecondary" style={styles.body}>
              We’re planning to add a range of AI-powered features—for instance,
              you’ll be able to input an audiobook or a podcast and get a summary,
              helping you decide whether it’s worth a listen!
            </ThemedText>

            <View style={[styles.rule, { backgroundColor: theme.outlineVariant }]} />

            <ThemedText type="body" themeColor="textSecondary" style={styles.body}>
              But we need your help! Please support us—consider making a donation
              or joining our Patreon.
            </ThemedText>
          </GlassSurface>
        </View>
      </GlassBlurTarget>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingTop: spacing.giant,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
    // Clipped rather than scrolled: this is scenery, and a scrollable layer
    // under a panel is a gesture nobody can reach.
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  host: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  card: {
    gap: spacing.md,
    padding: spacing.xxl,
    paddingVertical: spacing.xxxl,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  overline: {
    letterSpacing: 2,
  },
  title: {
    marginTop: -spacing.sm,
  },
  body: {
    // A reading measure, not the panel's full width: 46 characters a line is
    // where a paragraph stops being a wall.
    lineHeight: 24,
  },
  rule: {
    height: 1,
    marginVertical: spacing.xs,
  },
});
