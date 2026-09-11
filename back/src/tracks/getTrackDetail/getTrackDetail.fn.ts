import { type ActFn, ObjectId } from "lesan";
import { coreApp, track } from "../../../mod.ts";
import { type MyContext } from "@lib";

export const getTrackDetailFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;

  return await track.findOne({
    filters: {
      _id: new ObjectId(set.trackId),
      "user._id": new ObjectId(user._id),
    },
    projection: get,
  });
};
