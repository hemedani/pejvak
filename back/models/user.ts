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
  /**
   * What this account may do.
   *
   * `user` is the listener. `support` may read everything the admin panel
   * shows and change nothing; `admin` may also mutate. The split exists because
   * the panel's read surface (a listener's history, their payments) is exactly
   * what a first-line support agent needs, and exactly what should not come
   * with the power to grant a subscription.
   *
   * Defaulted rather than required so the 55 accounts that predate this field
   * stay valid; every reader treats a missing value as `user`.
   */
  role: defaulted(enums(["user", "admin", "support"]), "user"),
  /**
   * `suspended` is read-only, not signed-out: a suspended listener can still
   * open their library and see why, but every write act is refused. `deleted`
   * is reserved for a soft delete and is rejected at authentication.
   */
  status: defaulted(enums(["active", "suspended", "deleted"]), "active"),
  suspendedAt: optional(number()),
  /** Shown to the listener, so it must be written as a sentence, not a code. */
  suspendedReason: optional(string()),
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
