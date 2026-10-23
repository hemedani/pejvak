import type { ActFn } from "lesan";
import { hash } from "@da/bcrypt";
import { coreApp, user } from "../../../mod.ts";
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

  const now = new Date();
  const createdUser = await user.insertOne({
    doc: {
      username,
      email,
      password: await hash(password),
      ...(displayName !== undefined ? { displayName } : {}),
      createdAt: now,
      updatedAt: now,
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

  // An empty projection would make Mongo return the whole document, which
  // includes the password hash. Fall back to every safe pure field instead.
  const requestedUser = get?.user ?? {};
  const userProjection = Object.keys(requestedUser).length > 0
    ? requestedUser
    : coreApp.schemas.createProjection("user", "Pure");

  const registeredUser = await user.findOne({
    filters: { _id: createdUser!._id },
    projection: userProjection,
  });

  // Defence in depth: even an exclusion projection (`{ _id: 0 }`) makes Mongo
  // return every other field, so never hand a user document back with the hash.
  if (registeredUser) {
    delete registeredUser.password;
  }

  return { token, user: registeredUser };
};
