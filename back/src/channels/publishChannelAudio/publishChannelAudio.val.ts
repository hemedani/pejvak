import { array, boolean, number, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

/**
 * Publishing an episode into a caller-owned folder.
 *
 * The client names the **folder** (`playlistId`) and supplies the file facts the
 * upload route returned (`audioUrl`, `mediaPath`, `fileSizeBytes`, `mimeType`)
 * plus the device-computed `contentHash` and `durationSec` (prompt D7). It does
 * **not** choose the channel: the act derives `channel` from the folder and
 * rejects a folder the caller does not own (prompt D8), mirroring how
 * `saveOnlineCollection` derives `clientId`.
 *
 * `contentHash`, `audioUrl`, `category` and `title` are required — the first two
 * are the identity and the served file, the third is the single category
 * (prompt D5).
 */
export const publishChannelAudioValidator = () =>
  object({
    set: object({
      playlistId: string(),
      contentHash: string(),
      title: string(),
      category: string(),
      audioUrl: string(),
      mediaPath: optional(string()),
      description: optional(string()),
      tags: optional(array(string())),
      durationSec: optional(number()),
      fileSizeBytes: optional(number()),
      mimeType: optional(string()),
      isAudiobook: optional(boolean()),
      author: optional(string()),
      narrator: optional(string()),
      artworkUrl: optional(string()),
      position: optional(number()),
      languageCode: optional(string()),
    }),
    get: selectStruct("channelAudio", 1),
  });
