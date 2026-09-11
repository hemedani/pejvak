import type { ActFn } from "lesan";
import { compare } from "@da/bcrypt";
import { user } from "../../../mod.ts";
import { createToken, throwError } from "@lib";

export const loginFn: ActFn = async (body) => {
  const {
    set: { email, password },
    get,
  } = body.details;

  get.user.email = 1;
  get.user.password = 1;
  get.user.username = 1;

  const foundedUser = await user.findOne({
    filters: { email },
    projection: get.user,
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
