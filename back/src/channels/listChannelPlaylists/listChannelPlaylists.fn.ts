import { type ActFn, type Document, ObjectId } from "lesan";
import { channel, channelPlaylist } from "../../../mod.ts";
import { projectionOrPure, throwError } from "@lib";
import { actorOrNull } from "../authz.ts";
import { pageArgs } from "../browse.ts";

/**
 * Lists a channel's folders (prompt D15: one act, role-aware).
 *
 * A removed channel is hidden from a creator/listener/anon caller — "not found".
 * An operator may list the folders of a removed channel (to review it), so the
 * active gate is skipped for them. Folders themselves carry no `status`; they
 * inherit the channel's visibility.
 */
export const listChannelPlaylistsFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const who = actorOrNull();
  const { page, limit, skip } = pageArgs(set.page, set.limit);
  const channelId = new ObjectId(set.channelId);

  const channelRow = await channel.findOne({
    filters: {
      _id: channelId,
      ...(who?.canReadAll ? {} : { status: "active" }),
    },
    projection: { _id: 1 },
  });
  if (!channelRow) throwError("Channel not found");

  const match: Document = { "channel._id": channelId };
  const total = await channelPlaylist.countDocument({ filter: match });

  const rows = await channelPlaylist.aggregation({
    pipeline: [
      { $match: match },
      { $sort: { sortOrder: 1, _id: 1 } },
      { $skip: skip },
      { $limit: limit },
    ],
    projection: projectionOrPure(get, "channelPlaylist"),
  }).toArray();

  return { rows, total, page, limit };
};
