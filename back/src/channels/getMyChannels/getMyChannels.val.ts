import { object } from "lesan";
import { pagination } from "@lib";
import { selectStruct } from "../../../mod.ts";

/**
 * The caller's own channels — including any an operator has flagged `removed`,
 * because a creator must be able to see a takedown and its reason (plan §3d).
 * The public browse acts are the ones that hide non-active rows.
 */
export const getMyChannelsValidator = () =>
  object({
    set: object({ ...pagination }),
    get: selectStruct("channel", 1),
  });
