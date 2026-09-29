/**
 * Downloading a collection onto the device.
 *
 * The promise this module makes is narrow and concrete: after it runs, the
 * course is a folder of numbered files in app storage, every track's row points
 * at its own copy, and the collection appears in the Library's Folders view like
 * anything the listener imported themselves. Playing it afterwards touches no
 * network at all.
 *
 * Three decisions shape it:
 *
 *   1. **The queue is rows, not memory.** A course is tens of files: the
 *      listener will background the app, lose signal, or kill it outright. One
 *      `download_jobs` row per track means progress is a `COUNT`, an interrupted
 *      run resumes from the first row that is not done, and nothing has to be
 *      held in JS between sessions.
 *   2. **One at a time.** Sequential by choice, not by omission. A phone on a
 *      slow connection downloading twenty files in parallel finishes the *last*
 *      one no sooner and makes the first unusable meanwhile; sequential means
 *      track one is playable while track twenty is still arriving.
 *   3. **A failed file does not fail the course.** Each job retries on its own,
 *      and one episode that will not download leaves the other twenty-eight
 *      intact — the collection is marked failed so the listener can see what is
 *      missing, never rolled back.
 */

import { Directory, File, Paths } from "expo-file-system";

import { inspectAudioFile } from "@/services/AudioInspectionService";
import { LocalDBService, type DownloadProgress } from "@/services/LocalDBService";
import { resolveStreamUrls } from "@/services/OnlineCatalogService";
import type { CreateDownloadJobInput, LocalDownloadJob, LocalOnlineCollection } from "@/lib/db/types";
import { collectionFolderKey, collectionRelativePath, trackFileName } from "@/lib/online";

/** Attempts per file before it is written off. */
const MAX_ATTEMPTS = 3;
/** How long to wait before retrying a file, by attempt number. */
const BACKOFF_MS = [2_000, 8_000];
/** Progress updates are throttled to this, so the UI is not redrawn per chunk. */
const PROGRESS_THROTTLE_MS = 250;

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Subscribe to progress. Returns the unsubscribe function.
 *
 * A tiny emitter rather than a store: the numbers already live in the database,
 * and duplicating them into Zustand would be a second source of truth for
 * something the next query can answer exactly.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

let lastEmitAt = 0;

/** Emit at most every `PROGRESS_THROTTLE_MS`, but always at the end of a job. */
function emitProgress(force = false): void {
  const now = Date.now();
  if (!force && now - lastEmitAt < PROGRESS_THROTTLE_MS) {
    return;
  }
  lastEmitAt = now;
  emit();
}

let running = false;
let inFlight: AbortController | null = null;
/** Collections the listener stopped, so the worker does not pick them back up. */
const cancelled = new Set<string>();

/** Callers waiting for the worker to stop. */
let idleWaiters: (() => void)[] = [];

function notifyIdle(): void {
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const resolve of waiters) {
    resolve();
  }
}

/**
 * Resolves once nothing is being written and the queue loop has stopped.
 *
 * Aborting is not the same as stopping: `inFlight.abort()` asks the current file
 * to give up, but the promise it is awaited on has not settled yet, so code that
 * ran straight on could still be overtaken by a `finishTrack` writing a row
 * afterwards. Anything that has to happen strictly *after* the worker is done
 * with a collection therefore waits on this rather than on the abort.
 *
 * The signal is the loop's own `finally`, so this resolves exactly when no
 * further write can come from the queue.
 */
function whenIdle(): Promise<void> {
  if (!running) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    idleWaiters.push(resolve);
  });
}

export type DownloadSummary = DownloadProgress & {
  collectionKey: string;
  running: boolean;
};

