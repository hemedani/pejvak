import { resolve, sep } from "node:path";

/**
 * Where hosted channel media lives, and how its durable URL is formed.
 *
 * This is the transport the plan left open (§5) and prompt D14 resolved: uploads
 * are a normal Lesan act (`instance(FormData)`), the bytes land under
 * `./uploads` (git-ignored), and `runServer({ staticPath: ["/uploads"] })` serves
 * them back for streaming. This module is the one place that knows the layout,
 * so an act never hand-builds a filesystem path or a URL string.
 *
 * The **durable** address is the served path `/uploads/<mediaPath>`. It is
 * prefixed with `MEDIA_BASE_URL` when that env is set (production, so the stored
 * `audioUrl` is an absolute URL the device streams directly) and left
 * root-relative otherwise (development/hurl, so the client joins it to its own
 * configured server origin). Either way the host is never baked into a row, so
 * moving the server between domains does not rot stored URLs — the contrast with
 * `onlineCollection`, whose URLs rot because a *third party* signs them with an
 * expiry.
 */

/** Root of the upload tree, as `mod.ts` serves it at `/uploads`. */
export const UPLOAD_ROOT = "./uploads";

/** The two kinds of media an upload act accepts. */
export type MediaKind = "audio" | "image";

/** Sub-directory under the upload root for each kind. */
const KIND_DIR: Record<MediaKind, string> = {
  audio: "channel/audio",
  image: "channel/image",
};

/**
 * Creates the directory for `kind` if it is missing and returns it, relative to
 * `./uploads` (e.g. `channel/audio`). Idempotent — `mkdir(recursive)` on an
 * existing tree is a no-op — so a fresh deployment needs no pre-created folder.
 */
export const ensureMediaDir = async (kind: MediaKind): Promise<string> => {
  const relative = KIND_DIR[kind];
  await Deno.mkdir(`${UPLOAD_ROOT}/${relative}`, { recursive: true });
  return relative;
};

/**
 * A filesystem-safe leaf name from the client's original filename.
 *
 * The name is only ever used after a generated id prefix, but a path separator
 * smuggled in through a filename would still be a traversal attempt, so every
 * separator is flattened and the result is capped. An empty name falls back to
 * a constant.
 */
export const sanitizeName = (name: string | undefined): string => {
  const base = (name ?? "upload").replace(/[/\\]/g, "_").replace(/\0/g, "");
  const trimmed = base.trim();
  return trimmed.length > 0 ? trimmed.slice(-80) : "upload";
};

/** The extension of a filename (`.mp3`), or an empty string. */
export const extensionOf = (name: string | undefined): string => {
  const dot = (name ?? "").lastIndexOf(".");
  if (dot <= 0 || dot === (name ?? "").length - 1) return "";
  return (name as string).slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, "");
};

/** What a stored upload hands back: enough to publish a row and to clean it up. */
export type StoredMedia = {
  audioUrl: string;
  mediaPath: string;
  mimeType: string;
  fileSizeBytes: number;
};

/**
 * The minimal shape `storeUploadFile` needs from an upload part.
 *
 * A `File` satisfies it; a test can supply a stream that fails mid-read without
 * constructing a real multipart body. Keeping the signature this narrow is what
 * lets the abort path be tested directly.
 */
export type UploadSource = {
  name?: string;
  type?: string;
  size: number;
  stream: () => ReadableStream<Uint8Array>;
};

/**
 * Streams `file` into the upload tree **atomically** and returns the durable
 * descriptors.
 *
 * The leaf name is a generated ObjectId prefix plus the sanitised original
 * (extension preserved), so two uploads never collide and a filename cannot
 * carry a path separator. The bytes are streamed, not buffered: a multi-megabyte
 * episode must not be loaded into memory, which is the whole reason the upload
 * is a `multipart` act and not a base64 JSON body (prompt D14).
 *
 * Bytes land in `<mediaPath>.part` first and are renamed into place only once
 * the stream has ended **and** the byte count equals `file.size`. A client that
 * aborts mid-stream (OkHttp timeout, network drop, process kill) makes
 * `file.stream()` reject; the partial leaf is then unlinked, so an aborted
 * upload leaves nothing under `./uploads` (prompt D18). A crash between write
 * and rename leaves only a `.part`, which the deferred sweep reclaims.
 *
 * This does **not** check the storage quota — the caller does that before
 * invoking it, so a refusal never writes bytes it would then have to remove.
 */
export const storeUploadFile = async (
  kind: MediaKind,
  file: UploadSource,
  id: string,
): Promise<StoredMedia> => {
  const dir = await ensureMediaDir(kind);
  const fileName = `${id}-${sanitizeName(file.name)}`;
  const mediaPath = `${dir}/${fileName}`;
  const finalPath = `${UPLOAD_ROOT}/${mediaPath}`;
  const partPath = `${finalPath}.part`;

  let written = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      written += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });

  const handle = await Deno.open(partPath, {
    create: true,
    write: true,
    truncate: true,
  });

  try {
    await file.stream().pipeThrough(counter).pipeTo(handle.writable);

    if (written !== file.size) {
      throw new Error(
        `Upload incomplete: received ${written} of ${file.size} bytes`,
      );
    }

    await Deno.rename(partPath, finalPath);
  } catch (error) {
    // `pipeTo` closes the file on completion, but an aborted source may leave
    // the destination open; closing twice is harmless here.
    try {
      await handle.close();
    } catch {
      // The handle was already closed by the pipe.
    }
    await Deno.remove(partPath).catch(() => {
      // Nothing to reclaim if the stream failed before the file existed.
    });
    throw error;
  }

  return {
    audioUrl: durableUrl(mediaPath),
    mediaPath,
    mimeType: file.type ?? "",
    fileSizeBytes: written,
  };
};

