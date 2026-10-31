"use client";

/**
 * The heart, and what it means.
 *
 * A favourite **is** a saved row: `saveOnlineCollection` upserts the collection
 * with `isFavorite: true`, and that row is what the Favorites tab lists. There is
 * no second table and no second write — a "favourite" that lived somewhere else
 * would eventually disagree with the shelf about what is on it.
 *
 * The toggle is optimistic because it is a switch, not a request: the listener
 * expects the heart to fill under their finger. If the write fails, the heart
 * goes back and a sentence says why — a heart that stays filled while the
 * favourite did not save is the one outcome worth preventing.
 *
 * `aria-pressed` carries the state to a screen reader. The filled glyph is drawn
 * with `fill-current` rather than a second icon, so the two states cannot drift
 * into two different shapes.
 */

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { saveOnlineCollection } from "@/app/actions/online/save-online-collection";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { failureMessage } from "@/lib/messages";
import type { PlayableCollection } from "@/lib/online/play";

export function FavoriteButton({
  collection,
  initialFavorite,
}: {
  collection: PlayableCollection;
  initialFavorite: boolean;
}) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const busy = useRef(false);

  async function toggle() {
    if (busy.current) {
      return;
    }
    busy.current = true;

    const next = !favorite;
    setFavorite(next);
    setError(null);

    if (!collection.languageCode) {
      setFavorite(!next);
      setError("زبان این مجموعه معلوم نیست؛ نشان کردن ممکن نشد.");
      busy.current = false;
      return;
    }

    const result = await saveOnlineCollection({
      collection: {
        sourceId: collection.sourceId,
        externalId: collection.externalId,
        title: collection.title,
        languageCode: collection.languageCode,
        trackCount: collection.trackCount,
        ...(collection.subtitle ? { subtitle: collection.subtitle } : {}),
        ...(collection.artworkUrl ? { artworkUrl: collection.artworkUrl } : {}),
        ...(collection.pageUrl ? { pageUrl: collection.pageUrl } : {}),
      },
      isFavorite: next,
    });

    busy.current = false;

    if (!result.success) {
      setFavorite(!next);
      setError(failureMessage(result.error));
      return;
    }

    // The shelf a page renders was read before this write, so the row's
    // presence (and the remove control that depends on it) is now stale.
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col items-start gap-[var(--space-xs)]">
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={() => void toggle()}
        aria-pressed={favorite}
        className={favorite ? "text-accent" : undefined}
      >
        <Icon name="favorite" size="sm" className={favorite ? "fill-current" : undefined} />
        {favorite ? "نشان‌شده" : "نشان کردن"}
      </Button>

      {error ? (
        <p className="type-caption text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
