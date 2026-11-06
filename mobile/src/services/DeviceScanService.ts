import Constants, { ExecutionEnvironment } from "expo-constants";
import { getInfoAsync, StorageAccessFramework } from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import { Platform } from "react-native";

import type { AudioTags, EmbeddedPicture } from "@/lib/audioTags";
import { isAudioFileName } from "@/lib/audioFormats";
import {
  deriveFolderKey,
  deriveFolderKeyFromTreeUri,
  folderNameFromKey,
  safDocumentName,
  safTreeUriForDocument,
} from "@/lib/mediaFolders";
import { toEpochMillis, type DiscoveredFile } from "@/lib/scanPlan";
import { computeFileContentHash } from "@/services/ContentHashService";

/**
 * Device discovery. Two independent sources feed one list of candidates:
 *
 * - the Android media index, which answers "every audio file on this phone"
 *   without any broad-filesystem permission, and
 * - folders the user explicitly granted, which is the only way to reach files
 *   the index has not scanned and the only source that yields real folder names.
 *
 * Neither phase here writes anything. Enumeration is metadata only; identification
 * reads file bytes but only for the files a plan already decided need it.
 */

const PAGE_SIZE = 200;
/**
 * How many assets are resolved at once. A page can hold 200, and resolving a
 * `content://` asset costs a native round-trip, so the page is drained in small
 * slices rather than fired off in one unbounded `Promise.all`.
 */
const METADATA_BATCH = 8;
/**
 * Identification does a 1 MB read plus a SHA-256 per file. Three at a time keeps
 * a 300-file import moving without starving the UI thread on a mid-range device.
 */
const IDENTIFY_CONCURRENCY = 3;

/**
 * `unsupported-build` means the *installed binary* cannot ask for the permission
 * — Expo Go, or a development build predating the permission. It is not a
 * refusal by the user, and no retry or Settings trip will change it.
 */
export type ScanPermission = "granted" | "denied" | "unavailable" | "unsupported-build";

export type FolderGrant = {
  treeUri: string;
  folderKey: string;
  folderName: string;
};

export type IdentifiedFile = {
  file: DiscoveredFile;
  contentHash: string;
  fileSizeBytes: number;
  tags: AudioTags;
  /**
   * Cover art found in the same buffer the hash was computed from, so it costs
   * nothing here. Null when the file has none — or when its tag ran past the
   * 1 MB that was read, which `tagTruncated` distinguishes.
   */
  picture: EmbeddedPicture | null;
  /** True when the ID3 tag extended past the window, so `picture` proves nothing. */
  tagTruncated: boolean;
};

export type IdentifyOutcome = {
  identified: IdentifiedFile[];
  failed: { file: DiscoveredFile; reason: string }[];
};

/** Runs `worker` over `items` with at most `limit` in flight. */
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  let cursor = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
}

function pathFromUri(uri: string): string | null {
  if (!uri.startsWith("file://")) {
    return null;
  }
  try {
    return decodeURIComponent(uri.slice("file://".length));
  } catch {
    return uri.slice("file://".length);
  }
}

// --- Permissions ----------------------------------------------------------

/**
 * Expo Go ships a fixed AndroidManifest that deliberately strips every
 * `READ_MEDIA_*` permission with `tools:node="remove"` — it is not a gallery app
 * and will not be classified as one. `expo-media-library` asserts the permission
 * is *declared* before it will even ask the OS, so in Expo Go the call rejects
 * with a native exception instead of returning a denial.
 *
 * No app-config change can fix this: the manifest belongs to Expo Go's APK, not
 * to this project. Only a build we control can carry `READ_MEDIA_AUDIO`.
 *
 * Read per call rather than cached at module load — the check is a property
 * access, and a load-order dependency is not worth the saving.
 */
function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** True when the binary was asked for a permission its manifest does not declare. */
function isUndeclaredPermissionError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("is not declared in AndroidManifest");
}

/**
 * Whether this build can read the media index at all. Folder access is
 * unaffected — SAF hands out per-folder grants and needs no manifest permission,
 * so it keeps working in Expo Go.
 */
export function isDeviceScanSupported(): boolean {
  return Platform.OS === "android" && !isExpoGo();
}

/**
 * Only the audio media permission is requested. The package's config plugin is
 * deliberately not used because it also adds `WRITE_EXTERNAL_STORAGE` and
 * `READ_MEDIA_VISUAL_USER_SELECTED`, neither of which a reader has any use for.
 */
export async function requestAudioPermission(): Promise<ScanPermission> {
  if (Platform.OS !== "android") {
    return "unavailable";
  }
  if (isExpoGo()) {
    return "unsupported-build";
  }
  try {
    const current = await MediaLibrary.getPermissionsAsync(false, ["audio"]);
    if (current.granted) {
      return "granted";
    }
    if (!current.canAskAgain) {
      return "denied";
    }
    const requested = await MediaLibrary.requestPermissionsAsync(false, ["audio"]);
    return requested.granted ? "granted" : "denied";
  } catch (error) {
    // A development build made before the permission was declared fails exactly
    // as Expo Go does, and wants the same answer: rebuild.
    if (isUndeclaredPermissionError(error)) {
      return "unsupported-build";
    }
    throw error;
  }
}

