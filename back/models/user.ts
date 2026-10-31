import { coreApp } from "../mod.ts";
import {
  defaulted,
  enums,
  nullable,
  number,
  object,
  optional,
  pattern,
  refine,
  string,
} from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";

export const emailPattern = pattern(
  string(),
  /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
);

export const setting_pure = object({
  /**
   * The one language the listener chose for online resources, or null for none.
   *
   * Deliberately not validated against a server-side catalogue: the catalogues
   * live in the clients and can gain languages without a backend deploy. A code
   * that no longer exists must make the client hide its tab, not make a settings
   * read fail.
   */
  languageCode: defaulted(nullable(string()), null),
  /** Playback speed for a new session. Player range is 0.5–3.0. */
  defaultSpeed: defaulted(
    refine(
      number(),
      "defaultSpeed between 0.5 and 3.0",
      (value) => value >= 0.5 && value <= 3,
    ),
    1,
  ),
  /** "newest" | "oldest" | "longest" — mirrors mobile HISTORY_SORT_OPTIONS. */
  historySort: defaulted(enums(["newest", "oldest", "longest"]), "newest"),
  /**
   * Epoch milliseconds, not a Date: this is the last-write-wins token the
   * clients send and compare, so it stays a number on the wire.
   */
  updatedAt: defaulted(number(), 0),
});

export const user_pure = {
  username: string(),
  email: emailPattern,
  password: string(),
  displayName: optional(string()),
  avatarUrl: optional(string()),
  /**
   * Shared listener preferences. Optional so existing users and the register
   * act stay valid; defaults are applied on read, not written at registration.
   */
  setting: optional(setting_pure),
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
