import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

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
 *
 * **Read on focus, not on mount.** The screen that uses this is a dock
 * destination, so it stays mounted for the life of the app — and notes are
 * written in the player, which is a modal over that tab rather than a screen it
 * pushed. A one-time read would mean a note written after the first visit never
 * appeared.
 */
export function useAllNotes(): UseAllNotesResult {
  const [notes, setNotes] = useState<AnnotationWithTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setNotes(await AnnotationService.getAllNotes());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const remove = useCallback(
    async (note: AnnotationWithTrack) => {
      await AnnotationService.deleteAnnotation(note.annotation);
      await refresh();
    },
    [refresh],
  );

  return { notes, loading, refresh, remove };
}
