# ════════════════════════════════════════════════════════════════
# Pejvak Backend - E2E Smoke Test
# Run: deno task test   (reads http/vars.env)
# ════════════════════════════════════════════════════════════════
#
# Every request POSTs to /lesan with { model, act, details: { set, get } }.
# Unique values use {{unique}}, injected per run by `deno task test`, so the suite is re-runnable.

# ── Auth ────────────────────────────────────────────────────────

POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "register",
  "details": {
    "set": {
      "username": "tester-{{unique}}",
      "email": "tester-{{unique}}@pejvak.app",
      "password": "password123",
      "displayName": "Tester"
    },
    "get": { "token": 1, "user": { "_id": 1, "username": 1, "email": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true

[Captures]
token: jsonpath "$.body.token"
userId: jsonpath "$.body.user._id"


POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "login",
  "details": {
    "set": { "email": "tester-{{unique}}@pejvak.app", "password": "password123" },
    "get": { "token": 1, "user": { "_id": 1 } }
  }
}

HTTP 200


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "getMe",
  "details": {
    "set": {},
    "get": { "_id": 1, "username": 1, "email": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body._id" == "{{userId}}"


# ── Tracks ──────────────────────────────────────────────────────

POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "registerTrack",
  "details": {
    "set": {
      "title": "Sample Audiobook",
      "contentHash": "hash-{{unique}}",
      "fileName": "sample.mp3",
      "durationSec": 3600,
      "fileSizeBytes": 1048576,
      "mimeType": "audio/mpeg",
      "isAudiobook": true,
      "author": "Sample Author"
    },
    "get": { "_id": 1, "title": 1, "contentHash": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true

[Captures]
trackId: jsonpath "$.body._id"
contentHash: jsonpath "$.body.contentHash"


# Re-registering the same contentHash returns the existing track (idempotent),
# so a second device joins the same history instead of creating a duplicate.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "registerTrack",
  "details": {
    "set": {
      "title": "Sample Audiobook (re-registered)",
      "contentHash": "{{contentHash}}",
      "durationSec": 3600,
      "fileSizeBytes": 1048576
    },
    "get": { "_id": 1, "contentHash": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body._id" == "{{trackId}}"
jsonpath "$.body.contentHash" == "{{contentHash}}"


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "getMyTracks",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": { "_id": 1, "title": 1, "totalPlayCount": 1, "totalListenTimeSec": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count >= 1


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "getTrackDetail",
  "details": {
    "set": { "trackId": "{{trackId}}" },
    "get": {
      "_id": 1,
      "title": 1,
      "sessions": { "_id": 1, "startedAt": 1 },
      "annotations": { "_id": 1, "positionSec": 1 }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body._id" == "{{trackId}}"


# ── syncLocalData: create + idempotent replay ───────────────────

POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "sessions": [
        {
          "clientId": "local-session-{{unique}}",
          "contentHash": "{{contentHash}}",
          "startedAt": 1757000000000,
          "endedAt": 1757000300000,
          "startPositionSec": 0,
          "endPositionSec": 300,
          "durationListenedSec": 300,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        }
      ],
      "annotations": [
        {
          "clientId": "local-annotation-stable-{{unique}}",
          "contentHash": "{{contentHash}}",
          "positionSec": 120,
          "text": "Key passage",
          "tags": ["important"],
          "updatedAt": 1000,
          "deleted": false
        }
      ]
    },
    "get": { "syncedSessions": 1, "syncedAnnotations": 1, "annotations": [] }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.syncedSessions" == 1
jsonpath "$.body.syncedAnnotations" == 1

[Captures]
annotationServerId: jsonpath "$.body.annotations[0].serverId"


# Ingesting a session increments the parent track's aggregates.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "getTrackDetail",
  "details": {
    "set": { "trackId": "{{trackId}}" },
    "get": { "_id": 1, "totalPlayCount": 1, "totalListenTimeSec": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.totalPlayCount" == 1
jsonpath "$.body.totalListenTimeSec" == 300


# ── Session reads ───────────────────────────────────────────────

POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playbackSession",
  "act": "getMyListeningHistory",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": {
      "_id": 1,
      "clientId": 1,
      "startedAt": 1,
      "durationListenedSec": 1,
      "track": { "_id": 1, "title": 1 }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count >= 1

[Captures]
sessionClientId: jsonpath "$.body[0].clientId"


# Replaying the same session clientId must not insert a duplicate.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "sessions": [
        {
          "clientId": "{{sessionClientId}}",
          "contentHash": "{{contentHash}}",
          "startedAt": 1757000000000,
          "endedAt": 1757000300000,
          "startPositionSec": 0,
          "endPositionSec": 300,
          "durationListenedSec": 300,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        }
      ],
      "annotations": []
    },
    "get": { "syncedSessions": 1, "syncedAnnotations": 1, "annotations": [] }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.syncedSessions" == 0


# A replayed batch must not double-count the track aggregates.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "getTrackDetail",
  "details": {
    "set": { "trackId": "{{trackId}}" },
    "get": { "_id": 1, "totalPlayCount": 1, "totalListenTimeSec": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.totalPlayCount" == 1
jsonpath "$.body.totalListenTimeSec" == 300


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playbackSession",
  "act": "getTrackSessions",
  "details": {
    "set": { "trackId": "{{trackId}}", "page": 1, "limit": 10 },
    "get": { "_id": 1, "startedAt": 1, "track": { "title": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count >= 1


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playbackSession",
  "act": "getMyStats",
  "details": {
    "set": {},
    "get": {
      "totalListenTimeSec": 1,
      "sessionCount": 1,
      "trackCount": 1,
      "tracks": []
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.sessionCount" >= 1
jsonpath "$.body.trackCount" >= 1


# ── Annotations: read, LWW, delete ──────────────────────────────

POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "annotation",
  "act": "getMyAnnotations",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": {
      "_id": 1,
      "clientId": 1,
      "positionSec": 1,
      "text": 1,
      "tags": 1,
      "updatedAt": 1,
      "track": { "contentHash": 1 }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count == 1
jsonpath "$.body[0].text" == "Key passage"

[Captures]
annotationClientId: jsonpath "$.body[0].clientId"


# Replaying the same annotation clientId returns the same server id.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "sessions": [],
      "annotations": [
        {
          "clientId": "{{annotationClientId}}",
          "contentHash": "{{contentHash}}",
          "positionSec": 120,
          "text": "Key passage",
          "tags": ["important"],
          "updatedAt": 1000,
          "deleted": false
        }
      ]
    },
    "get": { "syncedSessions": 1, "syncedAnnotations": 1, "annotations": [] }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.annotations[0].serverId" == "{{annotationServerId}}"


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "annotation",
  "act": "updateAnnotation",
  "details": {
    "set": { "annotationId": "{{annotationServerId}}", "text": "Edited", "updatedAt": 5000 },
    "get": { "_id": 1, "text": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.text" == "Edited"


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "annotation",
  "act": "updateAnnotation",
  "details": {
    "set": { "annotationId": "{{annotationServerId}}", "text": "Stale", "updatedAt": 100 },
    "get": { "_id": 1, "text": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.text" == "Edited"


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "annotation",
  "act": "deleteAnnotation",
  "details": {
    "set": { "annotationId": "{{annotationServerId}}" },
    "get": { "success": true }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.success" == true


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "annotation",
  "act": "getMyAnnotations",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": { "_id": 1, "text": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count == 0


# ── Playlists ───────────────────────────────────────────────────

POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playlist",
  "act": "createPlaylist",
  "details": {
    "set": { "title": "Focus", "description": "deep work" },
    "get": { "_id": 1, "title": 1, "items": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.title" == "Focus"

[Captures]
playlistId: jsonpath "$.body._id"


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playlist",
  "act": "updatePlaylist",
  "details": {
    "set": {
      "playlistId": "{{playlistId}}",
      "title": "Focus v2",
      "items": [{ "trackId": "{{trackId}}", "order": 0 }]
    },
    "get": { "_id": 1, "title": 1, "items": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.title" == "Focus v2"
jsonpath "$.body.items" count == 1


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playlist",
  "act": "getMyPlaylists",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": { "_id": 1, "title": 1, "items": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count >= 1


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playlist",
  "act": "deletePlaylist",
  "details": {
    "set": { "playlistId": "{{playlistId}}" },
    "get": { "success": true }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.success" == true


# ── Playlist sync: idempotent upsert by clientId ────────────────

POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "playlists": [
        {
          "clientId": "local-playlist-{{unique}}",
          "title": "Synced list",
          "isPublic": false,
          "items": [{ "contentHash": "{{contentHash}}", "order": 0 }],
          "updatedAt": 1000,
          "deleted": false
        }
      ]
    },
    "get": { "syncedPlaylists": 1, "playlists": [] }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.syncedPlaylists" == 1

[Captures]
syncedPlaylistId: jsonpath "$.body.playlists[0].serverId"


# Replaying the same clientId must not duplicate and returns the same id.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "playlists": [
        {
          "clientId": "local-playlist-{{unique}}",
          "title": "Synced list",
          "isPublic": false,
          "items": [{ "contentHash": "{{contentHash}}", "order": 0 }],
          "updatedAt": 1000,
          "deleted": false
        }
      ]
    },
    "get": { "syncedPlaylists": 1, "playlists": [] }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.playlists[0].serverId" == "{{syncedPlaylistId}}"


# The item's content hash was resolved to the server track id.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playlist",
  "act": "getMyPlaylists",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": { "_id": 1, "clientId": 1, "title": 1, "items": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count == 1
jsonpath "$.body[0].clientId" == "local-playlist-{{unique}}"
jsonpath "$.body[0].items[0].trackId" == "{{trackId}}"


# An older local edit loses (LWW).
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "playlists": [
        {
          "clientId": "local-playlist-{{unique}}",
          "title": "Stale title",
          "updatedAt": 100,
          "deleted": false
        }
      ]
    },
    "get": { "syncedPlaylists": 1, "playlists": [] }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playlist",
  "act": "getMyPlaylists",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": { "_id": 1, "title": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body[0].title" == "Synced list"


# A newer local edit wins.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "playlists": [
        {
          "clientId": "local-playlist-{{unique}}",
          "title": "Renamed remotely",
          "updatedAt": 9000,
          "deleted": false
        }
      ]
    },
    "get": { "syncedPlaylists": 1, "playlists": [] }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playlist",
  "act": "getMyPlaylists",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": { "_id": 1, "title": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body[0].title" == "Renamed remotely"


# A delete tombstone removes the server row.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "playlists": [
        {
          "clientId": "local-playlist-{{unique}}",
          "title": "Renamed remotely",
          "updatedAt": 10000,
          "deleted": true
        }
      ]
    },
    "get": { "syncedPlaylists": 1, "playlists": [] }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.syncedPlaylists" == 1


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playlist",
  "act": "getMyPlaylists",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": { "_id": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count == 0


# ── Ownership isolation (second user) ───────────────────────────

POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "register",
  "details": {
    "set": {
      "username": "intruder-{{unique}}",
      "email": "intruder-{{unique}}@pejvak.app",
      "password": "password123"
    },
    "get": { "token": 1, "user": { "_id": 1 } }
  }
}

HTTP 200
[Captures]
intruderToken: jsonpath "$.body.token"


POST {{serverAddress}}/lesan
token: {{intruderToken}}
{
  "model": "track",
  "act": "getTrackDetail",
  "details": {
    "set": { "trackId": "{{trackId}}" },
    "get": { "_id": 1, "title": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" == null


POST {{serverAddress}}/lesan
token: {{intruderToken}}
{
  "model": "playbackSession",
  "act": "getMyListeningHistory",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": { "_id": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count == 0
