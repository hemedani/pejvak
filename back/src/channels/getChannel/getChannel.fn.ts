import { type ActFn, type Document, ObjectId } from "lesan";
import {
  channel,
  channelAudio,
  channelPlaylist,
  channelSubscription,
  coreApp,
} from "../../../mod.ts";
import { throwError } from "@lib";
import { actorOrNull, statusScope } from "../authz.ts";

/**
 * Assembles a public channel page (prompt D15: one act, role-aware).
 *
 * A signed-out caller and a creator see the `active` page; an operator who
 * presents a token sees the row whatever its `status`, so the moderation panel
 * needs no separate read. The folder list and a bounded newest-audio slice are
 * fetched with pure-field projections (no nested relation expansion). Audios are
 * always active-only here — reviewing a removed episode is `listChannelAudios`.
 */
export const getChannelFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const who = actorOrNull();

  const byId = set.channelId !== undefined && set.channelId !== "";
  if (!byId && !(set.slug && set.slug !== "")) {
    throwError("Provide a slug or a channelId");
  }

  const filters: Document = {
    ...statusScope(who, set.status),
    ...(byId ? { _id: new ObjectId(set.channelId) } : { slug: set.slug }),
  };

  const channelRow = await channel.findOne({ filters, projection: get });
  if (!channelRow) throwError("Channel not found");

  const channelId = channelRow!._id as ObjectId;

  // A computed column like `playlists`/`audios`: always returned, never part of
  // the client's projection. An anonymous reader is never subscribed; a signed-in
  // one gets the answer for their own row, so the page can draw the follow button.
  let isSubscribed = false;
  if (who) {
    const subscription = await channelSubscription.findOne({
      filters: { "channel._id": channelId, "user._id": who.userId },
      projection: { _id: 1 },
    });
    isSubscribed = subscription !== null;
  }

  const playlists = await channelPlaylist.aggregation({
    pipeline: [
      { $match: { "channel._id": channelId } },
      { $sort: { sortOrder: 1 } },
    ],
    projection: coreApp.schemas.createProjection("channelPlaylist", "Pure"),
  }).toArray();

  const audioLimit = Math.min(
    Math.max(Math.trunc(set.audioLimit ?? 20), 1),
    100,
  );
  const audios = await channelAudio.aggregation({
    pipeline: [
      { $match: { "channel._id": channelId, status: "active" } },
      { $sort: { createdAt: -1 } },
      { $limit: audioLimit },
    ],
    projection: coreApp.schemas.createProjection("channelAudio", "Pure"),
  }).toArray();

  return { ...channelRow, isSubscribed, playlists, audios };
};
