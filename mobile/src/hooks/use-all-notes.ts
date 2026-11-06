import { useCallback, useEffect, useState } from "react";

import type { AnnotationWithTrack } from "@/lib/db/types";
import { AnnotationService } from "@/services/AnnotationService";

export type UseAllNotesResult = {
  notes: AnnotationWithTrack[];
  loading: boolean;
  refresh: () => Promise<void>;
  remove: (note: AnnotationWithTrack) => Promise<void>;
};

/**
 * Every note in the library, newest-edited first, read from SQLite.
 *
 * State is screen-local, like the per-track hook: annotations live in the
 * database and are not mirrored into a store. Deleting re-reads rather than
 * splicing the array, because the same write also queues a tombstone for sync
 * and a second copy could arrive from the server later.
 */
export function useAllNotes(): UseAllNotesResult {
  const [notes, setNotes] = useState<AnnotationWithTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setNotes(await AnnotationService.getAllNotes());
    setLoading(false);
  }, []);

  useEffect(() => {
    // Read in the effect body and set state from the callback, so the first
    // paint is not blocked by the query and a screen that unmounts mid-read
    // never writes to a dead component.
    let cancelled = false;
    void AnnotationService.getAllNotes().then((rows) => {
      if (cancelled) {
        return;
      }
      setNotes(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = useCallback(
    async (note: AnnotationWithTrack) => {
      await AnnotationService.deleteAnnotation(note.annotation);
      await refresh();
    },
    [refresh],
  );

  return { notes, loading, refresh, remove };
}
