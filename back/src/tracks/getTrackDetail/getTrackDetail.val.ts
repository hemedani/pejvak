import { object, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

export const getTrackDetailValidator = () =>
  object({
    set: object({
      trackId: string(),
    }),
    get: selectStruct("track", 2),
  });
