import { object, objectIdValidation } from "lesan";
import { selectStruct } from "../../../mod.ts";

export const getTrackDetailValidator = () =>
  object({
    set: object({
      trackId: objectIdValidation,
    }),
    get: selectStruct("track", 2),
  });
