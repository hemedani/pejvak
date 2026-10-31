/**
 * The collections the listener started and did not finish.
 *
 * A Continue card is the only card on the site whose primary action is not a
 * link: it resumes. The body still links to the collection, so "where am I" and
 * "start listening again" are two different targets rather than one compromise.
 *
 * The resume position comes from the run, never from the saved collection — the
 * collection can have changed upstream, and the index that matches what was
 * actually heard is the run's. A live station is the one exception: a broadcast
 * has no position to return to, so it always starts at the top of its list.
 */

import { CollectionCard } from "@/components/online/collection-card";
import { CollectionGrid } from "@/components/online/collection-grid";
import { PlayCollectionButton } from "@/components/online/play-collection-button";
import { isLiveSource } from "@/lib/online/catalogue";
import { collectionForContinueItem, type ContinueItem } from "@/lib/online/continue";

export function ContinueShelf({ items }: { items: readonly ContinueItem[] }) {
  return (
    <CollectionGrid>
      {items.map((item) => {
        const collection = collectionForContinueItem(item);
        const live = isLiveSource(collection.sourceId);
        const playable = {
          key: collection.key,
          sourceId: collection.sourceId,
          externalId: collection.externalId,
          title: collection.title,
          artworkUrl: collection.artworkUrl,
          languageCode: collection.languageCode,
          trackCount: item.trackCount,
        };

        return (
          <CollectionCard
            key={item.key}
            collection={collection}
            href={`/browse/collection/${encodeURIComponent(item.sourceId)}/${encodeURIComponent(item.externalId)}`}
            run={item.run}
            action={
              <PlayCollectionButton
                collection={playable}
                index={live ? 0 : item.lastIndex}
                startPositionSec={live ? 0 : item.resumeTargetSec}
                label={live ? "پخش زنده" : "ادامه"}
                variant="secondary"
                size="sm"
              />
            }
          />
        );
      })}
    </CollectionGrid>
  );
}
