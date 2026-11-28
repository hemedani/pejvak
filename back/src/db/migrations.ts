import { coreApp } from "../../mod.ts";

/**
 * One-time data moves that must run before the indexes are (re)built.
 *
 * Each step is filtered on the old field being present and the new one absent,
 * so a restart on an already-migrated database is a no-op. This is deliberately
 * not a schema migration framework: the project has no migrations directory,
 * and these are the only relation renames so far.
 */
export const migrateChannelOwner = async () => {
  // `channel.user` became `channel.owner` so a reader cannot confuse the
  // creator with a subscriber (who is also a user).
  await coreApp.odm.getCollection("channel").updateMany(
    { user: { $exists: true }, owner: { $exists: false } },
    { $rename: { user: "owner" } },
  );

  // The matching reverse array on the user document. Acts historically passed
  // `relatedRelations: {}`, so it is usually absent; renaming it anyway keeps a
  // database written by an older act correct.
  await coreApp.odm.getCollection("user").updateMany(
    { channels: { $exists: true }, ownedChannels: { $exists: false } },
    { $rename: { channels: "ownedChannels" } },
  );
};
