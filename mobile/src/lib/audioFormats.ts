/**
 * Which files a device scan should even consider.
 *
 * The Android media index is already filtered to audio, but a granted folder is
 * not — it can contain artwork, PDFs and subtitle files alongside the audio, and
 * a scan that reads those would waste a megabyte and a SHA-256 on each one.
 */

/** Extensions worth importing. `.m4b` is the audiobook-specific MP4 container. */
export const AUDIO_EXTENSIONS: readonly string[] = [
  "mp3",
  "m4a",
  "m4b",
  "m4p",
  "aac",
  "ogg",
  "oga",
  "opus",
  "flac",
  "wav",
  "wave",
  "aif",
  "aiff",
  "wma",
  "mp4",
  "mka",
  "amr",
  "3gp",
];

const AUDIO_EXTENSION_SET = new Set(AUDIO_EXTENSIONS);

/** Lowercased extension without the dot, or null when there is none. */
export function fileExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) {
    return null;
  }
  return fileName.slice(dot + 1).toLowerCase();
}

export function isAudioFileName(fileName: string): boolean {
  const extension = fileExtension(fileName);
  return extension !== null && AUDIO_EXTENSION_SET.has(extension);
}

/** Best-effort MIME type, used to seed `tracks.mime_type` on import. */
export function mimeTypeForFileName(fileName: string): string | null {
  switch (fileExtension(fileName)) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "m4b":
    case "m4p":
    case "mp4":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "ogg":
    case "oga":
    case "opus":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    case "wav":
    case "wave":
      return "audio/wav";
    case "aif":
    case "aiff":
      return "audio/aiff";
    case "wma":
      return "audio/x-ms-wma";
    case "mka":
      return "audio/x-matroska";
    case "amr":
      return "audio/amr";
    case "3gp":
      return "audio/3gpp";
    default:
      return null;
  }
}
