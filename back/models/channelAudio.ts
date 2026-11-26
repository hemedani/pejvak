import { coreApp } from "../mod.ts";
import {
  array,
  boolean,
  defaulted,
  enums,
  number,
  optional,
  type RelationDataType,
  type RelationSortOrderType,
  string,
} from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";
import {
  channel_excludes,
  channelPlaylist_excludes,
  user_excludes,
} from "./excludes.ts";

/**
 * One uploaded episode/chapter — a podcast or an audiobook — that **we host**.
 *
 * This is the row that makes Listener Channels the first time Pejvak serves
 * media it did not merely index, and that fact is the single difference from
 * `onlineCollection`:
 *
 * - `onlineCollection` stores only a `pageUrl` **because** a third party signs
 *   its media URLs with an expiry, so a stored stream URL would rot.
 * - `channelAudio.audioUrl` is **required and durable** — we wrote the bytes and
 *   serve them ourselves, so the URL we hand back is stable and is exactly the
 *   thing the device streams. **Do not "fix" this into a re-resolve path** the
 *   way online resources re-resolve their source: there is no expiry to refresh
 *   and no third party to ask. (prompt D1)
 *
 * Public and free by construction: no `isPublic`, no price, no entitlement gate
 * on reading. `status` is the moderation switch only (plan §3d).
 *
 * `contentHash` is the audio identity (SHA-256 of first 1 MB + size, computed on
 * device, prompt D7). Dedup is **per channel** (the publish act refuses a second
 * copy inside the same channel), and because `PlaybackSession`/`Annotation`
 * already key on `contentHash`, a listener's history and notes follow a channel
 * episode with no new sync path.
 *
 * Containment is single — an audio lives in exactly one `channelPlaylist` (its
 * folder), and that folder in exactly one `channel` (prompt D3). The `channel`
 * relation is **denormalised from the folder** so a public channel page is one
 * indexed filter and an ownership check is one filter; the `publishChannelAudio`
 * act *derives* `channel` from the folder and rejects a folder the caller does
 * not own — the client never chooses the channel (prompt D8, mirroring how
 * `saveOnlineCollection` derives `clientId`).
 *
 * `playCount`/`totalListenSec` are deferred (CH-AGG); discovery sorts by
 * `createdAt` for now.
 */
export const channelAudio_pure = {
  /** Identity: SHA-256(first 1 MB + size), computed on device. */
  contentHash: string(),
  title: string(),
  description: optional(string()),
  /** EXACTLY one category (required); client catalogue. */
  category: string(),
  tags: defaulted(array(string()), []),
  /**
   * DURABLE — we host the bytes. Required, never a re-resolved cache. See the
   * model doc-comment: this is the whole contrast with `onlineCollection`.
   */
  audioUrl: string(),
  /**
   * Where the bytes live, relative to `./uploads` (e.g. `channel/audio/<file>`).
   *
   * `audioUrl` is what the device streams; it is host-dependent (it carries
   * `MEDIA_BASE_URL` when that is configured), so it is the wrong thing to
   * derive a filesystem path from at delete time. This is the stable, internal
   * pointer the delete acts and the deferred sweep unlink against — the same
   * reason the sibling `nejat` project records `file.path` beside `file.name`.
   * Optional so a row that predates byte-tracking stays valid.
   */
  mediaPath: optional(string()),
  durationSec: defaulted(number(), 0),
  fileSizeBytes: defaulted(number(), 0),
  mimeType: optional(string()),
  /**
   * Measured loudness strip for the scrubber: exactly WAVEFORM_PEAKS heights in
   * [0, 1], left→right, produced once from the hosted bytes. Empty when the server
   * could not measure the file; the client then falls back to its sample strip.
   * Never accepted from the client — `publishChannelAudio` computes it.
   */
  waveform: defaulted(array(number()), []),
  isAudiobook: defaulted(boolean(), false),
  author: optional(string()),
  narrator: optional(string()),
  /** Episode-level art; the channel art is the fallback. */
  artworkUrl: optional(string()),
  /** Order within its folder. */
  position: defaulted(number(), 0),
  languageCode: optional(string()),
  /** Moderation switch (plan §3d). A removed audio is hidden, not deleted. */
  status: defaulted(enums(["active", "removed"]), "active"),
  ...createUpdateAt,
};

export const channelAudio_relations = {
  channel: {
    schemaName: "channel",
    type: "single" as RelationDataType,
    optional: false,
    excludes: channel_excludes,
    relatedRelations: {
      audios: {
        type: "multiple" as RelationDataType,
        // First-page embed only; the public episode list queries `channelAudio`
        // directly with its own bounded page, so the reverse array stays small.
        limit: 50,
        sort: {
          field: "position",
          order: "asc" as RelationSortOrderType,
        },
      },
    },
  },
  channelPlaylist: {
    schemaName: "channelPlaylist",
    type: "single" as RelationDataType,
    optional: false,
    excludes: channelPlaylist_excludes,
    relatedRelations: {
      audios: {
        type: "multiple" as RelationDataType,
        // Same rule: the folder embeds a first page of episodes, not all 1000.
        limit: 50,
        sort: {
          field: "position",
          order: "asc" as RelationSortOrderType,
        },
      },
    },
  },
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      channelAudios: {
        type: "multiple" as RelationDataType,
        limit: 50,
        sort: {
          field: "_id",
          order: "desc" as RelationSortOrderType,
        },
      },
    },
  },
};

export const channelAudios = () =>
  coreApp.odm.newModel(
    "channelAudio",
    channelAudio_pure,
    channelAudio_relations,
    {
      createIndex: {
        indexSpec: { "channelPlaylist._id": 1, position: 1 },
        options: {},
      },
    },
  );
