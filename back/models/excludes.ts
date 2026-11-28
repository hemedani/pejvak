export const user_excludes: string[] = [
  "createdAt",
  "updatedAt",
  "password",
];

export const shared_relation_excludes: string[] = [
  "createdAt",
  "updatedAt",
];

/**
 * A subscriber, embedded on a channel subscription row.
 *
 * Stricter than `user_excludes`: a creator may list who follows them, but an
 * email, a role, an account status or the listener's shared settings are none
 * of the creator's business. Only the public identity fields remain.
 */
export const subscriber_excludes: string[] = [
  "createdAt",
  "updatedAt",
  "password",
  "email",
  "setting",
  "role",
  "status",
  "suspendedAt",
  "suspendedReason",
];

export const track_excludes: string[] = [
  "createdAt",
  "updatedAt",
];

export const session_excludes: string[] = [
  "createdAt",
  "updatedAt",
  "deviceInfo",
];

export const annotation_excludes: string[] = [
  "createdAt",
  "updatedAt",
];

export const playlist_excludes: string[] = [
  "createdAt",
  "updatedAt",
];

export const channel_excludes: string[] = [
  "createdAt",
  "updatedAt",
];

export const channelPlaylist_excludes: string[] = [
  "createdAt",
  "updatedAt",
];

export const channelAudio_excludes: string[] = [
  "createdAt",
  "updatedAt",
];
