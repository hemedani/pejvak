import { boolean, defaulted, number, object, optional, string } from "lesan";
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
    }),
    get: selectStruct("track", 1),
  });
