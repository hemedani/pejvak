/**
 * The card every library row is built from.
 *
 * One component rather than a row per screen. A track, a folder, a playlist and
 * an online course all answer the same question — "what is this, and what can I
 * do with it?" — and four hand-rolled rows eventually disagree about the tile
 * size, the corner radius, or where the progress bar sits. Here those are props.
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
 * The action cluster is planned by `planRowLayout`, which decides from the card's
 * width whether the controls sit beside the copy, move to their own line, or
 * collapse. **Nothing is ever silently dropped**: a control that does not fit is
 * offered in the overflow menu instead. The width is never measured — it comes
 * from `cardWidthFor`, so the right layout is available on the first frame.
 *
 * ## Why the actions are siblings of the pressable
 *
 * The whole card plays on tap, so the body is one `ElasticPressable`. Every
 * action sits *beside* it rather than inside it: nested, the card would run its
 * press animation and fire its own `onPress` while the finger is on a control.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { PaletteTile } from "@/components/motion/PaletteTile";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { GlassProgress, GlassSurface } from "@/components/ui/glass";
import { HighlightedText } from "@/components/ui/highlighted-text";
import { Icon, type IconName } from "@/components/ui/icon";
import { useScheme, useTheme } from "@/hooks/use-theme";
import { cardWidthFor, planRowLayout, type RowActionSlot } from "@/lib/cardLayout";
import { paletteFor, withAlpha } from "@/lib/palette";
import type { Range } from "@/lib/search";
import { layout, radius as radii, spacing } from "@/theme/tokens";

/** How far the tile's halo reaches past the tile itself, per side. */
const HALO_BLEED = 7;
/** Touch target every action in the cluster is sized to. */
const ACTION_SIZE = 40;

export type MediaCardAction = {
  key: string;
  /** Rendered width in px — what `planRowLayout` budgets with. */
  width: number;
  /** Higher survives longer when the card runs out of room. */
  priority: number;
  /** The inline control. */
  node: ReactNode;
  /**
   * The overflow-menu row. An action needs words as well as a glyph because the
   * menu is a list of names, not a toolbar of icons — a bare `play` glyph in a
   * vertical menu says nothing about *what* it would play.
   */
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Draws the menu row in the danger colour. */
  danger?: boolean;
};

export type MediaCardProps = {
  title: string;
  /** Ranges into `title` to tint — the search highlight. */
  titleRanges?: readonly Range[];
  /** Second line: counts, progress, the reason a search matched. */
  meta?: string | null;
  /** Third line, quieter than the second. */
  detail?: string | null;
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
};

