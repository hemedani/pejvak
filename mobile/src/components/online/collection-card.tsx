/**
 * A collection card — one show, album or course.
 *
 * Shared by Browse, Favorites, Continue and a source's own listing, because the
 * four answer the same question ("what is this, and where am I in it?") and four
 * cards would eventually disagree about how to render it. What differs between
 * them is only the middle line and the trailing controls, so both are props.
 *
 * The drawing itself belongs to `MediaCard` — the same glass card a track row
 * uses. A course and a file are the same kind of thing on screen, and giving
 * them two different card languages was what made the online shelves read as a
 * different app.
 */

import { useMemo } from "react";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Icon } from "@/components/ui/icon";
import { MediaCard, type MediaCardAction } from "@/components/ui/media-card";
import { useTheme } from "@/hooks/use-theme";

/** The width of a circular control in the cluster, for the fit budget. */
const CONTROL_WIDTH = 40;

export type CollectionCardProps = {
  title: string;
  /** The line under the title: "29 tracks", "12 of 29 · Downloaded". */
  meta?: string | null;
  artworkUrl?: string | null;
  /** Seeds the fallback gradient, so a coverless show still has an identity. */
  paletteKey: string;
  /** 0–1, drawn as a full-bleed bar under the card. Omit for no bar. */
  progressRatio?: number | null;
  isFavorite?: boolean;
  /** Renders a filled bookmark. Omit for a read-only card. */
  onToggleFavorite?: () => void;
  /** Extra trailing controls — a per-row download button, say. */
  actions?: readonly MediaCardAction[];
  onPress: () => void;
  accessibilityHint?: string;
};

export function CollectionCard({
  title,
  meta,
  artworkUrl,
  paletteKey,
  progressRatio,
  isFavorite = false,
  onToggleFavorite,
  actions,
  onPress,
  accessibilityHint,
}: CollectionCardProps) {
  const theme = useTheme();
  const accent = theme.accent;
  const muted = theme.textTertiary;

  /**
   * The favourite toggle is declared as an action rather than drawn beside one.
   *
   * That is what puts it in the same responsive cluster as everything else: on a
   * narrow card it moves with the rest instead of being the one control that
   * stays put and squeezes the title.
   */
  const cluster = useMemo<MediaCardAction[]>(() => {
    const list: MediaCardAction[] = [];
    if (onToggleFavorite) {
      list.push({
        key: "favorite",
        width: CONTROL_WIDTH,
        priority: 3,
        icon: isFavorite ? "bookmarkFilled" : "bookmark",
        label: isFavorite ? "Remove from favorites" : "Add to favorites",
        onPress: onToggleFavorite,
        node: (
          <ElasticPressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? "Remove from favorites" : "Add to favorites"}
            scaleTo={0.86}
            overshootTo={1.08}
            haptic="selection"
            onPress={onToggleFavorite}
            style={{
              width: CONTROL_WIDTH,
              height: CONTROL_WIDTH,
              alignItems: "center",
              justifyContent: "center",
            }}>
            <Icon
              name={isFavorite ? "bookmarkFilled" : "bookmark"}
              size={21}
              color={isFavorite ? accent : muted}
            />
          </ElasticPressable>
        ),
      });
    }
    if (actions) {
      list.push(...actions);
    }
    return list;
  }, [accent, actions, isFavorite, muted, onToggleFavorite]);

  return (
    <MediaCard
      title={title}
      meta={meta}
      artworkUrl={artworkUrl}
      paletteKey={paletteKey}
      tileSize={56}
      progressRatio={progressRatio}
      actions={cluster}
      onPress={onPress}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
    />
  );
}
