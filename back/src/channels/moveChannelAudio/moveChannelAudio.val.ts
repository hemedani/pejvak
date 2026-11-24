import { number, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

/**
 * Moves an episode to another folder **in the same channel**.
 *
 * Only the destination folder and an optional position are sent; the channel is
 * re-derived from the destination folder (prompt D8), and the act refuses a
 * destination whose channel differs from the audio's current one — the folder
 * metaphor is single-containment, so an episode never crosses channels.
 */
export const moveChannelAudioValidator = () =>
  object({
    set: object({
      audioId: string(),
      targetPlaylistId: string(),
      position: optional(number()),
    }),
    get: selectStruct("channelAudio", 1),
  });