export async function getSummary(collectionKey: string): Promise<DownloadSummary> {
  const progress = await LocalDBService.getDownloadProgress(collectionKey);
  return { collectionKey, ...progress, running };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The on-disk folder for a collection: `Online/<source>/<title>`. */
function collectionDirectory(meta: LocalOnlineCollection): Directory {
  const relative = collectionRelativePath(meta.sourceId, meta.title, meta.externalId);
  return new Directory(Paths.document, ...relative.split("/"));
}

async function ensureDirectory(directory: Directory): Promise<void> {
  if (directory.exists) {
    return;
  }
  directory.create({ intermediates: true, idempotent: true });
}

/**
 * Queue a collection and start downloading it.
 *
 * The stream URLs are re-resolved first, because the ones on the rows were
 * signed when the collection was last opened and the source's signatures expire.
 * A course saved today and downloaded next month would otherwise fail on every
 * file with a message about the network, which is not what went wrong.
 *
 * Tracks already on the device are queued as `done` rather than skipped: the
 * progress the listener sees is "7 of 29" for the collection, not "0 of 22"
 * for the remainder, and a re-tap after an interruption neither re-downloads
 * what is already there nor reports a total that does not match the course.
 */
export async function startDownload(collectionKey: string): Promise<void> {
  const meta = await LocalDBService.getOnlineCollection(collectionKey);
  if (!meta) {
    throw new Error("Save this collection before downloading it.");
  }
  if (meta.downloadState === "downloading") {
    return;
  }
  const tracks = await LocalDBService.getTracksByCollection(collectionKey);
  if (tracks.length === 0) {
    throw new Error("There is nothing to download in this collection yet.");
  }

  const fresh = await resolveStreamUrls(collectionKey);
  const directory = collectionDirectory(meta);
  await ensureDirectory(directory);

  // No folder key is set here: a track only joins the Library's folder view
  // once its bytes are actually on the device, and `finishTrack` is what does
  // that — per file, so an interrupted course shows the lectures it did get
  // rather than appearing as an empty folder.
  const inputs: CreateDownloadJobInput[] = [];
  const alreadyDownloaded: string[] = [];

  for (const track of tracks) {
    const remote = track.externalId ? fresh.get(track.externalId) : undefined;
    const url = remote?.streamUrl ?? track.streamUrl;
    if (!url) {
      continue;
    }
    const orderIndex = track.trackNumber ?? inputs.length + 1;
    const title = remote?.title ?? track.title;
    const destination = new File(directory, trackFileName(orderIndex, title, url));
    inputs.push({
      collectionKey,
      trackId: track.id,
      externalId: track.externalId ?? track.id,
      title,
      orderIndex,
      url,
      destPath: destination.uri,
    });
    if (track.downloadedAt !== null && track.fileUri === destination.uri) {
      alreadyDownloaded.push(track.id);
    }
  }

  if (inputs.length === 0) {
    throw new Error("This collection has no playable audio to download.");
  }

  cancelled.delete(collectionKey);
  const jobs = await LocalDBService.replaceDownloadJobs(inputs);
  for (const job of jobs) {
    if (alreadyDownloaded.includes(job.trackId)) {
      await LocalDBService.setDownloadJobState(job.id, "done");
    }
  }
  await LocalDBService.setOnlineCollectionDownloadState(collectionKey, "downloading");
  void pump();
}

/**
 * Stop a collection's download.
 *
 * The finished files stay on the device and stay pointed at by their rows —
 * cancelling is "stop spending my data", not "undo what has been done". Only
 * the jobs that had not finished are marked cancelled, which is what lets a
 * later resume pick up exactly where this left off.
 */
export async function cancelDownload(collectionKey: string): Promise<void> {
  cancelled.add(collectionKey);
  inFlight?.abort();
  inFlight = null;
  await LocalDBService.cancelDownloadJobs(collectionKey);
  await LocalDBService.setOnlineCollectionDownloadState(collectionKey, "cancelled");
  emitProgress(true);
}

/** Re-queue the files that failed and try again. */
export async function retryDownload(collectionKey: string): Promise<void> {
  const jobs = await LocalDBService.getDownloadJobs(collectionKey);
  let requeued = false;
  for (const job of jobs) {
    if (job.state === "failed" || job.state === "cancelled") {
      await LocalDBService.setDownloadJobState(job.id, "queued");
      requeued = true;
    }
  }
  if (!requeued) {
    return;
  }
  cancelled.delete(collectionKey);
  await LocalDBService.setOnlineCollectionDownloadState(collectionKey, "downloading");
  void pump();
}

/**
 * Delete a collection's downloaded audio, keeping everything else about it.
 *
 * The counterpart to `cancelDownload`, which is explicitly *not* undo: stopping
 * keeps what arrived. This is the only verb that gives the space back, and it is
 * the reason the feature is usable past the first course.
 *
 * Three things are deliberate.
 *
 *   1. **The rows stay.** They are what history, statistics, annotations and
 *      resume positions hang off, and downloading never changed a row's identity
 *      (`content_hash` is the item's id on its source), so a course finished last
 *      year keeps its finished count after the audio is gone. The tracks revert
 *      to streaming: the row keeps both halves of its story, and only the half
 *      that says *where the bytes are* is rewound.
 *   2. **The files are found from the rows, not from the title.** The folder is
 *      named after the collection's title, and a title can be edited upstream
 *      between the download and the delete. `download_path` is the record of
 *      where each file was actually put, so it is what gets deleted — and it has
 *      to be read before the revert, which is what clears it.
 *   3. **The worker is stopped and waited for before anything is removed.** A
 *      file already in flight would otherwise finish writing into a directory
 *      being deleted and re-mark a row that has just been reverted.
 *
 * Deleting is neither reversible nor resumable — the queue rows go with the
 * files, so downloading again starts from the first track. That is what
 * deleting rather than cancelling was a request for.
 */
export async function deleteDownload(collectionKey: string): Promise<void> {
  const meta = await LocalDBService.getOnlineCollection(collectionKey);
  if (!meta) {
    return;
  }

  // Stopping the worker is what lets the loop finish: it re-reads the
  // collection each pass and sees it cancelled. Nothing is removed until it has.
  cancelled.add(collectionKey);
  inFlight?.abort();
  inFlight = null;
  await whenIdle();

  const paths = await LocalDBService.getDownloadedTrackPaths(collectionKey);

  await LocalDBService.forgetDownloadedTracks(collectionKey);
  await LocalDBService.deleteDownloadJobs(collectionKey);

  for (const path of paths) {
    removeFile(path);
  }
  removeDirectory(collectionDirectory(meta));

  await LocalDBService.setOnlineCollectionDownloadState(collectionKey, "none");
  emitProgress(true);
}

/**
 * Remove one file, if it is there.
 *
 * `delete()` throws on a missing file, and a file that is already gone is the
 * outcome this wants rather than an error to report: a job interrupted between
 * writing the row and writing the file, or a file the system has already
 * reclaimed, must not stop the rest of the collection being cleaned up.
 */
function removeFile(path: string): void {
  try {
    const file = new File(path);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Gone either way, which is the point.
  }
}

/**
 * Remove a collection's folder, if it is one the app created.
 *
 * `Directory.delete()` is recursive, and the path is derived from a title the
 * source controls, so the deletion is confined to a directory strictly *below*
 * the app's own document directory — the document directory itself is refused.
 * The cost of being wrong here is every download the listener has.
 */
function removeDirectory(directory: Directory): void {
  try {
    if (!directory.exists) {
      return;
    }
    const root = Paths.document.uri.replace(/\/+$/, "");
    const target = directory.uri.replace(/\/+$/, "");
    if (target === root || !target.startsWith(`${root}/`)) {
      return;
    }
    directory.delete();
  } catch {
    // A folder that will not delete is not a reason to fail the delete.
  }
}

/**
 * Downloads left in flight by a kill.
 *
 * `downloading` is a state a row can be left in with no process behind it, so
 * this is what turns "the app died at 12 of 29" back into a running queue. Safe
 * to call on every launch: with nothing to resume it reads one indexed column
 * and returns.
 */
export async function resumeInterruptedDownloads(): Promise<void> {
  const pending = await LocalDBService.getDownloadingOnlineCollections();
  if (pending.length === 0) {
    return;
  }
  void pump();
}

/**
 * The worker.
 *
 * One collection at a time and one file at a time, driven entirely from the job
 * rows — so a kill mid-file costs that file and nothing else, and the loop has
 * no state that a cold start would have to reconstruct.
 */
async function pump(): Promise<void> {
  if (running) {
    return;
  }
  running = true;
  emitProgress(true);
  try {
    for (;;) {
      const collections = await LocalDBService.getDownloadingOnlineCollections();
      if (collections.length === 0) {
        break;
      }
      const collection = collections[0];
      if (cancelled.has(collection.key)) {
        await LocalDBService.setOnlineCollectionDownloadState(collection.key, "cancelled");
        continue;
      }

      const job = await LocalDBService.getNextDownloadJob(collection.key);
      if (!job) {
        await finalizeCollection(collection.key);
        continue;
      }

      await runJob(job);
      emitProgress(true);
    }
  } finally {
    running = false;
    emitProgress(true);
    notifyIdle();
  }
}

/**
 * Decide how a collection's download ended, once its queue is empty.
 *
 * `failed` covers both "some files did not arrive" and "the queue drained
 * without finishing everything" — from the listener's side those are the same
 * fact (the course is incomplete) and both are fixed by the same button.
 */
async function finalizeCollection(collectionKey: string): Promise<void> {
  const progress = await LocalDBService.getDownloadProgress(collectionKey);
  // No rows at all is not "nothing left to fetch". A queue is only ever created
  // with at least one job in it, so an empty one means the rows were removed
  // underneath the worker: the listener deleted the download while it ran, or
  // the process died between dropping the queue and recording the state. The
  // arithmetic below would call that a complete download — 0 done of 0 queued is
  // not *incomplete* — which is the one thing it certainly is not.
  //
  // The state still has to be *written*, to `none` rather than by returning
  // early: the worker stops when the collection leaves `downloading`, so
  // returning here would spin this loop on the same row forever.
  if (progress.total === 0) {
    await LocalDBService.setOnlineCollectionDownloadState(collectionKey, "none");
    return;
  }
  const incomplete = progress.failed > 0 || progress.done < progress.total;
  await LocalDBService.setOnlineCollectionDownloadState(
    collectionKey,
    incomplete ? "failed" : "complete",
  );
}

/**
 * Download one file, retrying a bounded number of times.
 *
 * The `AbortController` is module-scoped so a cancel from the UI reaches the
 * native download rather than waiting for the current file to finish — the whole
 * point of cancelling is to stop now.
 */
async function runJob(job: LocalDownloadJob): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (cancelled.has(job.collectionKey)) {
      await LocalDBService.setDownloadJobState(job.id, "cancelled");
      return;
    }

    await LocalDBService.setDownloadJobState(job.id, "running");
    const controller = new AbortController();
    inFlight = controller;

    try {
      const destination = new File(job.destPath);
      const downloaded = await File.downloadFileAsync(job.url, destination, {
        idempotent: true,
        signal: controller.signal,
        onProgress: ({ bytesWritten, totalBytes }) => {
          void LocalDBService.updateDownloadJobProgress(
            job.id,
            bytesWritten,
            totalBytes > 0 ? totalBytes : 0,
          );
          emitProgress();
        },
      });
      await finishTrack(job, downloaded);
      await LocalDBService.setDownloadJobState(job.id, "done");
      return;
    } catch (error) {
      if (cancelled.has(job.collectionKey)) {
        await LocalDBService.setDownloadJobState(job.id, "cancelled");
        return;
      }
      await LocalDBService.incrementDownloadJobAttempts(job.id);
      if (attempt === MAX_ATTEMPTS) {
        await LocalDBService.setDownloadJobState(job.id, "failed", messageOf(error));
        return;
      }
      await delay(BACKOFF_MS[attempt - 1] ?? 8_000);
    } finally {
      inFlight = null;
    }
  }
}

