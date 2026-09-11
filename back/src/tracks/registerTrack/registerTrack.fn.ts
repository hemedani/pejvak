import type { ActFn } from "lesan";
import { coreApp, track } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

export const registerTrackFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;

  const createdTrack = await track.insertOne({
    doc: set,
    relations: {
      user: {
        _ids: user._id,
        relatedRelations: {},
      },
    } as never,
    projection: { _id: 1 },
  });

  if (!createdTrack) {
    throwError("Track was not created");
  }

  return await track.findOne({
    filters: { _id: createdTrack!._id },
    projection: get,
  });
};
