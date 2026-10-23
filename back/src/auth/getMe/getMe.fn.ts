import { type ActFn, ObjectId } from "lesan";
import { coreApp, user } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

export const getMeFn: ActFn = async (body) => {
  const context = coreApp.contextFns.getContextModel() as MyContext;
  const _id = context.user._id;

  const { get } = body.details;

  // `$project: {}` is rejected by Mongo and an exclusion-only projection would
  // return fields the schema deliberately hides (the password hash).
  const projection = Object.keys(get ?? {}).length > 0
    ? get
    : coreApp.schemas.createProjection("user", "Pure");

  const foundedUser = await user
    .aggregation({
      pipeline: [{ $match: { _id: new ObjectId(_id) } }],
      projection,
    })
    .toArray();

  foundedUser.length < 1 && throwError("user not exist");

  delete foundedUser[0].password;
  return foundedUser[0];
};
