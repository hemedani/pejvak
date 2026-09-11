import { pickAnnotationColor } from "@/lib/annotations";
import type { LocalAnnotation, LocalTrack } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";
import { syncPending } from "@/services/SyncService";

export type CreateAnnotationArgs = {
  track: Pick<LocalTrack, "id" | "contentHash">;
  positionSec: number;
  text: string;
};

export type UpdateAnnotationArgs = {
  annotation: LocalAnnotation;
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

  async updateAnnotation({ annotation, text }: UpdateAnnotationArgs): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Annotation text is required");
    }

    await LocalDBService.updateAnnotation(annotation.id, { text: trimmed });
    void syncPending().catch(() => undefined);
  },

  /**
   * Tombstones the note instead of deleting the row outright: the queued
   * tombstone lets the server delete by `clientId` even if the original create's
   * response was lost. The sync engine hard-deletes the row after acknowledgement.
   */
  async deleteAnnotation(annotation: LocalAnnotation): Promise<void> {
    await LocalDBService.softDeleteAnnotation(annotation.id);
    void syncPending().catch(() => undefined);
  },
};