export async function hasAudioPermission(): Promise<boolean> {
  if (!isDeviceScanSupported()) {
    return false;
  }
  try {
    const current = await MediaLibrary.getPermissionsAsync(false, ["audio"]);
    return current.granted;
  } catch (error) {
    if (isUndeclaredPermissionError(error)) {
      return false;
    }
    throw error;
  }
}

export type PermissionRefusal = { title: string; message: string };

/**
 * Turns a refusal into something the user can act on. Kept beside the diagnosis
 * so the wording cannot drift from the reason.
 */
export function describePermissionRefusal(permission: ScanPermission): PermissionRefusal | null {
  switch (permission) {
    case "unavailable":
      return {
        title: "Android only",
        message: "Device scanning is available on Android only. You can still pick a folder.",
      };
    case "unsupported-build":
      return {
        title: "Development build required",
        message:
          "Expo Go ships without the audio permission, so it cannot read the media index. Folder import works here — for a full device scan, build a development client with npm run build:dev.",
      };
    case "denied":
      return {
        title: "Audio access needed",
        message:
          "Pejvak needs permission to read audio files on this device. You can grant it in Settings.",
      };
    default:
      return null;
  }
}

// --- Media index ----------------------------------------------------------

/**
 * `Asset.uri` is a `file://` path on Android, in which case the folder is free.
 * When a provider hands back a `content://` URI instead, one metadata round-trip
 * buys the path — which is worth it, because the folder key is the whole basis
 * of folder play.
 */
async function assetToFile(asset: MediaLibrary.Asset): Promise<DiscoveredFile> {
  let path = pathFromUri(asset.uri);
  if (path === null) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      path = info.localUri ? pathFromUri(info.localUri) : null;
    } catch {
      path = null;
    }
  }

  const folderKey = deriveFolderKey(path);
  return {
    sourceId: asset.id,
    uri: asset.uri,
    path,
    fileName: asset.filename,
    // The media index reports no file size, so the rescan key leans on mtime.
    sizeBytes: null,
    modifiedAt: toEpochMillis(asset.modificationTime),
    durationSec: Math.max(0, Math.round(asset.duration ?? 0)),
    source: "mediastore",
    folderKey,
    folderName: folderKey === null ? null : folderNameFromKey(folderKey),
  };
}

/** Walks the whole media index, page by page. */
export async function enumerateDeviceAudio(
  onProgress?: (found: number, estimatedTotal: number) => void,
): Promise<DiscoveredFile[]> {
  const found: DiscoveredFile[] = [];
  let after: string | undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: "audio",
      first: PAGE_SIZE,
      ...(after === undefined ? {} : { after }),
    });

    for (let index = 0; index < page.assets.length; index += METADATA_BATCH) {
      const slice = page.assets.slice(index, index + METADATA_BATCH);
      const batch = await Promise.all(
        slice.map((asset) => assetToFile(asset).catch(() => null)),
      );
      for (const file of batch) {
        if (file) {
          found.push(file);
        }
      }
      onProgress?.(found.length, page.totalCount);
    }

    hasNextPage = page.hasNextPage && page.endCursor !== after;
    after = page.endCursor;
  }

  return found;
}

// --- Granted folders ------------------------------------------------------

/**
 * Asks for a directory and keeps the resulting tree URI. The grant is what
 * makes folder play possible for files the media index never saw, and it has to
 * be persisted (see the `folders` table) because it does not survive a relaunch
 * on its own.
 */
export async function requestFolderAccess(): Promise<FolderGrant | null> {
  if (Platform.OS !== "android") {
    return null;
  }
  const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }
  const folderKey = deriveFolderKeyFromTreeUri(permission.directoryUri) ?? "";
  return {
    treeUri: permission.directoryUri,
    folderKey,
    folderName: folderNameFromKey(folderKey),
  };
}

/**
 * Lists one SAF directory.
 *
 * This has to be `StorageAccessFramework.readDirectoryAsync`, not the
 * `readDirectoryAsync` imported from the module root. They are different
 * functions with the same name: the plain one only understands `file://` and
 * *throws* `FileSystemUnsupportedSchemeException` for a `content://` URI. The
 * walk below used to call it and swallow the throw as "an unreadable
 * subdirectory" — which is why choosing a folder full of audio found nothing at
 * all, with no error to explain it.
 */
async function listSafDirectory(directoryUri: string): Promise<string[]> {
  return StorageAccessFramework.readDirectoryAsync(directoryUri);
}

