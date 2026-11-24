import { type ActFn, ObjectId } from "lesan";
import { channel, coreApp } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";
import {
  channelQuotaOf,
  resolveEntitlement,
} from "../../entitlements/entitlement.ts";
import { uniqueSlug } from "../slug.ts";

/**
 * Creates the caller's channel.
 *
 * Three things are derived here rather than trusted from the client:
 *
 * - **`slug`** comes from `name` and is de-duplicated (`name-2`, …) against the
 *   unique index, so a rename later never breaks an old `/c/<slug>` link.
 * - **`status`** starts `active`; only an operator flips it to `removed`.
 * - **the counts** start at 0 and are maintained by the child acts.
 *
 * A channel is a plan limit (`plan.limits.channels`), so the free tier's cap is
 * checked before the insert. This is the single-create form of the project's
 * skip-and-report rule (domain rule 7): the *new* row is refused with a quota
 * message and existing content is never touched.
 */
export const createChannelFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);

  if (!Array.isArray(set.categories) || set.categories.length === 0) {
    throwError("A channel needs at least one category");
  }

  const entitlement = await resolveEntitlement(userId);
  if (entitlement.limits.channels >= 0) {
    const quota = await channelQuotaOf(userId, entitlement.limits);
    if (quota.remaining <= 0) {
      throwError(
        `Your plan hosts up to ${quota.limit} channels. Upgrade to create more.`,
      );
    }
  }

  const slug = await uniqueSlug(set.name, async (candidate) => {
    const taken = await channel.findOne({
      filters: { slug: candidate },
      projection: { _id: 1 },
    });
    return taken !== null;
  });

  const now = new Date();
  const created = await channel.insertOne({
    doc: {
      slug,
      name: set.name,
      bio: set.bio,
      categories: set.categories,
      languageCode: set.languageCode,
      avatarUrl: set.avatarUrl,
      gallery: set.gallery ?? [],
      donationUrl: set.donationUrl,
      websiteUrl: set.websiteUrl,
      socials: set.socials ?? [],
      contactEmail: set.contactEmail,
      status: "active",
      audioCount: 0,
      playlistCount: 0,
      createdAt: now,
      updatedAt: now,
    },
    relations: {
      user: {
        _ids: userId,
        relatedRelations: {},
      },
    } as never,
    projection: { _id: 1 },
  });

  if (!created) {
    throwError("Channel was not created");
  }

  return await channel.findOne({
    filters: { _id: created!._id },
    projection: get,
  });
};
