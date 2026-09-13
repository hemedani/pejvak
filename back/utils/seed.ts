import { hash } from "@da/bcrypt";
import { annotation, playbackSession, playlist, track, user } from "../mod.ts";

const email = "demo@pejvak.app";
const password = "password123";

// --- User -----------------------------------------------------------------

let demo = await user.findOne({ filters: { email }, projection: { _id: 1 } });

if (!demo) {
  demo = await user.insertOne({
    doc: {
      username: "demo",
      email,
      password: await hash(password),
      displayName: "Demo Listener",
    },
    projection: { _id: 1 },
  });
  console.log(`Seeded demo user: ${email} / ${password}`);
} else {
  console.log(`Demo user already exists: ${email}`);
}

const userId = demo!._id;

const seedTracks = [
  {
    contentHash: "seed-meditations-001",
    title: "Meditations",
    author: "Marcus Aurelius",
    narrator: "Seed Narrator",
    durationSec: 7200,
  },
  {
    contentHash: "seed-sapiens-001",
    title: "Sapiens",
    author: "Yuval Noah Harari",
    narrator: "Seed Narrator",
    durationSec: 5400,
  },
  {
    contentHash: "seed-focus-mix-001",
    title: "Focus Mix",
    author: "Pejvak",
    narrator: "Seed Narrator",
    durationSec: 1800,
  },
];

function findTrack(contentHash: string) {
  return track.findOne({
    filters: { contentHash, "user._id": userId },
    projection: { _id: 1 },
  });
}

for (const seed of seedTracks) {
  const existing = await findTrack(seed.contentHash);
  if (existing) {
    console.log(`Track already exists: ${seed.title}`);
    continue;
  }
  await track.insertOne({
    doc: {
      title: seed.title,
      contentHash: seed.contentHash,
      author: seed.author,
      narrator: seed.narrator,
      durationSec: seed.durationSec,
      fileSizeBytes: seed.durationSec * 16000,
      mimeType: "audio/mpeg",
      isAudiobook: true,
    },
    relations: {
      user: { _ids: userId, relatedRelations: { tracks: true } },
    } as never,
    projection: { _id: 1 },
  });
  console.log(`Seeded track: ${seed.title}`);
}

// --- Sessions -------------------------------------------------------------

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

const seedSessions = [
  {
    clientId: "seed-session-med-1",
    hash: "seed-meditations-001",
    startedAt: now - 2 * DAY,
    duration: 1800,
  },
  {
    clientId: "seed-session-med-2",
    hash: "seed-meditations-001",
    startedAt: now - 1 * DAY,
    duration: 2400,
  },
  {
    clientId: "seed-session-sap-1",
    hash: "seed-sapiens-001",
    startedAt: now - 1 * DAY,
    duration: 900,
  },
  {
    clientId: "seed-session-focus-1",
    hash: "seed-focus-mix-001",
    startedAt: now - 3 * 60 * 60 * 1000,
    duration: 600,
  },
];

for (const session of seedSessions) {
  const existing = await playbackSession.findOne({
    filters: { clientId: session.clientId },
    projection: { _id: 1 },
  });
  if (existing) {
    continue;
  }
  const parent = await findTrack(session.hash);
  if (!parent) {
    continue;
  }
  const endedAt = session.startedAt + session.duration * 1000;
  await playbackSession.insertOne({
    doc: {
      clientId: session.clientId,
      contentHash: session.hash,
      startedAt: session.startedAt,
      endedAt,
      startPositionSec: 0,
      endPositionSec: session.duration,
      durationListenedSec: session.duration,
      playbackSpeed: 1,
      completed: false,
      interrupted: false,
    },
    relations: {
      track: { _ids: parent._id, relatedRelations: { sessions: true } },
      user: { _ids: userId, relatedRelations: { sessions: true } },
    } as never,
    projection: { _id: 1 },
  });
  await track.findOneAndUpdate({
    filter: { _id: parent._id },
    update: {
      $inc: { totalPlayCount: 1, totalListenTimeSec: session.duration },
      $set: { lastPlayedAt: endedAt, updatedAt: new Date() },
    },
    projection: { _id: 1 },
  });
}
console.log(`Sessions seeded: ${seedSessions.length} (idempotent by clientId)`);

// --- Annotations ----------------------------------------------------------

const seedAnnotations = [
  {
    clientId: "seed-annotation-med-1",
    hash: "seed-meditations-001",
    positionSec: 120,
    text: "The obstacle is the way",
    tags: ["stoicism"],
    color: "#E8B23A",
  },
  {
    clientId: "seed-annotation-sap-1",
    hash: "seed-sapiens-001",
    positionSec: 300,
    text: "Cognitive revolution",
    tags: ["history", "quote"],
    color: "#4FA3E3",
  },
];

for (const note of seedAnnotations) {
  const existing = await annotation.findOne({
    filters: { clientId: note.clientId },
    projection: { _id: 1 },
  });
  if (existing) {
    continue;
  }
  const parent = await findTrack(note.hash);
  if (!parent) {
    continue;
  }
  await annotation.insertOne({
    doc: {
      clientId: note.clientId,
      positionSec: note.positionSec,
      text: note.text,
      tags: note.tags,
      color: note.color,
      updatedAt: new Date(),
    },
    relations: {
      track: { _ids: parent._id, relatedRelations: { annotations: true } },
      user: { _ids: userId, relatedRelations: { annotations: true } },
    } as never,
    projection: { _id: 1 },
  });
}
console.log(
  `Annotations seeded: ${seedAnnotations.length} (idempotent by clientId)`,
);

// --- Playlist -------------------------------------------------------------

const playlistClientId = "seed-playlist-focus";
const existingPlaylist = await playlist.findOne({
  filters: { clientId: playlistClientId, "user._id": userId },
  projection: { _id: 1 },
});

if (existingPlaylist) {
  console.log("Playlist already exists: Focus");
} else {
  const items: { trackId: string; order: number }[] = [];
  for (const seed of seedTracks) {
    const parent = await findTrack(seed.contentHash);
    if (parent) {
      items.push({ trackId: String(parent._id), order: items.length });
    }
  }
  await playlist.insertOne({
    doc: {
      clientId: playlistClientId,
      title: "Focus",
      description: "Seed playlist",
      isPublic: false,
      items,
    },
    relations: {
      user: { _ids: userId, relatedRelations: { playlists: true } },
    } as never,
    projection: { _id: 1 },
  });
  console.log("Seeded playlist: Focus");
}

Deno.exit(0);
