import { number, object, optional } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

export const getMyListeningHistoryValidator = () =>
  object({
    set: object({
      ...pagination,
      from: optional(number()),
      to: optional(number()),
    }),
    get: selectStruct("playbackSession", 2),
  });
