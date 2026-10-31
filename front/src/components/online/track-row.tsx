/**
 * One item inside an opened collection.
 *
 * A row rather than a table row: the source gives a title, sometimes an artist
 * and sometimes a length, and a table would claim columns it cannot fill. The
 * numbers that do exist are tabular, and the ones that do not are an em dash —
 * never «۰:۰۰», which reads as a real length of zero rather than as "the source
 * did not say".
 *
 * The play control starts **the whole collection at this row**, so the run it
 * opens has the collection's length and the listener can keep going past the
 * episode they picked. It is a client leaf of its own; everything around it is
 * rendered on the server.
 */

import { NowPlayingMarker } from "@/components/online/now-playing-marker";
import { PlayCollectionButton } from "@/components/online/play-collection-button";
import { Icon } from "@/components/ui/icon";
import { fa, formatClockFa } from "@/lib/format";
import type { PlayableCollection } from "@/lib/online/play";
import type { OnlineTrack } from "@/lib/online/types";
import { isPlayableUrl } from "@/lib/player/stream";

export function TrackRow({
  track,
  collection,
}: {
  track: OnlineTrack;
  collection: PlayableCollection;
}) {
  const duration = track.durationSec > 0 ? formatClockFa(track.durationSec) : "—";
  const pageUrl = track.pageUrl && isPlayableUrl(track.pageUrl) ? track.pageUrl : null;

  return (
    <li className="flex items-center gap-[var(--space-md)] px-[var(--space-md)] py-[var(--space-sm)] sm:px-[var(--space-lg)]">
      <span className="type-numeric w-7 shrink-0 text-end text-text-tertiary" dir="ltr">
        {fa(track.order)}
      </span>

      <PlayCollectionButton
        collection={collection}
        index={track.order - 1}
        label="پخش از این قطعه"
        variant="ghost"
        size="icon"
        iconOnly
        className="shrink-0"
      />

      <div className="min-w-0 flex-1">
        <p className="type-label truncate text-text" title={track.title}>
          {track.title}
        </p>
        {track.artist ? (
          <p className="type-caption truncate text-text-tertiary">{track.artist}</p>
        ) : null}
      </div>

      <NowPlayingMarker
        sourceId={collection.sourceId}
        externalId={track.externalId}
        collectionKey={collection.key}
      />

      <span className="type-numeric shrink-0 text-text-tertiary" dir="ltr">
        {duration}
      </span>

      {pageUrl ? (
        <a
          href={pageUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="صفحهٔ این قطعه در منبع"
          className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          <Icon name="external" size="sm" />
        </a>
      ) : (
        // The column keeps its width whether or not a row has a page, so the
        // durations stay in one line down the list.
        <span aria-hidden className="size-9 shrink-0" />
      )}
    </li>
  );
}
