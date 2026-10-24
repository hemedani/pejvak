/**
 * The card every library row is built from.
 *
 * One component rather than a row per screen. A track, a folder, a playlist and
 * an online course all answer the same question — "what is this, and what can I
 * do with it?" — and four hand-rolled rows eventually disagree about the tile
 * size, the corner radius, or where the progress bar sits. Here those are props,
 * and the *layout* comes from the one shared `RowShell`.
 *
 * ## What makes it read as a card
 *
 * Three things beyond the panel itself:
 *
 *   1. **The item's own colour, bleeding into the card.** Every row resolves to
 *      an aurora ramp (`paletteFor`), and that colour is laid over the card as a
 *      soft diagonal wash and behind the artwork as a halo. A library of three
 *      thousand files then reads as a wall of colour rather than a wall of white,
 *      and each card carries the identity of what is on it. The wash is `Card`'s
 *      job and its alpha is deliberately low — on an opaque fill it sits *behind*
 *      text rather than tinting a blur beneath it, so it can afford to be
 *      quieter than the version that used to sit on glass.
 *   2. **A lit tile.** The artwork sits on a coloured glow rather than a flat drop
 *      shadow — the same move the play button makes — so the picture looks lit
 *      rather than pasted on.
 *   3. **A full-bleed progress bar.** It reaches both edges of the card, which is
 *      what makes it read as part of the card rather than as a widget on it.
 *
 * ## No shadow
 *
 * `elevated={false}`, deliberately. This card is one of possibly three thousand
 * on a screen, and fifty elevated cards stop reading as cards and start reading
 * as noise — the `surface` fill and the `outline` hairline already draw the
 * edge on their own.
 *
 * ## Responsiveness
 *
 * `RowShell` plans the action cluster from the card's width: beside the copy,
 * on its own line, or in the overflow menu. **Nothing is ever silently
 * dropped.** The width is never measured — it comes from `cardWidthFor`, so the
 * right layout is available on the first frame.
 *
 * ## Why the actions are siblings of the pressable
 *
 * The whole card plays on tap, so the body is one `ElasticPressable`. Every
 * action sits *beside* it rather than inside it: nested, the card would run its
 * press animation and fire its own `onPress` while the finger is on a control.
 */

import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { Dimensions, StyleSheet, View } from "react-native";

import { PaletteTile } from "@/components/motion/PaletteTile";
import { Card } from "@/components/ui/card";
import { GlassProgress } from "@/components/ui/glass";
import { RowShell } from "@/components/ui/row/row-shell";
import type { RowAction } from "@/components/ui/row/row-actions";
import { useScheme, useTheme } from "@/hooks/use-theme";
import { cardWidthFor } from "@/lib/cardLayout";
import { paletteFor, withAlpha } from "@/lib/palette";
import type { StatusSpec } from "@/lib/rowStatus";
import type { Range } from "@/lib/search";
import {
  bar,
  layout,
  spacing,
  tile,
  tileRadius as radiusForTile,
} from "@/theme/tokens";

/** How far the tile's halo reaches past the tile itself, per side. */
const HALO_BLEED = 7;

/** The action type keeps its old name for the screens that already use it. */
export type MediaCardAction = RowAction;

export type MediaCardProps = {
  title: string;
  /** Ranges into `title` to tint — the search highlight. */
  titleRanges?: readonly Range[];
  /** Second line: counts, progress, the reason a search matched. */
  meta?: string | null;
  /** Third line, quieter than the second. */
  detail?: string | null;
  /** At most one state, e.g. "File missing" or "Streams". */
  status?: StatusSpec | null;
  artworkUrl?: string | null;
  /** Seeds the aurora ramp, and is the fallback tile's letter. */
  paletteKey: string;
  /** Diameter of the leading artwork tile. */
  tileSize?: number;
  /** 0–1. Draws the full-bleed bar along the card's bottom edge. */
  progressRatio?: number | null;
  /**
   * Overrides the ramp's own accent for the halo, the wash and the bar. Used by
   * states that are not about identity — a finished collection is the app's
   * accent, not the course's colour.
   */
  accent?: string;
  /** The "you got through this" state: an accent border and a soft wash. */
  marked?: boolean;
  actions?: readonly MediaCardAction[];
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** The column's width. Pass it from a list so it is measured once. */
  cardWidth?: number;
};

export const MediaCard = memo(function MediaCard({
  title,
  titleRanges,
  meta,
  detail,
  status,
  artworkUrl,
  paletteKey,
  tileSize = tile.lg,
  progressRatio,
  accent,
  marked = false,
  actions,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  cardWidth,
}: MediaCardProps) {
  const theme = useTheme();
  const scheme = useScheme();

  const ramp = paletteFor(paletteKey);
  const tint = accent ?? ramp[1];
  const tileRadius = radiusForTile(tileSize);

  /**
   * The card's own width, and the layout that fits in it.
   *
   * `layout` here is the screen's max content width, and `spacing.xl` the list's
   * own horizontal padding — the two numbers `cardWidthFor` needs. A screen that
   * already knows the width passes it, so this is only the standalone fallback.
   */
  const width =
    cardWidth ??
    cardWidthFor({
      // `Dimensions.get` rather than the hook: a card is usually given a width
      // by its screen, and a fallback must not subscribe every row to rotation.
      windowWidth: Dimensions.get("window").width,
      inset: spacing.xl,
      maxContentWidth: layout.maxContentWidth,
    });

  // The card's own wash is Card's job now. The halo behind the artwork is
  // still local, and it needs a scheme-dependent alpha: the same tint reads
  // heavier on a dark canvas, and a halo tuned in one theme blooms in the other.
  const haloAlpha = scheme === "dark" ? 0.4 : 0.3;

  const leading = (
    <View style={styles.tileWrap}>
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(tint, haloAlpha), withAlpha(tint, 0)]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[
          styles.halo,
          {
            left: -HALO_BLEED,
            right: -HALO_BLEED,
            top: -HALO_BLEED,
            bottom: -HALO_BLEED,
            borderRadius: tileRadius + HALO_BLEED,
          },
        ]}
      />
      <PaletteTile
        ramp={ramp}
        label={title}
        source={artworkUrl}
        size={tileSize}
        radius={tileRadius}
        recyclingKey={paletteKey}
        dense
      />
    </View>
  );

  return (
    <Card
      wash={tint}
      elevated={false}
      style={[styles.card, marked ? { borderWidth: 1.5, borderColor: tint } : null]}>
      {marked ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.accentSoft }]}
        />
      ) : null}

      <RowShell
        density="shelf"
        leading={leading}
        leadingWidth={tileSize}
        title={title}
        titleRanges={titleRanges}
        meta={meta}
        detail={detail}
        status={status}
        actions={actions}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        cardWidth={width}
      />

      {progressRatio !== undefined && progressRatio !== null ? (
        <GlassProgress
          progress={progressRatio}
          tint={tint}
          thickness={bar.thin}
          style={styles.progress}
        />
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    // No padding of its own: the content owns it, so the progress bar can run
    // the full width of the panel without fighting a parent inset.
  },
  tileWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
  },
  progress: {
    marginTop: spacing.xs,
  },
});
