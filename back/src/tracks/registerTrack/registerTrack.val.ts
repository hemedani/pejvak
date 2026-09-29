import {
  boolean,
  defaulted,
  enums,
  number,
  object,
  optional,
  string,
} from "lesan";
import { selectStruct } from "../../../mod.ts";

export const registerTrackValidator = () =>
  object({
    set: object({
      title: string(),
      contentHash: string(),
      fileName: optional(string()),
      durationSec: defaulted(number(), 0),
      fileSizeBytes: defaulted(number(), 0),
      mimeType: optional(string()),
      isAudiobook: defaulted(boolean(), false),
      author: optional(string()),
      narrator: optional(string()),
      artworkUrl: optional(string()),
      /**
       * Provenance, for audio that came from an online source.
       *
       * No stream URL is accepted here: the source signs its media URLs with an
       * expiry, so a copy kept server-side would be a link that fails opaquely
       * later. The address that lasts is the collection's page URL, which lives
       * on `onlineCollection`.
       */
      origin: optional(enums(["local", "online"])),
      sourceId: optional(string()),
      externalId: optional(string()),
      collectionKey: optional(string()),
      collectionTitle: optional(string()),
      downloadedAt: optional(number()),
    }),
    get: selectStruct("track", 1),
  });
