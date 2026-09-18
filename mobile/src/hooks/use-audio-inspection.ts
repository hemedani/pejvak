import { useCallback, useEffect, useState } from "react";

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

/**
 * Reads a track's stream header, tag and cover-art size on demand.
 *
 * On demand rather than at import, on purpose. Codec, bitrate and sample rate
 * are facts about the file as it is *now*: storing them would mean a column per
 * field, a migration to add them, and a stale value the moment the file is
 * replaced. This is a screen someone opened deliberately, so one bounded read of
 * its header is a fair price for always being right.
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

  useEffect(() => {
    if (!trackId || !uri || missing) {
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
  }, [fileName, fileSizeBytes, missing, nonce, trackId, uri]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  const current = loaded && loaded.id === trackId ? loaded : null;

  return {
    inspection: current?.inspection ?? EMPTY_AUDIO_INSPECTION,
    loading: !missing && uri !== null && current === null,
    error: missing ? MISSING_MESSAGE : (current?.error ?? null),
    refresh,
  };
}
