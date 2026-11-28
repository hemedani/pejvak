import { object, objectIdValidation } from "lesan";
import { selectStruct } from "../../../../mod.ts";

/**
 * Reassigning a channel to another account.
 *
 * `ownerId` is the target account's `_id`; the operator never sends the channel
 * document back, and the fn re-reads the row so a stale panel cannot overwrite
 * a newer edit. The response is the channel row, so `get` is a normal channel
 * projection (including `owner` when the caller asks for it).
 */
export const adminTransferChannelOwnerValidator = () =>
  object({
    set: object({
      channelId: objectIdValidation,
      ownerId: objectIdValidation,
    }),
    get: selectStruct("channel", 1),
  });
