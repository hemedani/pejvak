import type { ActFn } from "lesan";
import { coreApp, playlist } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

export const createPlaylistFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;

  const created = await playlist.insertOne({
    doc: set,
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
