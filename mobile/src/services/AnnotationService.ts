import { pickAnnotationColor } from "@/lib/annotations";
import type { LocalAnnotation, LocalTrack } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";
import { syncPending } from "@/services/SyncService";

export type CreateAnnotationArgs = {
  track: Pick<LocalTrack, "id" | "contentHash">;
  positionSec: number;
  text: string;
};

/**
 * Annotations are local-first notes anchored to a track position. Creation
 * writes to SQLite immediately and pushes to the server in the background; text
 * editing/deletion sync is out of scope until the backend exposes those acts.
 */
export const AnnotationService = {
  getTrackAnnotations(trackId: string): Promise<LocalAnnotation[]> {
    return LocalDBService.getAnnotationsByTrack(trackId);
  },

  async createAnnotation({
    track,
    positionSec,
    text,
  }: CreateAnnotationArgs): Promise<LocalAnnotation> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Annotation text is required");
    }

    const [existing, sessions] = await Promise.all([
      LocalDBService.getAnnotationsByTrack(track.id),
      LocalDBService.getSessionsByTrack(track.id),
    ]);

    const annotation = await LocalDBService.insertAnnotation({
      trackId: track.id,
      contentHash: track.contentHash,
      positionSec: Math.round(positionSec),
      text: trimmed,
      color: pickAnnotationColor(existing.length),
      timesPlayedBefore: sessions.filter((session) => session.endedAt !== null).length,
    });

    void syncPending().catch(() => undefined);
    return annotation;
  },
};
