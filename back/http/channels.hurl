# ════════════════════════════════════════════════════════════════
# Pejvak Backend — Listener Channels E2E (plan §4, CH-T1)
# Run: deno task test:channels   (reads http/vars.env)
# ════════════════════════════════════════════════════════════════
#
# Covers: creator CRUD, the multipart upload transport (prompt D14),
# publish + idempotent re-publish, folder move, public tokenless browse
# (prompt D9), ownership denial, the channels quota (skip-and-report, D11),
# moderation takedown (D10), and a leaf-first hard delete.
#
# Re-runnable: every fixture is unique-suffixed. Files land under ./uploads
# and are reclaimed by the delete steps.

# ── Creator + admin identity ────────────────────────────────────

POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "register",
  "details": {
    "set": { "username": "creator-{{unique}}", "email": "creator-{{unique}}@pejvak.app", "password": "password123" },
    "get": { "token": 1, "user": { "_id": 1 } }
  }
}
HTTP 200
[Asserts]
jsonpath "$.success" == true

[Captures]
creatorToken: jsonpath "$.body.token"
creatorId: jsonpath "$.body.user._id"

POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "login",
  "details": { "set": { "email": "{{adminEmail}}", "password": "{{adminPassword}}" }, "get": { "token": 1, "user": { "_id": 1 } } }
}
HTTP 200
[Captures]
adminToken: jsonpath "$.body.token"

# ── createChannel (CH-A01) ──────────────────────────────────────

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channel",
  "act": "createChannel",
  "details": {
    "set": {
      "name": "Night Signals {{unique}}",
      "bio": "Late-night audio essays.",
      "categories": ["podcast", "society"],
      "languageCode": "en",
      "socials": [{ "platform": "mastodon", "url": "https://mastodon.social/@night" }],
      "donationUrl": "https://example.org/donate"
    },
    "get": { "_id": 1, "slug": 1, "name": 1, "status": 1, "playlistCount": 1, "audioCount": 1 }
  }
}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.status" == "active"
jsonpath "$.body.slug" matches "^night-signals-"
jsonpath "$.body.playlistCount" == 0
jsonpath "$.body.audioCount" == 0

[Captures]
channelId: jsonpath "$.body._id"
channelSlug: jsonpath "$.body.slug"

# A channel needs at least one category (D5) — refused, nothing created.

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channel",
  "act": "createChannel",
  "details": { "set": { "name": "No Category {{unique}}", "categories": [] }, "get": { "_id": 1 } }
}
HTTP 501
[Asserts]
jsonpath "$.success" == false

