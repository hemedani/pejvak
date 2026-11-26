import { type Document, ObjectId } from "lesan";
import { channelAudio } from "../../mod.ts";
import { throwError } from "@lib";
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
 *
 * The CLI (`deno task backfill:waveforms`) walks every page. The admin act
 * (`adminBackfillChannelWaveforms`) calls the same batch helper for one row or a
 * bounded page, so a large database can be backfilled without one long request.
 */

const PAGE_SIZE = 100;
const MAX_BATCH = 200;

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

export type BackfillWaveformBatch = BackfillWaveformReport & {
  /** Cursor for the next call; null when no row was examined. */
  lastId: string | null;
  /** True when no candidate rows remain beyond this batch. */
  done: boolean;
};

export type BackfillWaveformOptions = {
  /** Maximum rows to examine in this call (1–200). Defaults to one page. */
  limit?: number;
  /** Resume after the `lastId` returned by the previous call. */
  afterId?: string;
  /** Measure exactly this row, ignoring `limit` and `afterId`. */
  audioId?: string;
};

type Candidate = { _id: ObjectId; mediaPath?: unknown };

const objectIdOf = (
  value: string | undefined,
  field: string,
): ObjectId | undefined => {
  if (value === undefined || value === "") return undefined;
  if (!ObjectId.isValid(value)) throwError(`Invalid ${field}`);
  return new ObjectId(value);
};

const clampLimit = (value: number | undefined): number => {
  if (value === undefined) return PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_BATCH);
};

const fillRow = async (
  row: Candidate,
  report: BackfillWaveformBatch,
): Promise<void> => {
  report.scanned++;
  report.lastId = String(row._id);

  const mediaPath = typeof row.mediaPath === "string"
    ? row.mediaPath.trim()
    : "";
  if (!mediaPath) {
    report.failed++;
    return;
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
    return;
  }

  const peaks = await waveformPeaks(absolute);
  if (peaks.length !== WAVEFORM_PEAKS) {
    report.failed++;
    console.warn(`backfill: no waveform for ${mediaPath}`);
    return;
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
};

/**
 * Processes at most one bounded page (or one targeted row).
 *
 * `done` is computed from the number of rows fetched rather than from updated
 * rows: a skipped missing file still advances the cursor, so the next call must
 * not see it again.
 */
export const backfillWaveformsBatch = async (
  options: BackfillWaveformOptions = {},
): Promise<BackfillWaveformBatch> => {
  const targetId = objectIdOf(options.audioId, "audioId");
  const afterId = targetId ? undefined : objectIdOf(options.afterId, "afterId");
  const limit = targetId ? 1 : clampLimit(options.limit);

  const match: Document = {
    mediaPath: { $exists: true, $nin: [null, ""] },
    // Matches missing, empty and wrong-length arrays in one predicate.
    waveform: { $not: { $size: WAVEFORM_PEAKS } },
  };
  if (targetId) match._id = targetId;
  else if (afterId) match._id = { $gt: afterId };

  const rows = await channelAudio
    .aggregation({
      pipeline: [
        { $match: match },
        { $sort: { _id: 1 } },
        { $limit: targetId ? 1 : limit + 1 },
        { $project: { _id: 1, mediaPath: 1, waveform: 1 } },
      ],
    })
    .toArray() as Candidate[];

  const report: BackfillWaveformBatch = {
    scanned: 0,
    updated: 0,
    skippedMissing: 0,
    failed: 0,
    lastId: null,
    done: targetId ? true : rows.length <= limit,
  };

  const batch = targetId ? rows : rows.slice(0, limit);
  for (const row of batch) {
    await fillRow(row, report);
  }

  return report;
};

/** Walks every page. Used by the CLI and by the admin act's "all" mode. */
export const backfillWaveforms = async (): Promise<BackfillWaveformReport> => {
  const report: BackfillWaveformReport = {
    scanned: 0,
    updated: 0,
    skippedMissing: 0,
    failed: 0,
  };

  let afterId: string | undefined;

  while (true) {
    const batch = await backfillWaveformsBatch({
      limit: PAGE_SIZE,
      ...(afterId !== undefined ? { afterId } : {}),
    });

    report.scanned += batch.scanned;
    report.updated += batch.updated;
    report.skippedMissing += batch.skippedMissing;
    report.failed += batch.failed;

    if (batch.done || batch.lastId === null) break;
    afterId = batch.lastId;
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
