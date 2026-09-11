import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
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
 * Lets the user pick an audio file and imports it into app-owned storage.
 *
 * On Android the picker returns a `content://` URI (temporary grant); we copy
 * the bytes into `Paths.document` so the track has a persistent, always-readable
 * `file://` URI for hashing and playback. On iOS the picker already copies to
 * its cache, which we likewise move into our document directory.
 */
export async function importAudioFile(): Promise<LocalTrack | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "audio/*",
    // Android: keep the content:// URI (the copy-to-cache path becomes
    // unreadable through expo-file-system inside Expo Go). iOS: let the picker
    // stage the file, then move it ourselves.
    copyToCacheDirectory: Platform.OS !== "android",
    multiple: false,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const source = new File(asset.uri);
  const storedName = `pejvak-${Crypto.randomUUID()}-${safeBaseName(asset.name)}`;
  const stored = new File(Paths.document, storedName);
  await source.copy(stored);

  const { contentHash, fileSizeBytes } = await computeFileContentHash(stored.uri);
  const title = asset.name.replace(/\.[^.]+$/, "") || asset.name;

  const track = await LocalDBService.insertTrack({
    contentHash,
    title,
    fileName: asset.name,
    fileUri: stored.uri,
    durationSec: 0,
    fileSizeBytes: asset.size ?? fileSizeBytes,
    mimeType: asset.mimeType ?? null,
    isAudiobook: true,
  });

  void syncPending().catch(() => undefined);
  return track;
}
