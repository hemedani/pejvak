import { enums, instance, object, optional } from "lesan";

/**
 * The multipart upload request.
 *
 * `formData` is the `FormData` the framework puts in `details.set` for a
 * `multipart/form-data` POST; the file part is named `file`. `kind` decides the
 * target directory and (for audio) is checked against the storage quota. Artwork
 * and gallery images share this route with `kind: "image"`.
 *
 * The response is computed, not a model row, so its `get` is a hand-written
 * projection of `enums([0,1])` leaves — the same shape `getPlatformStatus` uses —
 * and the act filters it through `pickByGet`.
 */
export const uploadChannelMediaValidator = () =>
  object({
    set: object({
      formData: instance(FormData),
      kind: optional(enums(["audio", "image"])),
    }),
    get: optional(
      object({
        audioUrl: optional(enums([0, 1])),
        mediaPath: optional(enums([0, 1])),
        mimeType: optional(enums([0, 1])),
        fileSizeBytes: optional(enums([0, 1])),
      }),
    ),
  });
