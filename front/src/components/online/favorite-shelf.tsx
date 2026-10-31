/**
 * The collections the listener marked.
 *
 * A favourite is a saved row with `isFavorite: true` (see `favorite-button.tsx`),
 * so this shelf is a filtered read of the same table Continue reads — one source
 * of truth, two views. The card is a plain link here: un-favouriting belongs on
 * the collection's own page, where the heart can say what it will do next
 * instead of disappearing under the cursor.
 */

import { CollectionCard } from "@/components/online/collection-card";
import { CollectionGrid } from "@/components/online/collection-grid";
import type { OnlineCollectionRow } from "@/lib/online/types";

export function FavoriteShelf({ collections }: { collections: readonly OnlineCollectionRow[] }) {
  return (
    <CollectionGrid>
      {collections.map((collection) => (
        <CollectionCard
          key={collection.key}
          collection={collection}
          href={`/browse/collection/${encodeURIComponent(collection.sourceId)}/${encodeURIComponent(collection.externalId)}`}
        />
      ))}
    </CollectionGrid>
  );
}
