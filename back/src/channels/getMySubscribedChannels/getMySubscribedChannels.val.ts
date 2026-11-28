import { object } from "lesan";
import { pagination } from "@lib";
import { selectStruct } from "../../../mod.ts";

/**
 * The caller's followed channels, newest follow first.
 *
 * `get` describes one channel row (the listener acts return a bare array, not
 * the admin `{ rows, total }` wrapper). The subscription's `createdAt` is not
 * exposed: the list is already in follow order and the account page shows the
 * channel, not the moment it was followed.
 */
export const getMySubscribedChannelsValidator = () =>
  object({
    set: object({ ...pagination }),
    get: selectStruct("channel", 1),
  });
