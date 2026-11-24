import { enums, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

/**
 * One episode, addressed by `_id` or `contentHash`.
 *
 * `contentHash` is the device-side identity, so a listener whose history already
 * knows a hash can open the channel episode that carries it (prompt D7). Active
 * only for non-operators; `status` is honoured only for an operator (D15).
 */
export const getChannelAudioValidator = () =>
  object({
    set: object({
      audioId: optional(string()),
      contentHash: optional(string()),
      status: optional(enums(["active", "removed"])),
    }),
    get: selectStruct("channelAudio", 1),
  });
