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

import { favoriteAction } from "@/components/ui/row";
import { MediaCard, type MediaCardAction } from "@/components/ui/media-card";
import type { StatusSpec } from "@/lib/rowStatus";

export type CollectionCardProps = {
  title: string;
  /** The line under the title: "29 tracks", "12 of 29 · Downloaded". */
  meta?: string | null;
  artworkUrl?: string | null;
  /** Seeds the fallback gradient, so a coverless show still has an identity. */
  paletteKey: string;
  /** 0–1, drawn as a full-bleed bar under the card. Omit for no bar. */
  progressRatio?: number | null;
  /** The download state as one status line, when the caller knows it. */
  status?: StatusSpec | null;
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
  status,
  isFavorite = false,
  onToggleFavorite,
  actions,
  onPress,
  accessibilityHint,
}: CollectionCardProps) {
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
      list.push(
        favoriteAction({ title, isFavorite, onPress: onToggleFavorite }),
      );
    }
    if (actions) {
      list.push(...actions);
    }
    return list;
  }, [actions, isFavorite, onToggleFavorite, title]);

  return (
    <MediaCard
      title={title}
      meta={meta}
      artworkUrl={artworkUrl}
      paletteKey={paletteKey}
      tileSize={56}
      progressRatio={progressRatio}
      status={status}
      actions={cluster}
      onPress={onPress}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
    />
  );
}
