import { object } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

export const getMyAnnotationsValidator = () =>
  object({
    set: object({
      ...pagination,
    }),
    get: selectStruct("annotation", 2),
  });
