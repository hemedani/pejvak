import { type ActFn, type Document, ObjectId } from "lesan";
import { channelAudio } from "../../../mod.ts";
import { projectionOrPure, throwError } from "@lib";
import { actorOrNull, statusScope } from "../authz.ts";
import { pageArgs, textFilter } from "../browse.ts";

/**
 * The episode list (prompt D15: one act, role-aware).
 *
 * Active-only for creator/listener/anon; an operator may filter by `status`.
 * Scoped to a channel and/or folder so a caller can never enumerate the whole
 * `channelAudio` collection.
 */
export const listChannelAudiosFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const who = actorOrNull();
  const { page, limit, skip } = pageArgs(set.page, set.limit);

  const hasChannel = set.channelId !== undefined && set.channelId !== "";
  const hasFolder = set.playlistId !== undefined && set.playlistId !== "";
  if (!hasChannel && !hasFolder) {
    throwError("Provide a channelId or a playlistId");
  }

  const conditions: Document[] = [statusScope(who, set.status)];
  if (hasChannel) {
    conditions.push({ "channel._id": new ObjectId(set.channelId) });
  }
  if (hasFolder) {
    conditions.push({ "channelPlaylist._id": new ObjectId(set.playlistId) });
  }
  if (set.category) conditions.push({ category: set.category });
  if (set.tag) conditions.push({ tags: set.tag });

  const search = textFilter(set.q, ["title", "description", "author"]);
  if (search) conditions.push(search);

  const match = conditions.length === 1 ? conditions[0] : { $and: conditions };

  const sortSpec = hasFolder && !hasChannel
    ? { position: 1, _id: 1 }
    : { createdAt: -1 };

  const total = await channelAudio.countDocument({ filter: match });

  const rows = await channelAudio.aggregation({
    pipeline: [
      { $match: match },
      { $sort: sortSpec },
      { $skip: skip },
      { $limit: limit },
    ],
    projection: projectionOrPure(get, "channelAudio"),
  }).toArray();

  return { rows, total, page, limit };
};
