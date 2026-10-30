/**
 * The signed-in listener.
 *
 * `getMe` is the shell's only hard dependency: without a user there is no
 * sidebar to draw and no name for the account menu. Every other screen treats a
 * failure as a state; the shell treats it as the end of the render.
 */

import { asRecord, asString } from "../parse";

export type CurrentUser = {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export const USER_GET = {
  _id: 1,
  username: 1,
  email: 1,
  displayName: 1,
  avatarUrl: 1,
} as const;

export function parseUser(raw: unknown): CurrentUser | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const id = asString(record._id);
  const username = asString(record.username);
  if (!id || !username) {
    return null;
  }

  return {
    id,
    username,
    email: asString(record.email) ?? "",
    displayName: asString(record.displayName),
    avatarUrl: asString(record.avatarUrl),
  };
}

/**
 * What to call the listener.
 *
 * `displayName` is optional on the model, and `username` is whatever they typed
 * at signup — an email fragment half the time. Falling back through them is the
 * only ordering that never shows an empty string where a name belongs.
 */
export function displayNameOf(user: CurrentUser): string {
  return user.displayName ?? user.username;
}

/** The first glyph of the name, for an avatar with no image. */
export function initialOf(user: CurrentUser): string {
  const name = displayNameOf(user).trim();
  return name.length > 0 ? name.slice(0, 1) : "؟";
}