/**
 * Whether a SAF document URI can be listed, which is the only reliable way to
 * ask "is this a directory?".
 *
 * `getInfoAsync` cannot answer: it resolves a `content://` URI by opening a
 * stream, and an open stream means `exists: true, isDirectory: false` for a
 * folder exactly as for a file. Listing is decisive — a directory lists (an
 * empty one lists nothing) and a file throws — and it is one native call rather
 * than a stat plus a guess.
 *
 * Null means "not a directory we can read", which covers both a file and a
 * subfolder whose grant did not come with the parent's.
 */
async function listSafSubdirectory(uri: string): Promise<string[] | null> {
  const treeUri = safTreeUriForDocument(uri);
  if (treeUri === null) {
    return null;
  }
  try {
    return await listSafDirectory(treeUri);
  } catch {
    return null;
  }
}

/**
 * Walks one directory's children, recursing into subfolders.
 *
 * A name that ends in an audio extension is taken as a file without asking the
 * provider anything — one native call per audio file instead of two. Everything
 * else is probed as a directory, which is also what skips artwork and subtitles.
 */
async function walkSafChildren(
  children: string[],
  folderKey: string,
  out: DiscoveredFile[],
  onFound?: (found: number) => void,
): Promise<void> {
  for (const child of children) {
    const name = safDocumentName(child);
    if (name === null) {
      continue;
    }

    if (isAudioFileName(name)) {
      const info = await getInfoAsync(child).catch(() => null);
      if (!info || !info.exists) {
        continue;
      }
      out.push({
        sourceId: child,
        uri: child,
        // SAF gives no filesystem path; the folder key is carried explicitly instead.
        path: null,
        fileName: name,
        // `available()` on a document stream is the provider's own answer for
        // the size. Zero or a missing value is not a size — it is a provider
        // that would not say, and the identification pass will ask again.
        sizeBytes:
          typeof info.size === "number" && info.size > 0 ? info.size : null,
        modifiedAt: toEpochMillis(info.modificationTime),
        durationSec: 0,
        source: "saf",
        folderKey,
        folderName: folderNameFromKey(folderKey),
      });
      onFound?.(out.length);
      continue;
    }

    const grandChildren = await listSafSubdirectory(child);
    if (grandChildren === null) {
      continue;
    }
    await walkSafChildren(
      grandChildren,
      folderKey.length > 0 ? `${folderKey}/${name}` : name,
      out,
      onFound,
    );
  }
}

/**
 * Recursively lists the audio files inside a granted folder.
 *
 * The root is the one directory whose failure cannot be shrugged off: an
 * unreadable *subfolder* costs a branch, but an unreadable root means the answer
 * to "what is in this folder?" is unknown, and reporting that as "no audio files
 * found" would be a lie the listener has no way to act on. So the root read is
 * allowed to throw, and the import screen turns that into a message.
 *
 * A folder is walked without knowing how many files it holds, so progress is a
 * running count rather than a fraction — the screen says how much it has found
 * instead of how far along it is.
 */
export async function enumerateFolder(
  grant: FolderGrant,
  onFound?: (found: number) => void,
): Promise<DiscoveredFile[]> {
  let children: string[];
  try {
    children = await listSafDirectory(grant.treeUri);
  } catch {
    throw new Error(
      "This folder could not be read. Choose it again — Android grants access to the folder you pick, and a folder that lives in a cloud provider has to be downloaded first.",
    );
  }

  const found: DiscoveredFile[] = [];
  await walkSafChildren(children, grant.folderKey, found, onFound);
  return found;
}

// --- Identification -------------------------------------------------------

/**
 * Reads the files a plan marked as needing identification and returns their
 * content hashes and tags. Failures are collected per file rather than thrown:
 * one unreadable file must not abort a 300-file import.
 */
export async function identifyFiles(
  files: DiscoveredFile[],
  options: {
    onProgress?: (done: number, total: number) => void;
    isCancelled?: () => boolean;
  } = {},
): Promise<IdentifyOutcome> {
  const identified: IdentifiedFile[] = [];
  const failed: { file: DiscoveredFile; reason: string }[] = [];
  let done = 0;

  await runPool(files, IDENTIFY_CONCURRENCY, async (file) => {
    if (options.isCancelled?.()) {
      return;
    }
    try {
      let sizeBytes = file.sizeBytes;
      if (sizeBytes === null) {
        const info = await getInfoAsync(file.uri).catch(() => null);
        sizeBytes = info && info.exists ? info.size : null;
      }

      const result = await computeFileContentHash(file.uri, sizeBytes ?? undefined);
      identified.push({
        file,
        contentHash: result.contentHash,
        fileSizeBytes: result.fileSizeBytes,
        tags: result.tags,
        picture: result.bundle.picture,
        tagTruncated: result.bundle.truncated,
      });
    } catch (error) {
      failed.push({
        file,
        reason: error instanceof Error ? error.message : "unreadable",
      });
    }
    done += 1;
    options.onProgress?.(done, files.length);
  });

  return { identified, failed };
}
