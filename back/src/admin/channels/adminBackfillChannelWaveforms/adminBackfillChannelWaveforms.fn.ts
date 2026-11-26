import type { ActFn } from "lesan";
import { pickByGet } from "@lib";
import { recordAudit } from "../../audit.ts";
import {
  type BackfillWaveformBatch,
  backfillWaveforms,
  backfillWaveformsBatch,
} from "../../../channels/backfillWaveforms.ts";

/**
 * Fills `channelAudio.waveform` for episodes that predate server measurement.
 *
 * The three modes exist because "fill everything" and "show me this one row"
 * are different operations:
 *
 * - `audioId` measures one episode and ignores paging.
 * - `limit` measures a bounded page; the caller passes the returned `lastId`
 *   back as `afterId` until `done` is true. This is the safe mode for a large
 *   catalogue, because one request never has to decode every file.
 * - neither measures every remaining candidate in one request.
 *
 * Only `waveform` is written. A missing file stays a skipped row and a filled
 * row is never measured again, so re-running is a no-op. Every call is audited:
 * a backfill is an operator action even when it changes nothing.
 */
export const adminBackfillChannelWaveformsFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const audioId = set.audioId === undefined ? undefined : String(set.audioId);

  let result: BackfillWaveformBatch;

  if (audioId !== undefined) {
    result = await backfillWaveformsBatch({ audioId });
  } else if (set.limit !== undefined || set.afterId !== undefined) {
    result = await backfillWaveformsBatch({
      ...(set.limit !== undefined ? { limit: set.limit } : {}),
      ...(set.afterId !== undefined ? { afterId: set.afterId } : {}),
    });
  } else {
    result = { ...await backfillWaveforms(), lastId: null, done: true };
  }

  await recordAudit({
    action: "channelAudio.backfillWaveforms",
    targetType: "channelAudio",
    ...(audioId !== undefined ? { targetId: audioId } : {}),
    summary:
      `Filled ${result.updated} of ${result.scanned} channel waveform(s)`,
    metadata: { ...result },
  });

  return pickByGet(result, get);
};