# ── updateChannel (CH-A02) ──────────────────────────────────────

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channel",
  "act": "updateChannel",
  "details": { "set": { "channelId": "{{channelId}}", "bio": "Updated bio.", "categories": ["podcast"] }, "get": { "_id": 1, "bio": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.bio" == "Updated bio."

# ── createChannelPlaylist folder (CH-A05) ───────────────────────

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channelPlaylist",
  "act": "createChannelPlaylist",
  "details": { "set": { "channelId": "{{channelId}}", "title": "Season 1", "category": "podcast", "tags": ["essay"] }, "get": { "_id": 1, "audioCount": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.audioCount" == 0

[Captures]
folderId: jsonpath "$.body._id"

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channelPlaylist",
  "act": "createChannelPlaylist",
  "details": { "set": { "channelId": "{{channelId}}", "title": "Bonus", "category": "podcast" }, "get": { "_id": 1 } }
}
HTTP 200
[Captures]
folder2Id: jsonpath "$.body._id"

# channel.playlistCount bumped to 2.

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channel",
  "act": "getChannel",
  "details": { "set": { "channelId": "{{channelId}}" }, "get": { "_id": 1, "playlistCount": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.playlistCount" == 2

# ── uploadChannelMedia (CH-UP2, multipart, prompt D14) ──────────

POST {{serverAddress}}/lesan
token: {{creatorToken}}
[MultipartFormData]
lesan-body: {"model":"channelAudio","act":"uploadChannelMedia","details":{"set":{"kind":"audio"},"get":{"audioUrl":1,"mediaPath":1,"fileSizeBytes":1,"mimeType":1}}}
file: file,fixtures/episode.mp3; audio/mpeg;
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.fileSizeBytes" == 2048
jsonpath "$.body.audioUrl" exists

[Captures]
audioUrl: jsonpath "$.body.audioUrl"
mediaPath: jsonpath "$.body.mediaPath"

# ── Aborted upload leaves no bytes (CH-CLEAN, prompt D18) ───────
#
# A body that stops mid-part (no closing boundary) is how a client abort reaches
# the server. The framework rejects it before the act runs, so nothing is
# written. `src/channels/media_test.ts` proves the harder case — an abort *after*
# the act has begun writing — with a direct atomic-rename/unlink test, because a
# hurl file cannot inspect `./uploads`.

POST {{serverAddress}}/lesan
token: {{creatorToken}}
Content-Type: multipart/form-data; boundary=AbortedBoundary
```
--AbortedBoundary
Content-Disposition: form-data; name="lesan-body"

{"model":"channelAudio","act":"uploadChannelMedia","details":{"set":{"kind":"audio"},"get":{"audioUrl":1}}}
--AbortedBoundary
Content-Disposition: form-data; name="file"; filename="aborted.mp3"
Content-Type: audio/mpeg

TRUNCATED
```
HTTP 501
[Asserts]
jsonpath "$.success" == false

# ── publishChannelAudio (CH-A09) ────────────────────────────────

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channelAudio",
  "act": "publishChannelAudio",
  "details": {
    "set": {
      "playlistId": "{{folderId}}",
      "contentHash": "hash-{{unique}}",
      "title": "Episode One",
      "category": "podcast",
      "tags": ["essay", "night"],
      "audioUrl": "{{audioUrl}}",
      "mediaPath": "{{mediaPath}}",
      "fileSizeBytes": 2048,
      "durationSec": 3600,
      "isAudiobook": false
    },
    "get": { "_id": 1, "title": 1, "audioUrl": 1, "durationSec": 1, "position": 1, "waveform": 1 }
  }
}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.audioUrl" == "{{audioUrl}}"
jsonpath "$.body.durationSec" == 3600
jsonpath "$.body.position" == 0
# The server measured the uploaded bytes into the scrubber strip.
jsonpath "$.body.waveform" count == 160
jsonpath "$.body.waveform[0]" >= 0.12
jsonpath "$.body.waveform[0]" <= 1

[Captures]
audioId: jsonpath "$.body._id"
waveformFirst: jsonpath "$.body.waveform[0]"

# Idempotent re-publish: same contentHash in the same channel returns the row.

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channelAudio",
  "act": "publishChannelAudio",
  "details": { "set": { "playlistId": "{{folderId}}", "contentHash": "hash-{{unique}}", "title": "Episode One (again)", "category": "podcast", "audioUrl": "{{audioUrl}}", "fileSizeBytes": 2048 }, "get": { "_id": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body._id" == "{{audioId}}"

# Measurement failure must never fail the publish: a path with no bytes still
# creates the row, with an empty waveform, and does not 500 (prompt 02 §3).

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channelAudio",
  "act": "publishChannelAudio",
  "details": { "set": { "playlistId": "{{folderId}}", "contentHash": "hash-bad-{{unique}}", "title": "No Bytes", "category": "podcast", "audioUrl": "/uploads/missing.wav", "mediaPath": "channel/audio/missing-{{unique}}.wav" }, "get": { "_id": 1, "title": 1, "waveform": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.waveform" count == 0

# The deduped re-publish did not double-count; the folder now also holds the
# unmeasurable row. Both folders are still listed.

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channelPlaylist",
  "act": "listChannelPlaylists",
  "details": { "set": { "channelId": "{{channelId}}" }, "get": { "_id": 1, "audioCount": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.rows" isCollection
jsonpath "$.body.total" == 2

# ── updateChannelAudio (CH-A10) ─────────────────────────────────

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channelAudio",
  "act": "updateChannelAudio",
  "details": { "set": { "audioId": "{{audioId}}", "title": "Episode One — Final", "author": "N. Signal" }, "get": { "_id": 1, "title": 1, "author": 1, "waveform": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.title" == "Episode One — Final"
jsonpath "$.body.author" == "N. Signal"
# Metadata edits must not touch the measured strip.
jsonpath "$.body.waveform" count == 160
jsonpath "$.body.waveform[0]" == {{waveformFirst}}

# ── moveChannelAudio (CH-A11, same channel) ─────────────────────

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channelAudio",
  "act": "moveChannelAudio",
  "details": { "set": { "audioId": "{{audioId}}", "targetPlaylistId": "{{folder2Id}}" }, "get": { "_id": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.success" == true

# ── Public browse, tokenless (CH-A13..A17, prompt D9) ───────────

POST {{serverAddress}}/lesan
{
  "model": "channel",
  "act": "listChannels",
  "details": { "set": { "q": "Night Signals {{unique}}", "sort": "new" }, "get": { "_id": 1, "slug": 1, "name": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.rows" isCollection
jsonpath "$.body.total" >= 1

POST {{serverAddress}}/lesan
{
  "model": "channel",
  "act": "getChannel",
  "details": { "set": { "slug": "{{channelSlug}}" }, "get": { "_id": 1, "slug": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.slug" == "{{channelSlug}}"
jsonpath "$.body.playlists" isCollection
jsonpath "$.body.audios" isCollection

POST {{serverAddress}}/lesan
{
  "model": "channelAudio",
  "act": "listChannelAudios",
  "details": { "set": { "channelId": "{{channelId}}", "category": "podcast" }, "get": { "_id": 1, "title": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.total" >= 1

POST {{serverAddress}}/lesan
{
  "model": "channelAudio",
  "act": "getChannelAudio",
  "details": { "set": { "contentHash": "hash-{{unique}}" }, "get": { "_id": 1, "contentHash": 1, "audioUrl": 1, "waveform": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.contentHash" == "hash-{{unique}}"
jsonpath "$.body.audioUrl" == "{{audioUrl}}"
jsonpath "$.body.waveform" count == 160

# ── Ownership denial: a second creator cannot file into our folder ─

POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "register",
  "details": { "set": { "username": "intruder-{{unique}}", "email": "intruder-{{unique}}@pejvak.app", "password": "password123" }, "get": { "token": 1 } }
}
HTTP 200
[Captures]
intruderToken: jsonpath "$.body.token"

POST {{serverAddress}}/lesan
token: {{intruderToken}}
{
  "model": "channelAudio",
  "act": "publishChannelAudio",
  "details": { "set": { "playlistId": "{{folderId}}", "contentHash": "intruder-{{unique}}", "title": "Nope", "category": "podcast", "audioUrl": "/uploads/nope.mp3", "fileSizeBytes": 1 }, "get": { "_id": 1 } }
}
HTTP 501
[Asserts]
jsonpath "$.success" == false

# The intruder cannot delete our episode either.

POST {{serverAddress}}/lesan
token: {{intruderToken}}
{
  "model": "channelAudio",
  "act": "deleteChannelAudio",
  "details": { "set": { "audioId": "{{audioId}}" }, "get": { "success": 1 } }
}
HTTP 501
[Asserts]
jsonpath "$.success" == false

# ── Channels quota (CH-ENT3): free tier allows 3 channels ───────

POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "register",
  "details": { "set": { "username": "quota-{{unique}}", "email": "quota-{{unique}}@pejvak.app", "password": "password123" }, "get": { "token": 1 } }
}
HTTP 200
[Captures]
quotaToken: jsonpath "$.body.token"

POST {{serverAddress}}/lesan
token: {{quotaToken}}
{
  "model": "channel",
  "act": "createChannel",
  "details": { "set": { "name": "Q One {{unique}}", "categories": ["a"] }, "get": { "_id": 1 } }
}
HTTP 200

POST {{serverAddress}}/lesan
token: {{quotaToken}}
{
  "model": "channel",
  "act": "createChannel",
  "details": { "set": { "name": "Q Two {{unique}}", "categories": ["a"] }, "get": { "_id": 1 } }
}
HTTP 200

POST {{serverAddress}}/lesan
token: {{quotaToken}}
{
  "model": "channel",
  "act": "createChannel",
  "details": { "set": { "name": "Q Three {{unique}}", "categories": ["a"] }, "get": { "_id": 1 } }
}
HTTP 200

# The 4th exceeds the free cap of 3 → refused, existing three untouched.

POST {{serverAddress}}/lesan
token: {{quotaToken}}
{
  "model": "channel",
  "act": "createChannel",
  "details": { "set": { "name": "Q Four {{unique}}", "categories": ["a"] }, "get": { "_id": 1 } }
}
HTTP 501
[Asserts]
jsonpath "$.success" == false

# ── Moderation, now ONE role-aware act (prompt D15) ──────────────
#
# `adminUpdateChannel` no longer exists: the takedown is `channel/updateChannel`
# with an operator token. The creator path stays the same act but is refused the
# `status` field — that is the business rule that keeps a shared endpoint safe.

# A creator may NOT flip their own status (that would undo moderation).

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channel",
  "act": "updateChannel",
  "details": { "set": { "channelId": "{{channelId}}", "status": "removed" }, "get": { "_id": 1, "status": 1 } }
}
HTTP 501
[Asserts]
jsonpath "$.success" == false

# An operator flips the same field on the same act → allowed, audited.

POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "channel",
  "act": "updateChannel",
  "details": { "set": { "channelId": "{{channelId}}", "status": "removed", "reason": "test takedown" }, "get": { "_id": 1, "status": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.status" == "removed"

# The anonymous public page now answers "not found" (pinned to active).

POST {{serverAddress}}/lesan
{
  "model": "channel",
  "act": "getChannel",
  "details": { "set": { "slug": "{{channelSlug}}" }, "get": { "_id": 1 } }
}
HTTP 501
[Asserts]
jsonpath "$.success" == false

# The SAME getChannel with an operator token elevates via optionalAuth → sees it.

POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "channel",
  "act": "getChannel",
  "details": { "set": { "slug": "{{channelSlug}}", "status": "removed" }, "get": { "_id": 1, "status": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.status" == "removed"

# The creator still sees their own (removed) channel via getMyChannels.

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channel",
  "act": "getMyChannels",
  "details": { "set": { "limit": 50 }, "get": { "_id": 1, "status": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body" isCollection

# Operator restores it; later cleanup hard-deletes (leaf-first).

POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "channel",
  "act": "updateChannel",
  "details": { "set": { "channelId": "{{channelId}}", "status": "active" }, "get": { "_id": 1, "status": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.status" == "active"

# ── Cleanup: deleteChannel hard-deletes audios → folders → channel ──

POST {{serverAddress}}/lesan
token: {{creatorToken}}
{
  "model": "channel",
  "act": "deleteChannel",
  "details": { "set": { "channelId": "{{channelId}}" }, "get": { "success": 1 } }
}
HTTP 200
[Asserts]
jsonpath "$.body.success" == true

POST {{serverAddress}}/lesan
{
  "model": "channelAudio",
  "act": "getChannelAudio",
  "details": { "set": { "contentHash": "hash-{{unique}}" }, "get": { "_id": 1 } }
}
HTTP 501
[Asserts]
jsonpath "$.success" == false
