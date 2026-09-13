import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import type { DocumentPickerAsset } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import type { LocalTrack } from "@/lib/db/types";
import { computeFileContentHash } from "@/services/ContentHashService";
import { LocalDBService } from "@/services/LocalDBService";
import { syncPending } from "@/services/SyncService";

function safeBaseName(name: string): string {
  return name.replace(/[/\\]/g, "_").trim() || "track";
}

/**
 * Copies a picked asset into app-owned storage and registers it.
 *
 * On Android the picker returns a `content://` URI (temporary grant); we copy
 * the bytes into `Paths.document` so the track has a persistent, always-readable
 * `file://` URI for hashing and playback. On iOS the picker already copies to
 * its cache, which we likewise move into our document directory.
 */
async function importAsset(asset: DocumentPickerAsset): Promise<LocalTrack> {
  const source = new File(asset.uri);
  const storedName = `pejvak-${Crypto.randomUUID()}-${safeBaseName(asset.name)}`;
  const stored = new File(Paths.document, storedName);
  await source.copy(stored);

  const { contentHash, fileSizeBytes } = await computeFileContentHash(stored.uri);
  const title = asset.name.replace(/\.[^.]+$/, "") || asset.name;

  return LocalDBService.insertTrack({
    contentHash,
    title,
    fileName: asset.name,
    fileUri: stored.uri,
    durationSec: 0,
    fileSizeBytes: asset.size ?? fileSizeBytes,
    mimeType: asset.mimeType ?? null,
    isAudiobook: true,
  });
}

/** Lets the user pick one or more audio files and import them all. */
export async function importAudioFiles(): Promise<LocalTrack[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "audio/*",
    // Android: keep the content:// URI (the copy-to-cache path becomes
    // unreadable through expo-file-system inside Expo Go). iOS: let the picker
    // stage the file, then move it ourselves.
    copyToCacheDirectory: Platform.OS !== "android",
    multiple: true,
  });

  if (result.canceled || result.assets.length === 0) {
    return [];
  }

  const imported: LocalTrack[] = [];
  for (const asset of result.assets) {
    try {
      imported.push(await importAsset(asset));
    } catch {
      // Skip a file that fails to copy/hash; keep importing the rest.
    }
  }

  if (imported.length > 0) {
    void syncPending().catch(() => undefined);
  }
  return imported;
}

/** Single-file import; returns the first track when more than one is picked. */
export async function importAudioFile(): Promise<LocalTrack | null> {
  const [track] = await importAudioFiles();
  return track ?? null;
}
