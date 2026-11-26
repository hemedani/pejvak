import { type Document } from "lesan";
import { channelAudio } from "../../mod.ts";
import { UPLOAD_ROOT, WAVEFORM_PEAKS, waveformPeaks } from "./media.ts";

/**
 * One-shot, idempotent backfill for episodes published before waveforms existed.
 *
 * The publish act measures a new episode from the bytes on disk, but rows that
 * predate that act carry no `waveform`. This walks them in `_id` order and fills
 * the field in place. It is deliberately conservative:
 *
 * - The match is "has a `mediaPath` and does not already have the right-sized
 *   waveform", so a filled row is never measured again.
 * - A missing file is a **skipped** row, not an error and never a delete: the
 *   episode stays published with an empty waveform, and the client falls back to
 *   its sample strip.
 * - A failed measurement is counted and left empty for the same reason.
 * - Only `waveform` is written. `updatedAt` is not bumped — this is a backfill,
 *   not a user edit, and the row's visible timestamp should not change.
 *
 * Paging is by `_id > lastId` rather than skip/limit: an updated row leaves the
 * match set, and skip-based paging would then skip its neighbours.
 */

const PAGE_SIZE = 100;

export type BackfillWaveformReport = {
  /** Rows that matched (needed a waveform) and were examined. */
  scanned: number;
  /** Rows filled with a correctly sized strip. */
  updated: number;
  /** Rows whose bytes are gone. */
  skippedMissing: number;
  /** Rows present on disk but not measurable (bad audio, ffmpeg absent). */
  failed: number;
};

type Candidate = { _id: unknown; mediaPath?: unknown };

export const backfillWaveforms = async (): Promise<BackfillWaveformReport> => {
  const report: BackfillWaveformReport = {
    scanned: 0,
    updated: 0,
    skippedMissing: 0,
    failed: 0,
  };

  let lastId: unknown = undefined;

  while (true) {
    const match: Document = {
      mediaPath: { $exists: true, $nin: [null, ""] },
      // Matches missing, empty and wrong-length arrays in one predicate.
      waveform: { $not: { $size: WAVEFORM_PEAKS } },
    };
    if (lastId !== undefined) match._id = { $gt: lastId };

    const rows = await channelAudio
      .aggregation({
        pipeline: [
          { $match: match },
          { $sort: { _id: 1 } },
          { $limit: PAGE_SIZE },
          { $project: { _id: 1, mediaPath: 1, waveform: 1 } },
        ],
      })
      .toArray() as Candidate[];

    if (rows.length === 0) break;

    for (const row of rows) {
      report.scanned++;

      const mediaPath = typeof row.mediaPath === "string"
        ? row.mediaPath.trim()
        : "";
      if (!mediaPath) {
        report.failed++;
        continue;
      }

      const absolute = `${UPLOAD_ROOT}/${mediaPath}`;

      try {
        await Deno.stat(absolute);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          report.skippedMissing++;
          console.warn(`backfill: bytes missing for ${mediaPath}`);
        } else {
          report.failed++;
          console.warn(`backfill: could not stat ${absolute}:`, error);
        }
        continue;
      }

      const peaks = await waveformPeaks(absolute);
      if (peaks.length !== WAVEFORM_PEAKS) {
        report.failed++;
        console.warn(`backfill: no waveform for ${mediaPath}`);
        continue;
      }

      try {
        await channelAudio.findOneAndUpdate({
          filter: { _id: row._id },
          update: { $set: { waveform: peaks } } as never,
          projection: { _id: 1 },
        });
        report.updated++;
      } catch (error) {
        report.failed++;
        console.warn(`backfill: could not update ${mediaPath}:`, error);
      }
    }

    lastId = rows[rows.length - 1]._id;
  }

  return report;
};

if (import.meta.main) {
  try {
    const report = await backfillWaveforms();
    console.log(JSON.stringify(report));
    Deno.exit(0);
  } catch (error) {
    console.error("Waveform backfill failed:", error);
    Deno.exit(1);
  }
}
