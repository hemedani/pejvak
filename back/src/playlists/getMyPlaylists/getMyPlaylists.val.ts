import { object } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

export const getMyPlaylistsValidator = () =>
  object({
    set: object({
      ...pagination,
    }),
    get: selectStruct("playlist", 1),
  });
