/**
 * One online collection: its tracks, where the listener got to, and its download.
 *
 * The screen never talks to a source, to SQLite or to `expo-file-system`; it
 * asks this hook for the rows it should draw and for the verbs — play, download,
 * stop, retry.
 *
 * The loading rule is the offline-first rule: rows already on the device are
 * painted immediately, and the source is consulted *behind* them. A listener
 * opening a downloaded course on a plane sees the course, not a spinner that
 * eventually turns into an error.
 *
 * The result is stored *keyed by the collection it describes* rather than
 * guarded by a ref, following `useFolderDetail`. Two things fall out of that:
 * a late response for a collection the screen has left is simply not the
 * current key and is never painted, and there is no ref mutated during render —
 * which the React compiler lint rules refuse, correctly, because a ref written
 * while rendering is a value React is allowed to discard.
 */

import { useCallback, useEffect, useState } from "react";

import type {
  ContextStats,
  LocalDownloadJob,
  LocalOnlineCollection,
  LocalTrack,
} from "@/lib/db/types";
import { mergeJobs } from "@/lib/downloadProgress";
import type { FolderTrackProgress } from "@/lib/folderPlay";
import { OnlineSourceError } from "@/lib/online";
import * as DownloadService from "@/services/DownloadService";
import { LocalDBService } from "@/services/LocalDBService";
import { OnlineCatalogService } from "@/services/OnlineCatalogService";

/** Nothing is known about a track the listener has never played. */
const UNPLAYED: FolderTrackProgress = { finished: false, resumeSec: 0 };

const EMPTY_STATS: ContextStats = {
  playCount: 0,
  completedPlayCount: 0,
  listenedSec: 0,
  lastPlayedAt: null,
  bestFinishedCount: 0,
};

/** Shared so an empty collection does not hand out a new array every render. */
const EMPTY_TRACKS: LocalTrack[] = [];
const EMPTY_PROGRESS: Record<string, FolderTrackProgress> = {};
const EMPTY_JOBS: Record<string, LocalDownloadJob> = {};

/** Everything a full read produces, tagged with the collection it is about. */
type Loaded = {
  key: string;
  meta: LocalOnlineCollection | null;
  tracks: LocalTrack[];
  progress: Record<string, FolderTrackProgress>;
  stats: ContextStats;
  /** The source was unreachable; these rows are what the device already had. */
  fromCache: boolean;
  /** Set when there is nothing at all to show — never for a partial fallback. */
  error: string | null;
  /**
   * Whether the source has answered for this key.
   *
   * The local read is immediate and knows nothing about the network, so it
   * settles at `false`. A collection with no rows on the device would otherwise
   * stop being "loading" the moment that read returns, and the screen would
   * paint "No playable audio" over a request that is still in flight. The empty
   * state is only honest once the source has actually declined to answer.
   */
  settled: boolean;
};

/** The numbers that move while a download runs. */
type Live = {
  download: DownloadService.DownloadSummary | null;
  jobsByTrack: Record<string, LocalDownloadJob>;
};

/** A read of those numbers, before the unchanged rows are merged back in. */
type LiveRead = {
  download: DownloadService.DownloadSummary | null;
  jobs: LocalDownloadJob[];
};

/** How long a burst of notifications waits before one read answers all of them. */
const LIVE_REFRESH_MS = 200;

export type UseOnlineCollectionResult = {
  meta: LocalOnlineCollection | null;
  tracks: LocalTrack[];
  /** Per-track "finished" / "resume at", keyed by track id. */
  progress: Record<string, FolderTrackProgress>;
  finishedCount: number;
  totalDurationSec: number;
  /** How often the collection has been run, and how often through. */
  stats: ContextStats;
  /** Each track's own download row, keyed by track id. Empty when not queued. */
  jobsByTrack: Record<string, LocalDownloadJob>;
  fromCache: boolean;
  /** True only while there is nothing at all to show yet. */
  loading: boolean;
  error: string | null;
  download: DownloadService.DownloadSummary | null;
  refresh: () => Promise<void>;
  startDownload: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  retryDownload: () => Promise<void>;
  /** Remove the downloaded audio. Keeps the rows, and the history on them. */
  deleteDownload: () => Promise<void>;
};

