import { number, object, objectIdValidation, optional, string } from "lesan";
import { selectStruct } from "../../../../mod.ts";
import { adminPagination } from "../../query.ts";

export const adminGetUserHistoryValidator = () =>
  object({
    set: object({
      userId: objectIdValidation,
      ...adminPagination,
      /** Epoch ms bounds on `startedAt`, inclusive. */
      from: optional(number()),
      to: optional(number()),
      contentHash: optional(string()),
    }),
    get: optional(
      selectStruct("playbackSession", 1, ["clientId", "deviceInfo"]),
    ),
  });
