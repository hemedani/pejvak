# ════════════════════════════════════════════════════════════════
# Pejvak Backend - E2E Smoke Test
# Run: hurl --test --variables-file vars.env e2e.hurl
# ════════════════════════════════════════════════════════════════

POST {{serverAddress}}/user/register
{
  "details": {
    "set": {
      "username": "tester",
      "email": "tester@pejvak.app",
      "password": "password123",
      "displayName": "Tester"
    },
    "get": {
      "token": 1,
      "user": { "_id": 1, "username": 1, "email": 1 }
    }
  }
}

HTTP 200
[Captures]
token: jsonpath "$['body']['token']"
userId: jsonpath "$['body']['user']['_id']"


POST {{serverAddress}}/user/login
{
  "details": {
    "set": {
      "email": "tester@pejvak.app",
      "password": "password123"
    },
    "get": {
      "token": 1,
      "user": { "_id": 1, "username": 1, "email": 1 }
    }
  }
}

HTTP 200
[Captures]
token: jsonpath "$['body']['token']"


POST {{serverAddress}}/user/getMe
token: "{token}"
{
  "details": {
    "set": {},
    "get": { "_id": 1, "username": 1, "email": 1 }
  }
}

HTTP 200
[Captures]
meId: jsonpath "$['body']['_id']"


POST {{serverAddress}}/track/registerTrack
token: "{token}"
{
  "details": {
    "set": {
      "title": "Sample Audiobook",
      "contentHash": "smoke-test-hash-0001",
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
[Captures]
trackId: jsonpath "$['body']['_id']"


POST {{serverAddress}}/track/getMyTracks
token: "{token}"
{
  "details": {
    "set": { "page": 1, "limit": 10 },
    "get": { "_id": 1, "title": 1, "totalPlayCount": 1, "totalListenTimeSec": 1 }
  }
}

HTTP 200


POST {{serverAddress}}/track/syncLocalData
token: "{token}"
{
  "details": {
    "set": {
      "sessions": [
        {
          "clientId": "local-session-0001",
          "contentHash": "smoke-test-hash-0001",
          "startedAt": 1757000000,
          "endedAt": 1757000300,
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
          "clientId": "local-annotation-0001",
          "contentHash": "smoke-test-hash-0001",
          "positionSec": 120,
          "text": "Key passage",
          "tags": ["important"]
        }
      ]
    },
    "get": { "syncedSessions": 1, "syncedAnnotations": 1 }
  }
}

HTTP 200
