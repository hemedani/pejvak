import { object } from "lesan";
import { selectStruct } from "../../../mod.ts";

export const getMeValidator = () =>
  object({
    set: object({}),
    get: selectStruct("user", 2),
  });
