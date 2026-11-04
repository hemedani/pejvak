# ════════════════════════════════════════════════════════════════
# Pejvak Backend - Admin panel, entitlements and billing E2E
# Run: deno task test:admin   (seeds first, reads http/vars.env)
# ════════════════════════════════════════════════════════════════
#
# Prerequisites
# -------------
# `deno task seed` must have run, because the panel has no public way to create
# its first admin by design — the seeded `admin@pejvak.app` is the only way in.
# The task below chains the seed for you.
#
# What this suite proves, in order
# --------------------------------
#  1. The public status read works with no token (clients need it before login).
#  2. RBAC: a listener token cannot reach a single admin act.
#  3. Plans are rows: the catalogue lists them, and an admin can edit one.
#  4. The history cap is enforced at sync time, skips overflow instead of
#     refusing the batch, and is idempotent on replay.
#  5. The money path: checkout → pending → confirm → active → cancel → refund,
#     with the entitlement following each step.
#  6. AI credits are metered per month and granted as a bonus pool.
#  7. Suspension is read-only, not signed-out.
#  8. Analytics, the audit trail and the platform switches all answer.
#  9. A destructive act refuses without the typed confirmation.
#
# Everything is created under a `{{unique}}` suffix, so the suite is re-runnable
# against the same database. The only global state it touches is the platform
# row, and it restores it immediately.

# ── Admin login ─────────────────────────────────────────────────

POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "login",
  "details": {
    "set": { "email": "{{adminEmail}}", "password": "{{adminPassword}}" },
    "get": { "token": 1, "user": { "_id": 1, "role": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.user.role" == "admin"

[Captures]
adminToken: jsonpath "$.body.token"
adminId: jsonpath "$.body.user._id"


# ── Public status: no token at all ──────────────────────────────
#
# A client has to be able to learn that signups are closed, or that the app is
# in maintenance, before it has an account. This act is the only anonymous read
# of the settings row.

POST {{serverAddress}}/lesan
{
  "model": "platformSetting",
  "act": "getPlatformStatus",
  "details": {
    "set": {},
    "get": { "signupsEnabled": 1, "maintenanceMode": 1, "aiEnabled": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.signupsEnabled" == true
jsonpath "$.body.maintenanceMode" == false
jsonpath "$.body.aiEnabled" isBoolean
# The projection is enforced: an unrequested field is absent, not null.
jsonpath "$.body.announcement" not exists


# ── A listener for the rest of the suite ────────────────────────

POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "register",
  "details": {
    "set": {
      "username": "cap-{{unique}}",
      "email": "cap-{{unique}}@pejvak.app",
      "password": "password123",
      "displayName": "Cap Tester"
    },
    "get": { "token": 1, "user": { "_id": 1, "role": 1, "status": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.user.role" == "user"
jsonpath "$.body.user.status" == "active"

[Captures]
listenerToken: jsonpath "$.body.token"
listenerId: jsonpath "$.body.user._id"


# ── RBAC: the panel is closed to listeners ──────────────────────

POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "user",
  "act": "adminListUsers",
  "details": { "set": { "page": 1, "limit": 5 }, "get": { "_id": 1 } }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false
jsonpath "$.body.message" contains "requires an admin account"


# A read act is refused for a listener too — the split is between roles, not
# between reads and writes.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "adminGrantSubscription",
  "details": {
    "set": { "userId": "{{listenerId}}", "planCode": "pro" },
    "get": { "planCode": 1, "status": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.body.message" contains "requires an admin account"


# ── Plans are rows ──────────────────────────────────────────────

POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "plan",
  "act": "adminListPlans",
  "details": {
    "set": {},
    "get": { "code": 1, "title": 1, "priceCents": 1, "limits": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.rows" count >= 2
jsonpath "$.body.rows[?(@.code=='free')].limits.historyEntries" includes 500
jsonpath "$.body.rows[?(@.code=='pro')].priceCents" includes 399


# The cap the suite is about to test. It is a throwaway plan rather than an edit
# to `free`, so a failed run can never leave the real paywall at 2 entries.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "plan",
  "act": "adminUpsertPlan",
  "details": {
    "set": {
      "code": "e2e-cap",
      "title": "E2E Cap",
      "description": "Two history entries, used by the test suite.",
      "priceCents": 0,
      "currency": "USD",
      "billingInterval": "month",
      "isActive": true,
      "sortOrder": 99,
      "limits": { "historyEntries": 2, "playlists": 2 }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.code" == "e2e-cap"
jsonpath "$.body.limits.historyEntries" == 2
# A limit that was not sent keeps the value it had, rather than resetting.
jsonpath "$.body.limits.maxTracks" == -1


# `-1` is the only negative limit; anything else would silently mean unlimited.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "plan",
  "act": "adminUpsertPlan",
  "details": {
    "set": { "code": "e2e-cap", "limits": { "historyEntries": -5 } }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false


# ── Account table, filters and the detail view ──────────────────

POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminListUsers",
  "details": {
    "set": { "search": "cap-{{unique}}@pejvak.app", "page": 1, "limit": 5 },
    "get": { "_id": 1, "email": 1, "role": 1, "status": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.total" == 1
jsonpath "$.body.rows[0]._id" == "{{listenerId}}"
jsonpath "$.body.rows[0].planCode" == "free"
# The projection is an allow-list: asking for a field outside it cannot leak it.
jsonpath "$.body.rows[0].password" not exists


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminListUsers",
  "details": {
    "set": { "role": "admin", "page": 1, "limit": 5 },
    "get": { "_id": 1, "email": 1, "role": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.total" >= 1


# A `(` in the search box is a character, not a broken regex.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminListUsers",
  "details": {
    "set": { "search": "(", "page": 1, "limit": 5 },
    "get": { "_id": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminGetUser",
  "details": {
    "set": { "userId": "{{listenerId}}", "sessionsLimit": 5 },
    "get": {
      "user": { "_id": 1, "email": 1, "role": 1, "status": 1 },
      "entitlement": { "planCode": 1, "isPaid": 1 },
      "historyQuota": { "limit": 1, "used": 1 },
      "usage": { "sessionCount": 1 }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.user._id" == "{{listenerId}}"
jsonpath "$.body.entitlement.planCode" == "free"
jsonpath "$.body.entitlement.isPaid" == false
jsonpath "$.body.historyQuota.limit" == 500
jsonpath "$.body.historyQuota.used" == 0
jsonpath "$.body.usage.sessionCount" == 0


# ── The paywall: history is capped, overflow is skipped ─────────
#
# The listener needs one track before sessions can attach to it.

POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "track",
  "act": "registerTrack",
  "details": {
    "set": {
      "title": "Capped Audiobook",
      "contentHash": "cap-{{unique}}",
      "durationSec": 3600,
      "fileSizeBytes": 1048576,
      "isAudiobook": true
    },
    "get": { "_id": 1 }
  }
}

HTTP 200
[Captures]
capTrackId: jsonpath "$.body._id"


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "subscription",
  "act": "adminGrantSubscription",
  "details": {
    "set": {
      "userId": "{{listenerId}}",
      "planCode": "e2e-cap",
      "note": "e2e quota fixture"
    },
    "get": { "reference": 1, "planCode": 1, "status": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.planCode" == "e2e-cap"
jsonpath "$.body.status" == "active"
# A comped grant still writes a receipt, so support can explain the account.
jsonpath "$.body.reference" startsWith "txn_"


# A plan with a live subscriber cannot be archived: the row is what describes
# that account's tier, so archiving it would leave the account undescribable.
# Support has to move or revoke the subscriber first.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "plan",
  "act": "adminUpsertPlan",
  "details": {
    "set": { "code": "e2e-cap", "isActive": false }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false
jsonpath "$.body.message" contains "active subscriber"


POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "getMySubscription",
  "details": {
    "set": {},
    "get": { "planCode": 1, "limits": { "historyEntries": 1 }, "history": { "limit": 1, "used": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.planCode" == "e2e-cap"
jsonpath "$.body.limits.historyEntries" == 2
jsonpath "$.body.history.limit" == 2
jsonpath "$.body.history.used" == 0


# Five sessions against a cap of two: the batch must succeed and store two.
# Refusing the batch would be retried forever and would also drop the
# annotations travelling with it.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "sessions": [
        {
          "clientId": "cap-s1-{{unique}}",
          "contentHash": "cap-{{unique}}",
          "startedAt": 1757000001000,
          "endedAt": 1757000060000,
          "startPositionSec": 0,
          "endPositionSec": 60,
          "durationListenedSec": 60,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        },
        {
          "clientId": "cap-s2-{{unique}}",
          "contentHash": "cap-{{unique}}",
          "startedAt": 1757000002000,
          "endedAt": 1757000120000,
          "startPositionSec": 0,
          "endPositionSec": 120,
          "durationListenedSec": 120,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        },
        {
          "clientId": "cap-s3-{{unique}}",
          "contentHash": "cap-{{unique}}",
          "startedAt": 1757000003000,
          "endedAt": 1757000180000,
          "startPositionSec": 0,
          "endPositionSec": 180,
          "durationListenedSec": 180,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        },
        {
          "clientId": "cap-s4-{{unique}}",
          "contentHash": "cap-{{unique}}",
          "startedAt": 1757000004000,
          "endedAt": 1757000240000,
          "startPositionSec": 0,
          "endPositionSec": 240,
          "durationListenedSec": 240,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        },
        {
          "clientId": "cap-s5-{{unique}}",
          "contentHash": "cap-{{unique}}",
          "startedAt": 1757000005000,
          "endedAt": 1757000300000,
          "startPositionSec": 0,
          "endPositionSec": 300,
          "durationListenedSec": 300,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        }
      ]
    },
    "get": { "syncedSessions": 1, "historySkipped": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.syncedSessions" == 2
jsonpath "$.body.historySkipped" == 3
jsonpath "$.body.historyQuota.limit" == 2
jsonpath "$.body.historyQuota.used" == 2
jsonpath "$.body.historyQuota.remaining" == 0
jsonpath "$.body.historyQuota.unlimited" == false


# Replaying the batch must not duplicate. The two rows that were accepted are
# the newest ones (the quota fills newest-first), so a replay of those two is
# recognised and writes nothing — which is what stops a lost response from
# turning into a duplicate history entry.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "sessions": [
        {
          "clientId": "cap-s4-{{unique}}",
          "contentHash": "cap-{{unique}}",
          "startedAt": 1757000004000,
          "startPositionSec": 0,
          "endPositionSec": 240,
          "durationListenedSec": 240,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        },
        {
          "clientId": "cap-s5-{{unique}}",
          "contentHash": "cap-{{unique}}",
          "startedAt": 1757000005000,
          "startPositionSec": 0,
          "endPositionSec": 300,
          "durationListenedSec": 300,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        }
      ]
    },
    "get": { "syncedSessions": 1, "historySkipped": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.syncedSessions" == 0
jsonpath "$.body.historySkipped" == 0
jsonpath "$.body.historyQuota.used" == 2


# The two that were refused are still refused: they are still over the cap, and
# pretending otherwise would tell the listener their history was lost when it is
# still on their device waiting for an upgrade.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "sessions": [
        {
          "clientId": "cap-s1-{{unique}}",
          "contentHash": "cap-{{unique}}",
          "startedAt": 1757000001000,
          "startPositionSec": 0,
          "endPositionSec": 60,
          "durationListenedSec": 60,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        }
      ]
    },
    "get": { "syncedSessions": 1, "historySkipped": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.syncedSessions" == 0
jsonpath "$.body.historySkipped" == 1
jsonpath "$.body.historyQuota.remaining" == 0


# The cap is visible in the panel too, from the same derivation.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminGetUser",
  "details": {
    "set": { "userId": "{{listenerId}}", "sessionsLimit": 5 },
    "get": {
      "entitlement": { "planCode": 1 },
      "historyQuota": { "used": 1 },
      "usage": { "sessionCount": 1 },
      "recentSessions": { "startedAt": 1 }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.entitlement.planCode" == "e2e-cap"
jsonpath "$.body.historyQuota.used" == 2
jsonpath "$.body.usage.sessionCount" == 2
jsonpath "$.body.recentSessions" count == 2


# The operator's history view pages the sessions and lets the projection pick
# the fields, the same way the listener's own history does.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminGetUserHistory",
  "details": {
    "set": { "userId": "{{listenerId}}", "page": 1, "limit": 5 },
    "get": { "contentHash": 1, "durationListenedSec": 1, "startedAt": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.total" == 2
jsonpath "$.body.rows[0].contentHash" == "cap-{{unique}}"
jsonpath "$.body.rows[0].durationListenedSec" isInteger
jsonpath "$.body.rows[0].playbackSpeed" not exists


# The plan filter resolves through the subscription, so it agrees with the row
# above rather than with a denormalised column.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminListUsers",
  "details": {
    "set": { "planCode": "e2e-cap", "page": 1, "limit": 5 },
    "get": { "_id": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.total" >= 1


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "subscription",
  "act": "adminRevokeSubscription",
  "details": {
    "set": { "userId": "{{listenerId}}", "reason": "e2e: quota fixture done" },
    "get": { "revoked": 1, "planCode": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.revoked" == true
jsonpath "$.body.planCode" == "free"


# The cancelled row is kept: it is the answer to "why can this person not
# sync?". The table pages it like every other admin list.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "subscription",
  "act": "adminListSubscriptions",
  "details": {
    "set": {
      "search": "cap-{{unique}}@pejvak.app",
      "page": 1,
      "limit": 5
    },
    "get": { "planCode": 1, "status": 1, "user": { "email": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.rows[0].planCode" == "e2e-cap"
jsonpath "$.body.rows[0].status" == "canceled"
jsonpath "$.body.rows[0].user.email" == "cap-{{unique}}@pejvak.app"


# Revoking is immediate: access is gone, not scheduled to end.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "getMySubscription",
  "details": {
    "set": {},
    "get": { "planCode": 1, "isPaid": 1, "limits": { "historyEntries": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.planCode" == "free"
jsonpath "$.body.isPaid" == false
jsonpath "$.body.limits.historyEntries" == 500


# ── The money path ──────────────────────────────────────────────

POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "createCheckout",
  "details": {
    "set": { "planCode": "pro", "provider": "manual" },
    "get": { "reference": 1, "status": 1, "amountCents": 1, "planCode": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.status" == "manual"
jsonpath "$.body.amountCents" == 399
jsonpath "$.body.planCode" == "pro"

[Captures]
checkoutReference: jsonpath "$.body.reference"


# Nothing is granted until the payment is confirmed.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "getMySubscription",
  "details": {
    "set": {},
    "get": { "planCode": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.planCode" == "free"


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "billingTransaction",
  "act": "adminConfirmTransaction",
  "details": {
    "set": { "reference": "{{checkoutReference}}", "note": "e2e manual" },
    "get": { "status": 1, "alreadyProcessed": 1, "planCode": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.status" == "paid"
jsonpath "$.body.alreadyProcessed" == false
jsonpath "$.body.planCode" == "pro"


# Confirming twice must not extend the period a second time.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "billingTransaction",
  "act": "adminConfirmTransaction",
  "details": {
    "set": { "reference": "{{checkoutReference}}" },
    "get": { "alreadyProcessed": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.alreadyProcessed" == true


POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "getMySubscription",
  "details": {
    "set": {},
    "get": {
      "planCode": 1,
      "isPaid": 1,
      "status": 1,
      "cancelAtPeriodEnd": 1,
      "limits": { "historyEntries": 1 },
      "history": { "unlimited": 1 },
      "currentPeriodEnd": 1
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.planCode" == "pro"
jsonpath "$.body.isPaid" == true
jsonpath "$.body.status" == "active"
jsonpath "$.body.cancelAtPeriodEnd" == false
# Pro is unlimited, and unlimited is `-1`, not a large number.
jsonpath "$.body.limits.historyEntries" == -1
jsonpath "$.body.history.unlimited" == true
jsonpath "$.body.currentPeriodEnd" isInteger


# The same checkout cannot be started again while the plan is active.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "createCheckout",
  "details": {
    "set": { "planCode": "pro", "provider": "manual" },
    "get": { "reference": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false


# Cancelling stops renewal and keeps the days already paid for.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "cancelMySubscription",
  "details": {
    "set": {},
    "get": { "cancelAtPeriodEnd": 1, "status": 1, "planCode": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.cancelAtPeriodEnd" == true
jsonpath "$.body.status" == "active"
jsonpath "$.body.planCode" == "pro"


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "billingTransaction",
  "act": "adminRefundTransaction",
  "details": {
    "set": { "reference": "{{checkoutReference}}", "reason": "e2e refund" },
    "get": { "refunded": 1, "status": 1, "accessRevoked": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.refunded" == true
jsonpath "$.body.status" == "refunded"
jsonpath "$.body.accessRevoked" == true


# A refund ends access now, and the ledger keeps the receipt.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "getMySubscription",
  "details": {
    "set": {},
    "get": { "planCode": 1, "isPaid": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.planCode" == "free"
jsonpath "$.body.isPaid" == false


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "billingTransaction",
  "act": "adminListTransactions",
  "details": {
    "set": { "search": "{{checkoutReference}}", "page": 1, "limit": 5 },
    "get": { "status": 1, "amountCents": 1, "userId": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.total" == 1
jsonpath "$.body.rows[0].status" == "refunded"
jsonpath "$.body.rows[0].amountCents" == 399
# Transactions carry the owner as a string so the receipt survives deletion.
jsonpath "$.body.rows[0].userId" == "{{listenerId}}"


# ── AI credits ──────────────────────────────────────────────────

POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "aiUsage",
  "act": "getMyAiUsage",
  "details": {
    "set": {},
    "get": { "allowance": 1, "bonusCredits": 1, "remaining": 1, "periodKey": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.allowance" == 0
jsonpath "$.body.bonusCredits" == 0
jsonpath "$.body.remaining" == 0
jsonpath "$.body.periodKey" isString


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "aiUsage",
  "act": "adminGrantAiCredits",
  "details": {
    "set": { "userId": "{{listenerId}}", "credits": 25, "note": "e2e grant" },
    "get": { "granted": 1, "bonusCredits": 1, "creditsUsed": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.granted" == 25
jsonpath "$.body.bonusCredits" == 25
jsonpath "$.body.creditsUsed" == 0


# A grant adds to a bonus pool; it never rewrites what was consumed.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "aiUsage",
  "act": "getMyAiUsage",
  "details": {
    "set": {},
    "get": { "bonusCredits": 1, "used": 1, "remaining": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.bonusCredits" == 25
jsonpath "$.body.used" == 0
jsonpath "$.body.remaining" == 25


# ── Suspension is read-only, not signed-out ─────────────────────

POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminUpdateUser",
  "details": {
    "set": {
      "userId": "{{listenerId}}",
      "status": "suspended",
      "suspendedReason": "e2e: chargeback under review"
    },
    "get": { "_id": 1, "status": 1, "suspendedReason": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.status" == "suspended"


# Writes are refused, with the reason the listener will see in the app.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "sessions": [
        {
          "clientId": "suspended-{{unique}}",
          "contentHash": "cap-{{unique}}",
          "startedAt": 1757000009000,
          "startPositionSec": 0,
          "endPositionSec": 10,
          "durationListenedSec": 10,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        }
      ]
    },
    "get": { "syncedSessions": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false
jsonpath "$.body.message" contains "read-only"
jsonpath "$.body.message" contains "chargeback"


# Reads still work: a client that retried a 401 forever would be unusable, and
# the account page has to be able to explain itself.
POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "user",
  "act": "getMe",
  "details": {
    "set": {},
    "get": { "_id": 1, "status": 1, "suspendedReason": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.status" == "suspended"
jsonpath "$.body.suspendedReason" contains "chargeback"


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminUpdateUser",
  "details": {
    "set": { "userId": "{{listenerId}}", "status": "active" },
    "get": { "_id": 1, "status": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.status" == "active"


POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "track",
  "act": "syncLocalData",
  "details": {
    "set": {
      "sessions": [
        {
          "clientId": "suspended-{{unique}}",
          "contentHash": "cap-{{unique}}",
          "startedAt": 1757000009000,
          "startPositionSec": 0,
          "endPositionSec": 10,
          "durationListenedSec": 10,
          "playbackSpeed": 1,
          "completed": false,
          "interrupted": false
        }
      ]
    },
    "get": { "syncedSessions": 1, "historySkipped": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.syncedSessions" == 1


# ── Analytics ───────────────────────────────────────────────────
#
# Every figure is derived from the rows that define it; these assertions check
# the shape and the internal consistency, not a snapshot of the numbers.

POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "playbackSession",
  "act": "adminGetOverview",
  "details": {
    "set": {},
    "get": {
      "users": { "total": 1, "active": 1 },
      "content": { "sessions": 1 },
      "quota": { "freeHistoryLimit": 1 },
      "revenue": { "payingUsers": 1, "planDistribution": { "planCode": 1 } }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.users.total" >= 1
jsonpath "$.body.users.active" >= 1
jsonpath "$.body.content.sessions" >= 1
jsonpath "$.body.quota.freeHistoryLimit" == 500
jsonpath "$.body.revenue.payingUsers" >= 0
jsonpath "$.body.revenue.planDistribution" count >= 2


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "playbackSession",
  "act": "adminGetTimeseries",
  "details": {
    "set": { "days": 7 },
    "get": { "days": { "date": 1, "signups": 1, "sessions": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.days" count == 7
# Empty days are present with zeros, not omitted — a chart must not draw a line
# through a gap as if it were continuous activity.
jsonpath "$.body.days[6].date" isString
jsonpath "$.body.days[6].signups" isInteger
jsonpath "$.body.days[6].sessions" isInteger


# The window is clamped, not trusted: a client cannot ask for 10000 buckets.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "playbackSession",
  "act": "adminGetTimeseries",
  "details": {
    "set": { "days": 10000 },
    "get": { "days": { "date": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.days" count == 90


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "playbackSession",
  "act": "adminGetTopTracks",
  "details": {
    "set": { "days": 30, "limit": 5 },
    "get": { "rows": { "title": 1, "listenTimeSec": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.rows" count >= 1
jsonpath "$.body.rows[0].title" isString
jsonpath "$.body.rows[0].listenTimeSec" >= 1


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "playbackSession",
  "act": "adminGetRetention",
  "details": {
    "set": { "cohorts": 4, "weeks": 4 },
    "get": {
      "cohorts": { "cohortStart": 1, "size": 1 },
      "weeks": 1
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.cohorts" count == 4
jsonpath "$.body.weeks" == 4


# ── The audit trail ─────────────────────────────────────────────
#
# Every mutation above should have left a line, and the line has to survive the
# account it names — which is why actor and target are strings.

POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "adminAuditLog",
  "act": "adminListAuditLogs",
  "details": {
    "set": { "targetId": "e2e-cap", "page": 1, "limit": 10 },
    "get": { "actorId": 1, "actorRole": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.total" >= 1
jsonpath "$.body.rows[0].actorId" == "{{adminId}}"
jsonpath "$.body.rows[0].actorRole" == "admin"


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "adminAuditLog",
  "act": "adminListAuditLogs",
  "details": {
    "set": {
      "action": "subscription.grant",
      "targetId": "{{listenerId}}",
      "page": 1,
      "limit": 5
    },
    "get": { "action": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.total" >= 1


# ── Platform switches ───────────────────────────────────────────
#
# Only `announcement` is flipped here: it is the one switch that is safe to
# leave in an unexpected state if the run aborts.

POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "platformSetting",
  "act": "adminUpdatePlatformSetting",
  "details": {
    "set": { "announcement": "e2e-{{unique}}" },
    "get": { "announcement": 1, "signupsEnabled": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.announcement" == "e2e-{{unique}}"
jsonpath "$.body.signupsEnabled" == true


# The public read agrees with the admin read: one row, one answer.
POST {{serverAddress}}/lesan
{
  "model": "platformSetting",
  "act": "getPlatformStatus",
  "details": {
    "set": {},
    "get": { "announcement": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.announcement" == "e2e-{{unique}}"
jsonpath "$.body.signupsEnabled" not exists


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "platformSetting",
  "act": "adminUpdatePlatformSetting",
  "details": {
    "set": { "announcement": "" },
    "get": { "announcement": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true


# An emptied announcement reads back as `null`, not as an empty banner.
POST {{serverAddress}}/lesan
{
  "model": "platformSetting",
  "act": "getPlatformStatus",
  "details": {
    "set": {},
    "get": { "announcement": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.announcement" == null


# The panel reads the same singleton, including the row key, so the settings
# page and the public banner cannot disagree.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "platformSetting",
  "act": "adminGetPlatformSetting",
  "details": {
    "set": {},
    "get": {
      "key": 1,
      "signupsEnabled": 1,
      "aiEnabled": 1,
      "maintenanceMode": 1,
      "announcement": 1
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.key" == "platform"
jsonpath "$.body.signupsEnabled" == true
jsonpath "$.body.announcement" == null


# ── Destructive acts need a typed confirmation ──────────────────

POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "register",
  "details": {
    "set": {
      "username": "victim-{{unique}}",
      "email": "victim-{{unique}}@pejvak.app",
      "password": "password123"
    },
    "get": { "token": 1, "user": { "_id": 1 } }
  }
}

HTTP 200
[Captures]
victimId: jsonpath "$.body.user._id"


# A reset returns the new password exactly once, so the operator can hand it
# back to the listener. It is never written to the audit log.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminResetUserPassword",
  "details": {
    "set": { "userId": "{{victimId}}" },
    "get": { "userId": 1, "password": 1, "generated": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.userId" == "{{victimId}}"
jsonpath "$.body.generated" == true
jsonpath "$.body.password" isString

[Captures]
victimPassword: jsonpath "$.body.password"


# The generated password actually opens the account.
POST {{serverAddress}}/lesan
{
  "model": "user",
  "act": "login",
  "details": {
    "set": {
      "email": "victim-{{unique}}@pejvak.app",
      "password": "{{victimPassword}}"
    },
    "get": { "token": 1, "user": { "_id": 1 } }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.user._id" == "{{victimId}}"


# A confirmation dialog the client draws is not a guard; the API refuses the
# call that skipped it.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminDeleteUser",
  "details": {
    "set": { "userId": "{{victimId}}", "confirmEmail": "wrong@pejvak.app" },
    "get": { "deleted": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false
jsonpath "$.body.message" contains "confirm the deletion"


# An admin cannot delete themselves out of the panel.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminDeleteUser",
  "details": {
    "set": { "userId": "{{adminId}}", "confirmEmail": "{{adminEmail}}" },
    "get": { "deleted": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminDeleteUser",
  "details": {
    "set": {
      "userId": "{{victimId}}",
      "confirmEmail": "victim-{{unique}}@pejvak.app"
    },
    "get": { "deleted": 1, "userId": 1, "purged": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.deleted" == true
jsonpath "$.body.userId" == "{{victimId}}"
jsonpath "$.body.purged" exists


POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminGetUser",
  "details": {
    "set": { "userId": "{{victimId}}" },
    "get": { "user": { "_id": 1 } }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false


# ── Admin grants: forever, duration and usage ───────────────────
#
# A grant is a plan plus one amount. `forever` has no end; `duration` ends on a
# calendar date; `usage` caps individual resources and ends the whole grant when
# any cap is reached. The AI meter is deliberately not a cap here.

# A usage grant must name at least one cap.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "subscription",
  "act": "adminGrantSubscription",
  "details": {
    "set": { "userId": "{{listenerId}}", "planCode": "pro", "mode": "usage" },
    "get": { "planCode": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false
jsonpath "$.body.message" contains "cap"


# A negative cap is refused: the entitlement layer treats negatives as
# unlimited, so `-5` would silently mean "no limit".
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "subscription",
  "act": "adminGrantSubscription",
  "details": {
    "set": {
      "userId": "{{listenerId}}",
      "planCode": "pro",
      "mode": "usage",
      "caps": { "historyEntries": -5 }
    },
    "get": { "planCode": 1 }
  }
}

HTTP 501
[Asserts]
jsonpath "$.success" == false


# Forever: the plan has no end date at all.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "subscription",
  "act": "adminGrantSubscription",
  "details": {
    "set": { "userId": "{{listenerId}}", "planCode": "pro", "mode": "forever" },
    "get": {
      "planCode": 1,
      "status": 1,
      "grantMode": 1,
      "currentPeriodEnd": 1
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.planCode" == "pro"
jsonpath "$.body.status" == "active"
jsonpath "$.body.grantMode" == "forever"
jsonpath "$.body.currentPeriodEnd" not exists


POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "getMySubscription",
  "details": {
    "set": {},
    "get": {
      "planCode": 1,
      "isPaid": 1,
      "status": 1,
      "grantMode": 1,
      "limits": { "historyEntries": 1 }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.planCode" == "pro"
jsonpath "$.body.isPaid" == true
jsonpath "$.body.grantMode" == "forever"
jsonpath "$.body.limits.historyEntries" == -1


# Duration: a calendar end date, one week out.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "subscription",
  "act": "adminGrantSubscription",
  "details": {
    "set": {
      "userId": "{{listenerId}}",
      "planCode": "pro",
      "mode": "duration",
      "duration": { "value": 1, "unit": "week" }
    },
    "get": {
      "planCode": 1,
      "status": 1,
      "grantMode": 1,
      "currentPeriodEnd": 1,
      "periodEnd": 1
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.grantMode" == "duration"
jsonpath "$.body.currentPeriodEnd" isInteger
jsonpath "$.body.periodEnd" isInteger


# Usage: caps override only the resources they name. Pro is unlimited history,
# so a 5000-entry cap lowers it; playlists is capped at 1.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "subscription",
  "act": "adminGrantSubscription",
  "details": {
    "set": {
      "userId": "{{listenerId}}",
      "planCode": "pro",
      "mode": "usage",
      "caps": { "historyEntries": 5000, "playlists": 1 }
    },
    "get": {
      "planCode": 1,
      "status": 1,
      "grantMode": 1,
      "currentPeriodEnd": 1,
      "usageCaps": { "historyEntries": 1, "playlists": 1, "maxTracks": 1 }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.grantMode" == "usage"
jsonpath "$.body.usageCaps.historyEntries" == 5000
jsonpath "$.body.usageCaps.playlists" == 1
jsonpath "$.body.usageCaps.maxTracks" not exists
jsonpath "$.body.currentPeriodEnd" not exists


POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "getMySubscription",
  "details": {
    "set": {},
    "get": {
      "planCode": 1,
      "isPaid": 1,
      "status": 1,
      "grantMode": 1,
      "usageCaps": { "historyEntries": 1, "playlists": 1 },
      "limits": { "historyEntries": 1, "playlists": 1, "maxTracks": 1 }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.planCode" == "pro"
jsonpath "$.body.isPaid" == true
jsonpath "$.body.grantMode" == "usage"
jsonpath "$.body.usageCaps.historyEntries" == 5000
jsonpath "$.body.usageCaps.playlists" == 1
jsonpath "$.body.limits.historyEntries" == 5000
jsonpath "$.body.limits.playlists" == 1
# An uncapped resource keeps the plan's own limit.
jsonpath "$.body.limits.maxTracks" == -1


# The fixture already has two stored sessions. A cap of two is therefore
# reached immediately: the grant ends and the account falls back to free.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "subscription",
  "act": "adminGrantSubscription",
  "details": {
    "set": {
      "userId": "{{listenerId}}",
      "planCode": "pro",
      "mode": "usage",
      "caps": { "historyEntries": 2 }
    },
    "get": { "planCode": 1, "grantMode": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true


POST {{serverAddress}}/lesan
token: {{listenerToken}}
{
  "model": "subscription",
  "act": "getMySubscription",
  "details": {
    "set": {},
    "get": {
      "planCode": 1,
      "isPaid": 1,
      "status": 1,
      "limits": { "historyEntries": 1 }
    }
  }
}

HTTP 200
[Asserts]
jsonpath "$.body.planCode" == "free"
jsonpath "$.body.isPaid" == false
jsonpath "$.body.status" == "expired"
jsonpath "$.body.limits.historyEntries" == 500


# ── Cleanup ─────────────────────────────────────────────────────
#
# The fixture account is deleted rather than left behind. Each run creates an
# account, a track, a subscription, a payment and an AI grant, and a database
# that only ever grows makes the panel's own numbers meaningless.

POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "user",
  "act": "adminDeleteUser",
  "details": {
    "set": {
      "userId": "{{listenerId}}",
      "confirmEmail": "cap-{{unique}}@pejvak.app"
    },
    "get": { "deleted": 1, "purged": 1 }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.deleted" == true
# The subscription went with the account; the receipts did not.
jsonpath "$.body.purged" exists


# Only now, with nothing subscribed, can the throwaway plan be archived. The
# plan row is what describes a subscriber's tier, so it must not disappear from
# under them — which is why the attempt is refused while one remains.
POST {{serverAddress}}/lesan
token: {{adminToken}}
{
  "model": "plan",
  "act": "adminUpsertPlan",
  "details": {
    "set": { "code": "e2e-cap", "isActive": false }
  }
}

HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.body.isActive" == false