export function MediaCard({
  title,
  titleRanges,
  meta,
  detail,
  artworkUrl,
  paletteKey,
  tileSize = 46,
  progressRatio,
  accent,
  marked = false,
  actions,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: MediaCardProps) {
  const theme = useTheme();
  const scheme = useScheme();
  const { width: windowWidth } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);

  const ramp = paletteFor(paletteKey);
  const tint = accent ?? ramp[1];
  const tileRadius = Math.round(tileSize * 0.3);

  /**
   * The card's own width, and the layout that fits in it.
   *
   * `layout` here is the screen's max content width, and `spacing.xl` the list's
   * own horizontal padding — the two numbers `cardWidthFor` needs. Memoised on
   * the width so the plan is not rebuilt for every row on every render.
   */
  const cardWidth = cardWidthFor({
    windowWidth,
    inset: spacing.xl,
    maxContentWidth: layout.maxContentWidth,
  });

  const slots: RowActionSlot[] = (actions ?? []).map((action) => ({
    key: action.key,
    width: action.width,
    priority: action.priority,
  }));

  const plan = planRowLayout({
    width: cardWidth,
    padding: spacing.md * 2,
    tile: tileSize,
    gap: spacing.md,
    actionGap: spacing.sm,
    copyMinWidth: 132,
    actions: slots,
    overflowWidth: ACTION_SIZE,
  });

  const inline = plan.inline
    .map((key) => (actions ?? []).find((action) => action.key === key))
    .filter((action): action is MediaCardAction => action !== undefined);
  const overflow = plan.overflow
    .map((key) => (actions ?? []).find((action) => action.key === key))
    .filter((action): action is MediaCardAction => action !== undefined);

  // The card's own wash is Card's job now. The halo behind the artwork is
  // still local, and it needs a scheme-dependent alpha: the same tint reads
  // heavier on a dark canvas, and a halo tuned in one theme blooms in the other.
  const haloAlpha = scheme === "dark" ? 0.4 : 0.3;

  const body = (
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
      />
    </View>
  );

  const copy = (
    <View style={styles.copy}>
      <HighlightedText
        type="bodyStrong"
        numberOfLines={1}
        text={title}
        ranges={titleRanges ?? []}
      />
      {meta ? (
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {meta}
        </ThemedText>
      ) : null}
      {detail ? (
        <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
          {detail}
        </ThemedText>
      ) : null}
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

      <View style={[styles.content, plan.reflow ? styles.stack : styles.inline]}>
        {onPress ? (
          <ElasticPressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            scaleTo={0.985}
            overshootTo={1.004}
            haptic="light"
            onPress={onPress}
            style={[styles.body, plan.reflow ? null : styles.bodyInline]}>
            {body}
            {copy}
          </ElasticPressable>
        ) : (
          <View style={[styles.body, plan.reflow ? null : styles.bodyInline]}>
            {body}
            {copy}
          </View>
        )}

        {inline.length > 0 || overflow.length > 0 ? (
          <View style={[styles.actions, plan.reflow ? styles.actionsReflow : null]}>
            {inline.map((action) => (
              <View key={action.key}>{action.node}</View>
            ))}
            {overflow.length > 0 ? (
              <ElasticPressable
                accessibilityRole="button"
                accessibilityLabel={`More actions for ${title}`}
                scaleTo={0.86}
                overshootTo={1.08}
                haptic="selection"
                onPress={() => setMenuOpen(true)}
                style={styles.overflowButton}>
                <Icon name="more" size={18} color={theme.icon} />
              </ElasticPressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {progressRatio !== undefined && progressRatio !== null ? (
        <GlassProgress
          progress={progressRatio}
          tint={tint}
          thickness={4}
          style={styles.progress}
        />
      ) : null}

      {menuOpen ? (
        <ActionMenu
          title={title}
          actions={overflow}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </Card>
  );
}

/**
 * The controls that did not fit, as named rows.
 *
 * A `Modal` rather than an in-card popover: the card lives inside a virtualised
 * list, and anything absolutely positioned inside it is clipped by the list's
 * own bounds. A `Modal` is a separate window, so the menu lands above everything
 * and needs no measurement of where the card was.
 */
function ActionMenu({
  title,
  actions,
  onClose,
}: {
  title: string;
  actions: readonly MediaCardAction[];
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
      />
      <View style={styles.menuHost} pointerEvents="box-none">
        <GlassSurface tone="surfaceStrong" radius={radii.panel} clip style={styles.menu}>
          <ThemedText type="overline" themeColor="textTertiary" numberOfLines={1}>
            {title}
          </ThemedText>
          {actions.map((action) => (
            <ElasticPressable
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              haptic="light"
              onPress={() => {
                // Closed before the action runs: the action is usually a
                // navigation, and a menu that outlives the screen under it would
                // be left floating over the destination.
                onClose();
                action.onPress();
              }}
              style={styles.menuRow}>
              <Icon
                name={action.icon}
                size={20}
                color={action.danger ? theme.danger : theme.icon}
              />
              <ThemedText
                type="body"
                numberOfLines={1}
                style={action.danger ? { color: theme.danger } : undefined}>
                {action.label}
              </ThemedText>
            </ElasticPressable>
          ))}
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    // No padding of its own: the content owns it, so the progress bar can run
    // the full width of the panel without fighting a parent inset.
  },
  content: {
    padding: spacing.md,
    paddingRight: spacing.sm,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stack: {
    gap: spacing.sm,
  },
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  bodyInline: {
    flex: 1,
  },
  tileWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  actionsReflow: {
    justifyContent: "flex-end",
  },
  overflowButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  progress: {
    marginTop: spacing.xs,
  },
  menuHost: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  menu: {
    padding: spacing.md,
    gap: spacing.xxs,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    minHeight: 48,
  },
});