/**
 * Hand a downloaded file over to the library.
 *
 * The real duration is read out of the file here rather than left at zero: the
 * source never reports one, and every resume position in the app is computed
 * from it — a course of zero-length tracks would restart from the beginning
 * forever. A file whose header cannot be parsed keeps a zero rather than failing
 * the download; the player writes the true figure back the first time it opens
 * the track.
 */
async function finishTrack(job: LocalDownloadJob, downloaded: File): Promise<void> {
  const meta = await LocalDBService.getOnlineCollection(job.collectionKey);
  if (!meta) {
    throw new Error("The collection was removed while it was downloading.");
  }
  const fileSizeBytes = downloaded.size;

  let durationSec = 0;
  try {
    const inspection = await inspectAudioFile(downloaded.uri, {
      fileName: downloaded.name,
      fileSizeBytes,
    });
    durationSec = inspection.info.durationSec ?? 0;
  } catch {
    // A container we cannot read is still a playable file.
  }

  await LocalDBService.markTrackDownloaded({
    id: job.trackId,
    fileUri: downloaded.uri,
    downloadPath: job.destPath,
    fileSizeBytes,
    durationSec,
    folderKey: collectionFolderKey(meta.sourceId, meta.externalId),
    folderName: meta.title,
    trackNumber: job.orderIndex,
  });
}

/**
 * Test-only: clears the worker's own state.
 *
 * `running` and `inFlight` outlive a screen on purpose, which also means they
 * outlive a test; without this a case inherits the previous case's worker and
 * asserts against a queue it never started.
 */
export function __resetForTests(): void {
  running = false;
  inFlight = null;
  cancelled.clear();
  listeners.clear();
  lastEmitAt = 0;
}
