import { type ActFn, type Document, ObjectId } from "lesan";
import { channelAudio } from "../../../mod.ts";
import { throwError } from "@lib";
import { actorOrNull, statusScope } from "../authz.ts";

/**
 * Resolves a single episode (prompt D15: one act, role-aware).
 *
 * Exactly one of `audioId` / `contentHash` addresses it; the read is active-only
 * for a creator/listener/anon caller and unconstrained for an operator.
 */
export const getChannelAudioFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const who = actorOrNull();

  const byId = set.audioId !== undefined && set.audioId !== "";
  const byHash = set.contentHash !== undefined && set.contentHash !== "";
  if (!byId && !byHash) throwError("Provide an audioId or a contentHash");

  const filters: Document = {
    ...statusScope(who, set.status),
    ...(byId
      ? { _id: new ObjectId(set.audioId) }
      : { contentHash: set.contentHash }),
  };

  const row = await channelAudio.findOne({ filters, projection: get });
  if (!row) throwError("Audio not found");

  return row;
};
