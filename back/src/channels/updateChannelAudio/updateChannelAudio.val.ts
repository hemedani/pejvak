import { array, boolean, number, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

/**
 * Patches an episode's metadata.
 *
 * `contentHash`, `audioUrl`, `mediaPath`, `fileSizeBytes` and the relations are
 * **not** editable here — the bytes and the folder are fixed; moving an episode
 * is `moveChannelAudio`, and replacing its audio is a re-upload plus republish.
 * `category` stays one required slug when sent.
 */
export const updateChannelAudioValidator = () =>
  object({
    set: object({
      audioId: string(),
      title: optional(string()),
      description: optional(string()),
      category: optional(string()),
      tags: optional(array(string())),
      artworkUrl: optional(string()),
      author: optional(string()),
      narrator: optional(string()),
      position: optional(number()),
      languageCode: optional(string()),
      isAudiobook: optional(boolean()),
    }),
    get: selectStruct("channelAudio", 1),
  });