/** One file found under `./uploads`, with the data a sweep needs to decide. */
export type StoredFile = {
  mediaPath: string;
  modifiedAtMs: number;
};

/**
 * Walks the upload tree and returns every stored file (relative to
 * `./uploads`). A missing root is an empty tree, not an error — a fresh
 * deployment has no files until the first upload.
 */
export const listStoredFiles = async (): Promise<StoredFile[]> => {
  const root = resolve(UPLOAD_ROOT);
  const files: StoredFile[] = [];

  const walk = async (dir: string): Promise<void> => {
    let entries: Deno.DirEntry[];
    try {
      entries = [];
      for await (const entry of Deno.readDir(dir)) entries.push(entry);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return;
      throw error;
    }

    for (const entry of entries) {
      const absolute = resolve(dir, entry.name);
      if (entry.isDirectory) {
        await walk(absolute);
      } else if (entry.isFile) {
        const mediaPath = absolute.slice(root.length + 1).replaceAll(sep, "/");
        const info = await Deno.stat(absolute);
        files.push({
          mediaPath,
          modifiedAtMs: info.mtime?.getTime() ?? 0,
        });
      }
    }
  };

  await walk(root);
  return files;
};

/** Files a sweep may delete, split by why they are reclaimable. */
export type ReclaimablePaths = {
  /** Orphaned temp leaves from an aborted or crashed upload. */
  parts: string[];
  /** Completed files with no `channelAudio.mediaPath` pointing at them. */
  orphans: string[];
};

/**
 * Decides which stored files are safe to reclaim.
 *
 * **Age is the safety rail.** A `.part` file is being written right now; a
 * completed file with no row is the normal window between `uploadChannelMedia`
 * and `publishChannelAudio`. Deleting either before `staleAfterMs` would race a
 * live upload and break a publish, so the sweep only touches old files. The
 * threshold is a parameter rather than a constant so the deferred job and its
 * tests agree, and so an operator can tune it.
 */
export const selectReclaimablePaths = (
  files: readonly StoredFile[],
  referenced: ReadonlySet<string>,
  nowMs: number,
  staleAfterMs: number,
): ReclaimablePaths => {
  const parts: string[] = [];
  const orphans: string[] = [];

  for (const file of files) {
    if (nowMs - file.modifiedAtMs < staleAfterMs) continue;

    // A referenced file is authoritative, even if its name ends in `.part`: the
    // suffix is a naming convention, not proof the file is unfinished.
    if (referenced.has(file.mediaPath)) continue;

    if (file.mediaPath.endsWith(".part")) {
      parts.push(file.mediaPath);
    } else {
      orphans.push(file.mediaPath);
    }
  }

  return { parts, orphans };
};

/**
 * The durable URL to store for `mediaPath` (relative to `./uploads`).
 *
 * Absolute when `MEDIA_BASE_URL` is configured, root-relative otherwise. Never
 * includes the on-disk `./uploads` prefix — only the served `/uploads/...`.
 */
export const durableUrl = (mediaPath: string): string => {
  const base = (Deno.env.get("MEDIA_BASE_URL") ?? "").replace(/\/+$/, "");
  return `${base}/uploads/${mediaPath}`;
};

/**
 * Absolute path for a stored `mediaPath`, or `null` when it escapes the tree.
 *
 * `mediaPath` is written by this server, so the guard should never fire — but a
 * delete that trusts a stored string is one bad write away from unlinking
 * something else on the host, and the check costs two lines. This is the same
 * containment the sibling `nejat` project applies to its upload tree.
 */
const resolveInsideUploads = (mediaPath: string): string | null => {
  const root = resolve(UPLOAD_ROOT);
  const absolute = resolve(root, mediaPath);
  return absolute === root || absolute.startsWith(root + sep) ? absolute : null;
};

/**
 * Unlink the bytes behind `mediaPaths`, reporting how many files actually went.
 *
 * Best-effort on purpose: removing the DB row is the authoritative half of a
 * delete and must not be undone by a file that is already missing (a sweep may
 * have raced it, or a dev checkout never had the bytes). A `NotFound` is silent;
 * anything else is logged, because that is a leak with a name attached.
 *
 * The plan defers byte cleanup to a scheduled sweep; until that exists, the
 * delete acts call this inline so a takedown on a `local` store reclaims space.
 * It is cheap and never blocks on a remote object store here.
 */
export const removeStoredBytes = async (
  mediaPaths: readonly (string | undefined | null)[],
): Promise<number> => {
  let removed = 0;

  for (const mediaPath of mediaPaths) {
    const relative = typeof mediaPath === "string" ? mediaPath.trim() : "";
    if (!relative) continue;

    const absolute = resolveInsideUploads(relative);
    if (!absolute) {
      console.warn(
        `refusing to unlink a path outside ${UPLOAD_ROOT}: ${relative}`,
      );
      continue;
    }

    try {
      await Deno.remove(absolute);
      removed++;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.warn(`could not unlink ${absolute}:`, error);
      }
    }
  }

  return removed;
};
