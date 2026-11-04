import { type ActFn, ObjectId } from "lesan";
import { coreApp, playlist } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";
import {
  playlistQuotaOf,
  resolveEntitlement,
} from "../../entitlements/entitlement.ts";

export const createPlaylistFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);

  // Playlists are a plan limit; `-1` means unlimited, so the free tier's 10 is
  // enforced here and a Pro listener never sees this branch.
  const entitlement = await resolveEntitlement(userId);
  if (entitlement.limits.playlists >= 0) {
    const quota = await playlistQuotaOf(userId, entitlement.limits);
    if (quota.remaining <= 0) {
      throwError(
        `Your plan stores up to ${quota.limit} playlists. Upgrade to add more.`,
      );
    }
  }

  const now = new Date();
  const created = await playlist.insertOne({
    doc: {
      ...set,
      isPublic: set.isPublic ?? false,
      items: [],
      createdAt: now,
      updatedAt: now,
    },
    relations: {
      user: {
        _ids: user._id,
        relatedRelations: {},
      },
    } as never,
    projection: { _id: 1 },
  });

  if (!created) {
    throwError("Playlist was not created");
  }

  return await playlist.findOne({
    filters: { _id: created!._id },
    projection: get,
  });
};
