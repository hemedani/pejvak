import {
  enums,
  number,
  object,
  objectIdValidation,
  optional,
  string,
} from "lesan";

/**
 * Fills waveforms for episodes published before the server measured them.
 *
 * `audioId` targets one row; `limit` + `afterId` page through the rest; with
 * neither, the act walks every remaining candidate. The response is a report,
 * not a model row, so its leaves are projection flags and the fn applies
 * `pickByGet`.
 */
export const adminBackfillChannelWaveformsValidator = () =>
  object({
    set: object({
      /**
       * Bounded batch size (1–200). Omit both `limit` and `afterId` to process
       * every remaining candidate in one request.
       */
      limit: optional(number()),
      /** Resume after the `lastId` returned by the previous call. */
      afterId: optional(string()),
      /** Measure exactly this episode. */
      audioId: optional(objectIdValidation),
    }),
    get: optional(
      object({
        scanned: optional(enums([0, 1])),
        updated: optional(enums([0, 1])),
        skippedMissing: optional(enums([0, 1])),
        failed: optional(enums([0, 1])),
        lastId: optional(enums([0, 1])),
        done: optional(enums([0, 1])),
      }),
    ),
  });
