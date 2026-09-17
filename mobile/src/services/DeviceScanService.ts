import Constants, { ExecutionEnvironment } from "expo-constants";
import { getInfoAsync, readDirectoryAsync, StorageAccessFramework } from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import { Platform } from "react-native";

import type { AudioTags } from "@/lib/audioTags";
import { isAudioFileName } from "@/lib/audioFormats";
import {
  deriveFolderKey,
  deriveFolderKeyFromTreeUri,
  folderNameFromKey,
  safDocumentName,
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

async function walkFolder(
  directoryUri: string,
  folderKey: string,
  out: DiscoveredFile[],
): Promise<void> {
  let children: string[];
  try {
    children = await readDirectoryAsync(directoryUri);
  } catch {
    // A revoked or unreadable subdirectory must not abort the whole walk.
    return;
  }

  for (const child of children) {
    const name = safDocumentName(child);
    if (name === null) {
      continue;
    }

    const info = await getInfoAsync(child).catch(() => null);
    if (!info || !info.exists) {
      continue;
    }

    if (info.isDirectory) {
      await walkFolder(child, folderKey.length > 0 ? `${folderKey}/${name}` : name, out);
      continue;
    }

    if (!isAudioFileName(name)) {
      continue;
    }

    out.push({
      sourceId: child,
      uri: child,
      // SAF gives no filesystem path; the folder key is carried explicitly instead.
      path: null,
      fileName: name,
      sizeBytes: info.size ?? null,
      modifiedAt: toEpochMillis(info.modificationTime),
      durationSec: 0,
      source: "saf",
      folderKey,
      folderName: folderNameFromKey(folderKey),
    });
  }
}

/** Recursively lists the audio files inside a granted folder. */
export async function enumerateFolder(grant: FolderGrant): Promise<DiscoveredFile[]> {
  const found: DiscoveredFile[] = [];
  await walkFolder(grant.treeUri, grant.folderKey, found);
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
