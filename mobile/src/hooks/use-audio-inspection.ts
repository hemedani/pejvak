import { useCallback, useEffect, useState } from "react";

import { isStreamUri } from "@/lib/audioLocation";
import type { LocalTrack } from "@/lib/db/types";
import {
  EMPTY_AUDIO_INSPECTION,
  inspectAudioFile,
  type AudioInspection,
} from "@/services/AudioInspectionService";

export type UseAudioInspectionResult = {
  inspection: AudioInspection;
  /** True while this track's header is being read. */
  loading: boolean;
  /** Why there is nothing to show — a missing file, an unreadable one. */
  error: string | null;
  refresh: () => void;
};

type Loaded = { id: string; inspection: AudioInspection; error: string | null };

const MISSING_MESSAGE = "The file is not where the library last saw it.";
const STREAM_MESSAGE =
  "This track streams from its source, so there is nothing on this device to read.";

/**
 * Reads a track's stream header, tag and cover-art size on demand.
 *
 * On demand rather than at import, on purpose. Codec, bitrate and sample rate
 * are facts about the file as it is *now*: storing them would mean a column per
 * field, a migration to add them, and a stale value the moment the file is
 * replaced. This is a screen someone opened deliberately, so one bounded read of
 * its header is a fair price for always being right.
 *
 * Two reasons a row has nothing to read — a file that is gone, and a track that
 * only streams — and both are properties of the row rather than results of a
 * read, so both are derived here and answered without touching the filesystem.
 * A stream is refused rather than attempted because the attempt cannot succeed:
 * the reader behind `inspectAudioFile` accepts only a file, a SAF URI, an asset
 * or a resource path, so an `http(s)` URL would surface a native
 * "Unsupported scheme" message to the listener where the truth is simply that
 * this track lives somewhere else.
 *
 * Every piece of state is keyed by track id and read back through that key, so
 * a previous track's codec never flashes while the next one is read — and so no
 * effect has to reset anything, which is what would otherwise make the read run
 * twice per navigation.
 */
export function useAudioInspection(track: LocalTrack | null): UseAudioInspectionResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  // Primitives only. Depending on the `track` object would re-read the file on
  // every parent re-render, since each load produces a fresh object.
  const trackId = track?.id ?? null;
  const uri = track ? (track.fileUri ?? track.sourceUri) : null;
  const fileName = track?.fileName ?? track?.title ?? "";
  const fileSizeBytes = track?.fileSizeBytes ?? 0;
  const missing = track?.availability === "missing";
  const streamed = uri !== null && isStreamUri(uri);

  useEffect(() => {
    if (!trackId || !uri || missing || streamed) {
      return;
    }

    let cancelled = false;
    void inspectAudioFile(uri, { fileName, fileSizeBytes })
      .then((inspection) => {
        if (!cancelled) {
          setLoaded({ id: trackId, inspection, error: null });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoaded({
            id: trackId,
            inspection: EMPTY_AUDIO_INSPECTION,
            error: cause instanceof Error ? cause.message : "Could not read this file.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileName, fileSizeBytes, missing, nonce, streamed, trackId, uri]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  const current = loaded && loaded.id === trackId ? loaded : null;

  return {
    inspection: current?.inspection ?? EMPTY_AUDIO_INSPECTION,
    // A streamed row never starts a read, so it must never report one as
    // pending — otherwise the spinner would turn forever over a track that is
    // working exactly as intended.
    loading: !missing && !streamed && uri !== null && current === null,
    error: missing ? MISSING_MESSAGE : streamed ? STREAM_MESSAGE : (current?.error ?? null),
    refresh,
  };
}
