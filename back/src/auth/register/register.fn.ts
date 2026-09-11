import type { ActFn } from "lesan";
import { hash } from "@da/bcrypt";
import { user } from "../../../mod.ts";
import { createToken, throwError } from "@lib";

export const registerFn: ActFn = async (body) => {
  const {
    set: { username, email, password, displayName },
    get,
  } = body.details;

  const foundedUser = await user.findOne({ filters: { email } });

  if (foundedUser) {
    throwError("A user with this email already exists");
  }

  const createdUser = await user.insertOne({
    doc: {
      username,
      email,
      password: await hash(password),
      displayName,
    },
    projection: { _id: 1, username: 1, email: 1 },
  });

  if (!createdUser) {
    throwError("User was not created");
  }

  const token = await createToken({
    _id: createdUser!._id,
    username,
    email,
  });

  const registeredUser = await user.findOne({
    filters: { _id: createdUser!._id },
    projection: get.user,
  });

  return { token, user: registeredUser };
};
