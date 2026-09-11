import { coreApp } from "../mod.ts";
import { optional, pattern, string } from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";

export const emailPattern = pattern(
  string(),
  /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
);

export const user_pure = {
  username: string(),
  email: emailPattern,
  password: string(),
  displayName: optional(string()),
  avatarUrl: optional(string()),
  ...createUpdateAt,
};

export const user_relations = {};

export const users = () =>
  coreApp.odm.newModel("user", user_pure, user_relations, {
    createIndex: {
      indexSpec: { email: 1 },
      options: { unique: true },
    },
    excludes: ["password"],
  });
