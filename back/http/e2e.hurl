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


# ── Shared listener settings (User.setting) ─────────────────────

# Defaults are returned without writing: updatedAt == 0 means "never written".
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "getMySettings",
  "details": {
    "set": {},
    "get": {
      "languageCode": 1,
      "defaultSpeed": 1,
      "historySort": 1,
      "updatedAt": 1
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.languageCode" == null
jsonpath "$.body.defaultSpeed" == 1
jsonpath "$.body.historySort" == "newest"
jsonpath "$.body.updatedAt" == 0


# Create: the code is trimmed and lowercased before storage.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "updateMySettings",
  "details": {
    "set": { "languageCode": "  FA  ", "updatedAt": 1760000000000 },
    "get": {
      "languageCode": 1,
      "defaultSpeed": 1,
      "historySort": 1,
      "updatedAt": 1
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.languageCode" == "fa"
jsonpath "$.body.updatedAt" == 1760000000000


# Persist: a fresh read sees the stored value.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "getMySettings",
  "details": {
    "set": {},
    "get": { "languageCode": 1, "updatedAt": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.languageCode" == "fa"
jsonpath "$.body.updatedAt" == 1760000000000


# Stored inside the user document: getMe can project it, proving no second collection.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "getMe",
  "details": {
    "set": {},
    "get": { "_id": 1, "setting": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.setting.languageCode" == "fa"
jsonpath "$.body.setting.updatedAt" == 1760000000000


# Stale writes lose: an older updatedAt does not overwrite "fa".
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "updateMySettings",
  "details": {
    "set": { "languageCode": "en", "updatedAt": 1750000000000 },
    "get": { "languageCode": 1, "updatedAt": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.languageCode" == "fa"
jsonpath "$.body.updatedAt" == 1760000000000


# Newer writes win.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "updateMySettings",
  "details": {
    "set": { "languageCode": "ar", "updatedAt": 1770000000000 },
    "get": { "languageCode": 1, "updatedAt": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.languageCode" == "ar"
jsonpath "$.body.updatedAt" == 1770000000000


# Equal timestamps are idempotent: a replay with a different value loses.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "updateMySettings",
  "details": {
    "set": { "languageCode": "en", "updatedAt": 1770000000000 },
    "get": { "languageCode": 1, "updatedAt": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.languageCode" == "ar"


# Per-user isolation: a second listener starts from defaults.
POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "register",
  "details": {
    "set": {
      "username": "settings-intruder-{{unique}}",
      "email": "settings-intruder-{{unique}}@pejvak.app",
      "password": "password123"
    },
    "get": { "token": 1 }
  }
}

HTTP 200
[Captures]
settingsIntruderToken: jsonpath "$.body.token"


POST {{serverAddress}}/lesan
token: {{settingsIntruderToken}}
{
  "model": "user",
  "act": "getMySettings",
  "details": {
    "set": {},
    "get": { "languageCode": 1, "defaultSpeed": 1, "historySort": 1, "updatedAt": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.languageCode" == null
jsonpath "$.body.updatedAt" == 0


# Clearing the language round-trips as null.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "updateMySettings",
  "details": {
    "set": { "languageCode": null, "updatedAt": 1780000000000 },
    "get": { "languageCode": 1, "updatedAt": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.languageCode" == null
jsonpath "$.body.updatedAt" == 1780000000000


# Speed accepts the player's full range.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "updateMySettings",
  "details": {
    "set": { "defaultSpeed": 3, "updatedAt": 1781000000000 },
    "get": { "defaultSpeed": 1, "updatedAt": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.defaultSpeed" == 3


# Speed outside 0.5–3.0 is a validation error.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "updateMySettings",
  "details": {
    "set": { "defaultSpeed": 0.1, "updatedAt": 1782000000000 },
    "get": { "defaultSpeed": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false


# An unknown history sort is a validation error.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "user",
  "act": "updateMySettings",
  "details": {
    "set": { "historySort": "daily", "updatedAt": 1783000000000 },
    "get": { "historySort": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false


# Sync push: a settings snapshot applies and returns the authoritative object.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "settings": {
        "languageCode": "fa",
        "defaultSpeed": 1.5,
        "historySort": "longest",
        "updatedAt": 1790000000000
      }
    },
    "get": { "syncedSettings": 1, "settings": {} }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.syncedSettings" == 1
jsonpath "$.body.settings.languageCode" == "fa"
jsonpath "$.body.settings.defaultSpeed" == 1.5
jsonpath "$.body.settings.historySort" == "longest"
jsonpath "$.body.settings.updatedAt" == 1790000000000


# Sync pull: no snapshot still returns the current settings, applied == 0.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {},
    "get": { "syncedSettings": 1, "settings": {} }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.syncedSettings" == 0
jsonpath "$.body.settings.languageCode" == "fa"
jsonpath "$.body.settings.updatedAt" == 1790000000000


# Sync LWW: an older snapshot loses and the response names the winner.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "settings": {
        "languageCode": "en",
        "defaultSpeed": 1,
        "historySort": "newest",
        "updatedAt": 1780000000000
      }
    },
    "get": { "syncedSettings": 1, "settings": {} }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.syncedSettings" == 0
jsonpath "$.body.settings.languageCode" == "fa"
jsonpath "$.body.settings.defaultSpeed" == 1.5
jsonpath "$.body.settings.updatedAt" == 1790000000000


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
      "tracks": {}
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
    "get": {}
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
    "get": {}
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


# ── Playback runs and online collections ────────────────────────

POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "contextPlays": [
        {
          "clientId": "local-run-{{unique}}",
          "contextType": "playlist",
          "contextKey": "focus-{{unique}}",
          "contextTitle": "Focus",
          "trackCount": 1,
          "startedAt": 1757000000000,
          "endedAt": 1757000300000,
          "lastIndex": 0,
          "lastTrackId": "{{trackId}}",
          "lastPositionSec": 300,
          "listenedSec": 300,
          "finishedCount": 1,
          "completed": true,
          "interrupted": false,
          "updatedAt": 1000
        }
      ],
      "onlineCollections": [
        {
          "clientId": "manahej:course-{{unique}}",
          "sourceId": "manahej",
          "externalId": "course-{{unique}}",
          "title": "Course",
          "languageCode": "fa",
          "isFavorite": true,
          "updatedAt": 1000
        }
      ]
    },
    "get": {
      "syncedContextPlays": 1,
      "syncedOnlineCollections": 1,
      "contextPlays": [],
      "onlineCollections": []
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.syncedContextPlays" == 1
jsonpath "$.body.syncedOnlineCollections" == 1


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "playbackContext",
  "act": "getMyPlaybackContexts",
  "details": {
    "set": {
      "page": 1,
      "limit": 10,
      "contextType": "playlist",
      "contextKey": "focus-{{unique}}"
    },
    "get": { "_id": 1, "contextKey": 1, "contextTitle": 1, "completed": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count == 1
jsonpath "$.body[0].contextTitle" == "Focus"
jsonpath "$.body[0].completed" == true


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "onlineCollection",
  "act": "saveOnlineCollection",
  "details": {
    "set": {
      "sourceId": "manahej",
      "externalId": "course-{{unique}}",
      "title": "Course",
      "languageCode": "fa",
      "isFavorite": true,
      "updatedAt": 1000
    },
    "get": { "_id": 1, "clientId": 1, "title": 1, "trackCount": 1, "isFavorite": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.clientId" == "manahej:course-{{unique}}"
jsonpath "$.body.trackCount" == 0
jsonpath "$.body.isFavorite" == true


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "onlineCollection",
  "act": "getMyOnlineCollections",
  "details": {
    "set": { "page": 1, "limit": 10, "isFavorite": true },
    "get": { "_id": 1, "clientId": 1, "title": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count == 1
jsonpath "$.body[0].clientId" == "manahej:course-{{unique}}"


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "onlineCollection",
  "act": "removeOnlineCollection",
  "details": {
    "set": { "sourceId": "manahej", "externalId": "course-{{unique}}" },
    "get": {}
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.success" == true


# Removing an absent collection is still a success.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "onlineCollection",
  "act": "removeOnlineCollection",
  "details": {
    "set": { "sourceId": "manahej", "externalId": "course-{{unique}}" },
    "get": {}
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.success" == true


POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "onlineCollection",
  "act": "getMyOnlineCollections",
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": { "_id": 1, "clientId": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body" count == 0


# ── Ownership and validation guards ─────────────────────────────

POST {{serverAddress}}/lesan
token: {{intruderToken}}
{
  "model": "playlist",
  "act": "createPlaylist",
  "details": {
    "set": { "title": "Intruder list" },
    "get": { "_id": 1 }
  }
}

HTTP 200
[Captures]
intruderPlaylistId: jsonpath "$.body._id"


# An intruder cannot put another user's track into their playlist.
POST {{serverAddress}}/lesan
token: {{intruderToken}}
{
  "model": "playlist",
  "act": "updatePlaylist",
  "details": {
    "set": {
      "playlistId": "{{intruderPlaylistId}}",
      "items": [{ "trackId": "{{trackId}}", "order": 0 }]
    },
    "get": { "_id": 1, "items": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false
jsonpath "$.body.message" contains "do not own"


# A malformed id is a validation error, not a server crash.
POST {{serverAddress}}/lesan
token: {{token}}
{
  "model": "track",
  "act": "getTrackDetail",
  "details": {
    "set": { "trackId": "not-an-id" },
    "get": { "_id": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false
