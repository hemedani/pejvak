import type { ActFn } from "lesan";
import { compare } from "@da/bcrypt";
import { user } from "../../../mod.ts";
import { createToken, throwError } from "@lib";

export const loginFn: ActFn = async (body) => {
  const {
    set: { email, password },
    get,
  } = body.details;

  // Authentication needs its own projection. Reusing the client's `get` here
  // lets an exclusion projection (`{ _id: 0 }`) drop the `_id` the token needs,
  // and an empty projection would return the password hash.
  const requested = (get?.user ?? {}) as Record<string, unknown>;
  const authProjection: Record<string, 0 | 1> = {
    _id: 1,
    username: 1,
    email: 1,
    password: 1,
  };
  for (const key in requested) {
    if (requested[key] === 1) authProjection[key] = 1;
  }

  const foundedUser = await user.findOne({
    filters: { email },
    projection: authProjection,
  });

  if (!foundedUser) {
    throwError("This user does not exist");
  }

  const passIsCorrect = await compare(password, foundedUser!.password);

  if (!passIsCorrect) {
    throwError("Your password is incorrect");
  }

  delete foundedUser!.password;

  const token = await createToken({
    _id: foundedUser!._id,
    username: foundedUser!.username,
    email: foundedUser!.email,
  });

  return { token, user: foundedUser };
};
