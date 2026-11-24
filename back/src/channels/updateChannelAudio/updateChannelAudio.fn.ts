import { type ActFn, ObjectId } from "lesan";
import { channelAudio } from "../../../mod.ts";
import { throwError } from "@lib";
import { actor, rowScope } from "../authz.ts";

/**
 * Patch an episode — creator or operator (prompt D15).
 *
 * Scope is the caller's authority: a creator edits their own row, an operator may
 * correct any (e.g. fix a title on a reported episode). Only metadata is
 * editable; the identity, the served file and the containment are untouched, and
 * `status` is not part of this surface (a takedown is `deleteChannelAudio` or the
 * channel switch).
 */
export const updateChannelAudioFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const who = actor();

  const existing = await channelAudio.findOne({
    filters: rowScope(who, new ObjectId(set.audioId), { write: true }),
    projection: { _id: 1 },
  });
  if (!existing) throwError("Audio not found");

  if (set.category !== undefined && set.category.trim() === "") {
    throwError("An audio needs a category");
  }

  const editable = [
    "title",
    "description",
    "category",
    "tags",
    "artworkUrl",
    "author",
    "narrator",
    "position",
    "languageCode",
    "isAudiobook",
  ] as const;

  const fields: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of editable) {
    const value = set[key];
    if (value !== undefined) fields[key] = value;
  }

  await channelAudio.findOneAndUpdate({
    filter: { _id: existing!._id },
    update: { $set: fields } as never,
    projection: { _id: 1 },
  });

  return await channelAudio.findOne({
    filters: { _id: existing!._id },
    projection: get,
  });
};
