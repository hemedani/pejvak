import { type ActFn, ObjectId } from "lesan";
import { coreApp } from "../../../mod.ts";
import { type MyContext, pickByGet, throwError } from "@lib";
import {
  resolveEntitlement,
  storageQuotaOf,
} from "../../entitlements/entitlement.ts";
import { type MediaKind, storeUploadFile } from "../media.ts";

/**
 * Streams one uploaded file to the host and returns its durable descriptors.
 *
 * The storage quota is checked **before** any byte is written (CH-ENT4): a
 * refusal must not leave a file on disk with no row to name it. The cap is the
 * creator's `plan.limits.storageBytes`, resolved live so an admin edit takes
 * effect at once. Over it, the act reports the quota in the message and writes
 * nothing — skip-and-report, never destroy.
 *
 * `contentHash` and `durationSec` are **not** computed here: they are device
 * facts (prompt D7) that `publishChannelAudio` receives alongside the returned
 * `audioUrl`. This act only moves bytes and reports where they landed.
 */
export const uploadChannelMediaFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);

  const kind: MediaKind = set.kind ?? "audio";
  const file = set.formData.get("file");

  if (!(file instanceof File)) {
    throwError("No `file` part was sent in the multipart body");
  }
  if (file.size === 0) {
    throwError("The uploaded file is empty");
  }

  const entitlement = await resolveEntitlement(userId);
  if (entitlement.limits.storageBytes >= 0) {
    const quota = await storageQuotaOf(userId, entitlement.limits);
    if (file.size > quota.remaining) {
      const mb = (n: number) => Math.round(n / (1024 * 1024));
      throwError(
        `Only ${mb(quota.remaining)} MB of your ${
          mb(quota.limit)
        } MB storage allowance is left. Delete audio or upgrade to upload more.`,
      );
    }
  }

  const stored = await storeUploadFile(kind, file, new ObjectId().toString());

  return pickByGet(
    {
      audioUrl: stored.audioUrl,
      mediaPath: stored.mediaPath,
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
    },
    get,
  );
};
