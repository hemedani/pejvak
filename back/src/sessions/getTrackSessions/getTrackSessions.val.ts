import { object, objectIdValidation } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

export const getTrackSessionsValidator = () =>
  object({
    set: object({
      ...pagination,
      trackId: objectIdValidation,
    }),
    get: selectStruct("playbackSession", 2),
  });
