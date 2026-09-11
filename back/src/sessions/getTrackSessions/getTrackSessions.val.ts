import { object, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

export const getTrackSessionsValidator = () =>
  object({
    set: object({
      ...pagination,
      trackId: string(),
    }),
    get: selectStruct("playbackSession", 2),
  });