function messageOf(error: unknown): string {
  if (error instanceof OnlineSourceError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Fold a fresh read into the state, keeping object identity where it can. */
function applyLive(previous: Live | null, next: LiveRead): Live {
  return {
    download: next.download,
    jobsByTrack: mergeJobs(previous?.jobsByTrack ?? EMPTY_JOBS, next.jobs),
  };
}

/**
 * The rows already on the device.
 *
 * Read on its own, before the source is asked anything, because this is what a
 * downloaded course is: opening one must not wait on a request that is going to
 * fail. It duplicates a little of what `OnlineCatalogService.loadCollection`
 * does internally, and that is the point — the duplicate is a handful of
 * indexed queries, and the alternative is a spinner in front of content the
 * listener can already see.
 */
async function readLocal(key: string): Promise<Loaded> {
  const [meta, tracks, progress, stats] = await Promise.all([
    LocalDBService.getOnlineCollection(key),
    LocalDBService.getTracksByCollection(key),
    LocalDBService.getCollectionTrackProgress(key),
    LocalDBService.getContextStats("online", key),
  ]);
  return {
    key,
    meta,
    tracks,
    progress,
    stats,
    fromCache: false,
    error: null,
    settled: false,
  };
}

/**
 * The source's answer, layered over the local read.
 *
 * A failure here is only worth reporting when the local read found nothing: a
 * collection the listener can already use must not be replaced by an error
 * message about the network.
 */
async function readRemote(key: string, local: Loaded): Promise<Loaded> {
  try {
    const result = await OnlineCatalogService.loadCollection(key);
    return {
      ...local,
      meta: result.meta,
      tracks: result.tracks,
      fromCache: result.fromCache,
      error: null,
      settled: true,
    };
  } catch (caught) {
    return {
      ...local,
      fromCache: true,
      error: local.tracks.length > 0 ? null : messageOf(caught),
      settled: true,
    };
  }
}

/** The cheap re-read: what a download is doing, and where each file is. */
async function readLiveFor(key: string): Promise<LiveRead> {
  const [download, jobs] = await Promise.all([
    DownloadService.getSummary(key),
    LocalDBService.getDownloadJobs(key),
  ]);
  return { download, jobs };
}

export function useOnlineCollection(key: string | null): UseOnlineCollectionResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  /** A failed action — a download that would not start — as opposed to a read. */
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      return;
    }
    let cancelled = false;
    void readLocal(key)
      .then((local) => {
        if (cancelled) {
          return undefined;
        }
        setLoaded(local);
        return readRemote(key, local).then((next) => {
          if (!cancelled) {
            setLoaded(next);
          }
        });
      })
      .catch((caught: unknown) => {
        // A read that threw is not a read that found nothing: say so, rather
        // than leaving the screen on a spinner that will never resolve.
        if (!cancelled) {
          setLoaded({
            key,
            meta: null,
            tracks: EMPTY_TRACKS,
            progress: EMPTY_PROGRESS,
            stats: EMPTY_STATS,
            fromCache: false,
            error: messageOf(caught),
            settled: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Download progress lives in the database and changes from outside this
  // screen, so it is re-read on a progress notification rather than polled. A
  // burst of notifications (the start of a file, a retry, a state change) is
  // folded into one trailing read: the numbers come from the same rows either
  // way, and reading them four times a second would cost more than the drawing.
  useEffect(() => {
    if (!key) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      timer = null;
      void readLiveFor(key).then((numbers) => {
        if (!cancelled) {
          setLive((previous) => applyLive(previous, numbers));
        }
      });
    };
    const unsubscribe = DownloadService.subscribe(() => {
      if (timer !== null) {
        return;
      }
      timer = setTimeout(read, LIVE_REFRESH_MS);
    });
    return () => {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
  }, [key]);

  const refresh = useCallback(async () => {
    if (!key) {
      return;
    }
    const local = await readLocal(key);
    setLoaded(local);
    const live = await readLiveFor(key);
    setLive((previous) => applyLive(previous, live));
    setLoaded(await readRemote(key, local));
  }, [key]);

  const startDownload = useCallback(async () => {
    if (!key) {
      return;
    }
    setActionError(null);
    try {
      await OnlineCatalogService.markOpened(key);
      await DownloadService.startDownload(key);
    } catch (caught) {
      setActionError(messageOf(caught));
    } finally {
      const live = await readLiveFor(key);
      setLive((previous) => applyLive(previous, live));
    }
  }, [key]);

  const cancelDownload = useCallback(async () => {
    if (!key) {
      return;
    }
    await DownloadService.cancelDownload(key);
    const live = await readLiveFor(key);
    setLive((previous) => applyLive(previous, live));
  }, [key]);

  const retryDownload = useCallback(async () => {
    if (!key) {
      return;
    }
    setActionError(null);
    await DownloadService.retryDownload(key);
    const live = await readLiveFor(key);
    setLive((previous) => applyLive(previous, live));
  }, [key]);

  const deleteDownload = useCallback(async () => {
    if (!key) {
      return;
    }
    setActionError(null);
    await DownloadService.deleteDownload(key);
    // A full reload rather than a progress refresh, because the *rows* changed
    // with the files: every track is streaming again, the folder key is gone and
    // the queue is empty. Re-reading live numbers alone would leave the screen
    // describing a download that no longer exists.
    await refresh();
  }, [key, refresh]);

  const current = loaded && loaded.key === key ? loaded : null;
  const tracks = current?.tracks ?? EMPTY_TRACKS;
  const progress = current?.progress ?? EMPTY_PROGRESS;

  const finishedCount = tracks.reduce(
    (total, track) => total + ((progress[track.id] ?? UNPLAYED).finished ? 1 : 0),
    0,
  );

  return {
    meta: current?.meta ?? null,
    tracks,
    progress,
    finishedCount,
    totalDurationSec: tracks.reduce((total, track) => total + track.durationSec, 0),
    stats: current?.stats ?? EMPTY_STATS,
    jobsByTrack: live?.jobsByTrack ?? EMPTY_JOBS,
    fromCache: current?.fromCache ?? false,
    // "Nothing for this key yet" *is* the loading condition — derived from the
    // load itself rather than tracked alongside it, so the two can never
    // disagree about whether the screen has something to draw. An empty local
    // read is not yet an answer: it stays loading until the source settles,
    // because "this device has no rows" is not "this collection has no audio".
    loading:
      key !== null &&
      (current === null || (current.tracks.length === 0 && !current.settled)),
    error: actionError ?? current?.error ?? null,
    download: live?.download ?? null,
    refresh,
    startDownload,
    cancelDownload,
    retryDownload,
    deleteDownload,
  };
}
