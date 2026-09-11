import { useCallback, useEffect, useState } from "react";

import type { LocalAnnotation } from "@/lib/db/types";
import {
  AnnotationService,
  type CreateAnnotationArgs,
  type UpdateAnnotationArgs,
} from "@/services/AnnotationService";

export type UseTrackAnnotationsResult = {
  annotations: LocalAnnotation[];
  creating: boolean;
  error: string | null;
  create: (args: CreateAnnotationArgs) => Promise<boolean>;
  update: (args: UpdateAnnotationArgs) => Promise<boolean>;
  remove: (annotation: LocalAnnotation) => Promise<boolean>;
  refresh: () => Promise<void>;
};

type LoadedAnnotations = { trackId: string; rows: LocalAnnotation[] };

/**
 * Loads the annotations for a track and keeps them in sync with local writes.
 * State is screen-local: annotations live in SQLite and are not mirrored into a
 * Zustand store. Results are keyed by track so a previous track's notes never
 * flash while the next track loads.
 */
export function useTrackAnnotations(
  trackId: string | null | undefined,
): UseTrackAnnotationsResult {
  const [loaded, setLoaded] = useState<LoadedAnnotations | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackId) {
      return;
    }
    let cancelled = false;
    void AnnotationService.getTrackAnnotations(trackId).then((rows) => {
      if (!cancelled) {
        setLoaded({ trackId, rows });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const refresh = useCallback(async () => {
    if (!trackId) {
      setLoaded(null);
      return;
    }
    const rows = await AnnotationService.getTrackAnnotations(trackId);
    setLoaded({ trackId, rows });
  }, [trackId]);

  const create = useCallback(
    async (args: CreateAnnotationArgs): Promise<boolean> => {
      setCreating(true);
      setError(null);
      try {
        await AnnotationService.createAnnotation(args);
        await refresh();
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save the note");
        return false;
      } finally {
        setCreating(false);
      }
    },
    [refresh],
  );

  const update = useCallback(
    async (args: UpdateAnnotationArgs): Promise<boolean> => {
      setCreating(true);
      setError(null);
      try {
        await AnnotationService.updateAnnotation(args);
        await refresh();
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not update the note");
        return false;
      } finally {
        setCreating(false);
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (annotation: LocalAnnotation): Promise<boolean> => {
      setCreating(true);
      setError(null);
      try {
        await AnnotationService.deleteAnnotation(annotation);
        await refresh();
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not delete the note");
        return false;
      } finally {
        setCreating(false);
      }
    },
    [refresh],
  );

  const annotations = loaded && loaded.trackId === trackId ? loaded.rows : [];

  return { annotations, creating, error, create, update, remove, refresh };
}
