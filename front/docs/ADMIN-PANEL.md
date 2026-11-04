# Pejvak Admin Panel — API Contract and Build Guide

> **Status:** the backend is shipped; the web panel is **not built**.
> Last verified against `back/src/admin/`, `back/models/`, and the generated
> declarations on **2026-11-04**.
>
> **This file supersedes `PLAN.md` §2 C1 and Phase 6 for admin-specific claims.**
> Those sections were written before RBAC existed and still say the panel is
> impossible. It is not: the backend has roles, 22 admin acts, entitlements,
> grants, billing, analytics, an audit log and platform switches.
>
> Read `front/AGENTS.md` first for the web app's hard rules. Read this file before
> writing an admin route, action, or table.

---

## 1. What the panel is

A cross-user operator console at `/admin`, separate from the listener shell. It is
the only part of the web app that may read or write another account's data.

There are two operator roles and one listener role:

| `user.role` | Can read `/admin` | Can mutate | Notes |
|---|---|---|---|
| `user` | No | No | Must not learn that `/admin` exists. |
| `support` | Yes — every admin read act | No | For tickets: look at an account, its history, payments and audit trail. |
| `admin` | Yes | Yes | Everything, with self-protection and last-admin guards. |

The role is named **`user`**, not `listener`. Legacy accounts have no stored role
and are normalised to `user` on read; never compare a raw `role` field without a
fallback.

### 1.1 Screens

The API does not imply this route map, but it is the one the acts were shaped for:

| Route | Purpose | Primary acts |
|---|---|---|
| `/admin` | Landing dashboard | `adminGetOverview` |
| `/admin/analytics` | Charts and cohorts | `adminGetTimeseries`, `adminGetTopTracks`, `adminGetRetention` |
| `/admin/users` | Account table | `adminListUsers` |
| `/admin/users/[id]` | One account, actions and recent history | `adminGetUser`, `adminGetUserHistory`, `adminUpdateUser`, `adminResetUserPassword`, `adminGrantSubscription`, `adminRevokeSubscription`, `adminGrantAiCredits`, `adminDeleteUser`, `adminListAuditLogs` |
| `/admin/plans` | Catalogue and editor | `adminListPlans`, `adminUpsertPlan` |
| `/admin/subscriptions` | Who is on what, until when | `adminListSubscriptions`, `adminRevokeSubscription` |
| `/admin/transactions` | Payment ledger and work queue | `adminListTransactions`, `adminConfirmTransaction`, `adminRefundTransaction` |
| `/admin/audit` | Operator activity feed | `adminListAuditLogs` |
| `/admin/platform` | Global switches | `adminGetPlatformSetting`, `adminUpdatePlatformSetting` |

There is no separate `/admin/ai` screen. AI credits are granted from an account's
detail page; the meter itself is listener-facing (`getMyAiUsage`).

### 1.2 What the panel must not become

- **No content browsing.** An operator sees counts and recent sessions, not the
  listener's library as a browsable product. "Why is this account failing?" is the
  question; "what does this person listen to?" is a different product decision.
- **No reuse of `getMy*` acts.** Every listener read hard-filters `user._id`.
  Parameterising that filter removes the only security boundary in the product.
- **No client-side authority.** A hidden button is not a permission. The backend's
  `requireSupport` / `requireAdmin` is the control; the frontend's guard is a
  convenience and a 404.
- **No optimistic mutation UI.** Changing a plan or a subscription is not a speed
  slider. Await the server, then re-read or use the returned body.

---

## 2. Transport, auth and projections

### 2.1 Wire format

Every admin act uses the same transport as the listener app:

```
POST {BACKEND_URL}/lesan
token: <JWT>                 ← header name is exactly `token`, no `Bearer`
{
  "model": "<Lesan schema>",  ← NOT the source folder
  "act": "<act name>",
  "details": { "set": { … }, "get": { … } }
}
```

The envelope is `{ success: boolean, body: unknown }`. **Check `success` before
reading `body`.** Use `callAct` from `@/lib/call-act`; it already does this and
reads the token from the `httpOnly` cookie.

### 2.2 Schema is not folder

Lesan routes on `(model, act)`. The admin acts are registered under the resource
they operate on, not under a synthetic `admin` model:

| Schema (`model`) | Acts |
|---|---|
| `user` | `adminListUsers`, `adminGetUser`, `adminUpdateUser`, `adminDeleteUser`, `adminResetUserPassword`, `adminGetUserHistory` |
| `playbackSession` | `adminGetOverview`, `adminGetTimeseries`, `adminGetTopTracks`, `adminGetRetention` |
| `plan` | `adminListPlans`, `adminUpsertPlan` |
| `subscription` | `adminGrantSubscription`, `adminRevokeSubscription`, `adminListSubscriptions` |
| `billingTransaction` | `adminListTransactions`, `adminConfirmTransaction`, `adminRefundTransaction` |
| `adminAuditLog` | `adminListAuditLogs` |
| `platformSetting` | `adminGetPlatformSetting`, `adminUpdatePlatformSetting` |
| `aiUsage` | `adminGrantAiCredits` |

Sending `model: "admin"` fails validation with a message that looks like an auth
problem.

### 2.3 `get` is an allow-list, not a wish list

Every validator declares the exact projection leaves it accepts. Leaves are
`0 | 1` flags, never output types. Two shapes exist:

- **Row-shaped acts** — list/detail acts over a model. `get` describes **one row**.
  The list wrapper is added by the act and is never projected away.
- **Response-shaped acts** — computed responses (entitlement, quota, analytics,
  grant result, delete result). `get` describes the whole response.

For computed acts the backend runs `pickByGet` after assembling the response. An
absent or empty `get` returns the complete response; a non-empty `get` keeps only
the requested leaves. Prefer explicit projections in the frontend, but see
[§8 Known gaps](#8-known-gaps-and-traps) before assuming every field is requestable.

Generated types are vendored at `front/src/types/declarations/selectInp.ts`
(byte-identical to `back/declarations/selectInp.ts`). Do not hand-write admin
request/response types and do not regenerate the file in `front/`; run
`npm run check` and refresh the vendored copy only when the backend changes.

### 2.4 Pagination

Admin lists return:

```ts
{ rows: T[], total: number, page: number, limit: number }
```

`page` defaults to `1`, `limit` defaults to `25`, and both are clamped:
`page >= 1`, `limit` in `1…200`. `total` is the count **before** paging.

Exceptions:

- `adminListPlans` is not paged. It returns `{ rows, total: rows.length, page: 1,
  limit: rows.length }`; `limit` is therefore `0` when there are no plans.
- `adminGetTopTracks` returns `{ days, rows }`, not the paged wrapper.
- `adminGetRetention` returns `{ cohorts, weeks }`.

### 2.5 Filtering, search and time

- Search is a **case-insensitive substring** match. The backend escapes the input
  before it becomes a regex, so `(` is safe and `.*` is literal.
- `role` and `status` filters handle pre-RBAC rows: `role=user` and
  `status=active` also match documents where the field is absent.
- `planCode=free` in `adminListUsers` means "not on a running paid subscription",
  not "a `free` row exists". There is no `free` subscription row.
- `from` / `to` are **epoch milliseconds**, inclusive.
- Model `createdAt` / `updatedAt` / `paidAt` / `refundedAt` are `Date` values and
  arrive as ISO strings in JSON. Numeric fields (`startedAt`, `currentPeriodEnd`,
  `firstActiveAt`, analytics timestamps) stay numbers. Do not send an ISO string
  where a numeric bound is expected.

---

## 3. Authorization in the web app

### 3.1 The backend guards

| Guard | Applies to | Behaviour |
|---|---|---|
| `requireSupport` | all 12 read acts | `admin` or `support`; otherwise throws `"This action requires an admin account"` |
| `requireAdmin` | all 10 mutating acts | `admin` only; same message |

A support token that calls a mutating act is refused **by the backend**, even if
the UI exposed the button.

### 3.2 The frontend guard

1. **`getMe` must expose `role` and `status`.** The current `CurrentUser` shape and
   `USER_GET` only request identity fields. Extend both, parse `role ?? "user"` and
   `status ?? "active"`, and keep the listener shell working unchanged.
2. **`src/app/(admin)/admin/layout.tsx` is the gate.** It calls `getMe` and renders
   `notFound()` for a `user`. A signed-in listener must not learn that `/admin`
   exists. `support` and `admin` both render the layout; the layout passes the role
   to navigation so mutating controls can be hidden for support.
3. **Every admin Server Action starts with its own guard.** Put
   `requireAdmin()` / `requireSupport()` in a normal (non-`"use server"`) module and
   call it as the first statement of the action. Do not rely on the layout: a
   Server Action is a POST to its own route and can be invoked directly.
4. **`proxy.ts` stays a cheap cookie check.** It cannot know a role without a
   backend round trip. Do not add role logic there and never redirect a POST.
5. **Do not render a 403 page.** The layout returns `notFound()`. A support user
   who reaches a mutation should get a clear inline refusal, not a broken page.

Recommended response for a direct support mutation:

- guard returns `fail("validation", "This action requires an admin account")` or a
  new `forbidden` failure kind;
- do **not** classify it as `unauthorized`, or `callAct` will clear the cookie and
  sign the operator out.

### 3.3 `getMe` and legacy roles

`getMe` reads the raw user document; it does not go through `resolveEntitlement`.
The backend's `setUser` normalises legacy documents for the request context, but
the `getMe` response still needs a frontend fallback. Treat a missing `role` as
`user` and a missing `status` as `active`.

---

## 4. Act reference

The quick index below is the whole surface. The detailed sections give the exact
`set` shape, response shape, defaults, and refusal cases.

| Act | Model | Auth | Returns |
|---|---|---|---|
| `adminListUsers` | `user` | support | paged account rows + plan/subscription/usage |
| `adminGetUser` | `user` | support | account, entitlement, quota, usage, recent sessions |
| `adminGetUserHistory` | `user` | support | paged playback sessions |
| `adminUpdateUser` | `user` | admin | updated safe user |
| `adminDeleteUser` | `user` | admin | `{ deleted, userId, purged }` |
| `adminResetUserPassword` | `user` | admin | `{ userId, password, generated }` |
| `adminGetOverview` | `playbackSession` | support | dashboard aggregate |
| `adminGetTimeseries` | `playbackSession` | support | per-UTC-day points |
| `adminGetTopTracks` | `playbackSession` | support | ranked rows |
| `adminGetRetention` | `playbackSession` | support | weekly cohorts |
| `adminListPlans` | `plan` | support | plan rows + live subscriber counts |
| `adminUpsertPlan` | `plan` | admin | plan row |
| `adminGrantSubscription` | `subscription` | admin | grant result |
| `adminRevokeSubscription` | `subscription` | admin | revoke result |
| `adminListSubscriptions` | `subscription` | support | paged subscription rows |
| `adminListTransactions` | `billingTransaction` | support | paged ledger rows |
| `adminConfirmTransaction` | `billingTransaction` | admin | completion result |
| `adminRefundTransaction` | `billingTransaction` | admin | refund result |
| `adminListAuditLogs` | `adminAuditLog` | support | paged audit rows |
| `adminGetPlatformSetting` | `platformSetting` | support | global switches |
| `adminUpdatePlatformSetting` | `platformSetting` | admin | global switches |
| `adminGrantAiCredits` | `aiUsage` | admin | credit grant result |

### 4.1 Users

#### `adminListUsers` — `user`

**Set**

| Field | Type | Default / constraint |
|---|---|---|
| `page` | number | `1` |
| `limit` | number | `25`, clamped `1…200` |
| `search` | string? | substring of `username`, `email`, `displayName`; escaped |
| `role` | `user \| admin \| support`? | legacy rows count as `user` |
| `status` | `active \| suspended \| deleted`? | legacy rows count as `active` |
| `planCode` | string? | `free` means "no running subscription"; any other code matches active/trialing with no end or a future end |
| `sortBy` | `createdAt \| updatedAt \| email \| username \| displayName`? | `createdAt` |
| `sortOrder` | `asc \| desc`? | `desc` |

**Get** — one safe user row (`safeUserStruct`):

`_id`, `username`, `email`, `displayName`, `avatarUrl`, `role`, `status`,
`suspendedAt`, `suspendedReason`, `setting`, `createdAt`, `updatedAt`.

**Response** — `{ rows, total, page, limit }`; each row contains the projected
safe fields plus **computed columns that are always returned**:

```ts
{
  ...safeUser,
  role: string,               // normalised
  status: string,             // normalised
  planCode: string,           // latest subscription row's planCode, or "free"
  subscription: {             // latest subscription row, or null
    userId, planCode, status, currentPeriodEnd, cancelAtPeriodEnd
  } | null,
  usage: {
    sessionCount: number,
    listenTimeSec: number,
    lastActiveAt: number | null
  }
}
```

`planCode` and `subscription` are read from the **latest subscription row**, not
from `resolveEntitlement`. See [§8](#8-known-gaps-and-traps). Use
`adminGetUser` when the answer must be authoritative.

**Refusals:** none beyond auth. Invalid enum values fail validation.

#### `adminGetUser` — `user`

**Set**

| Field | Type | Default |
|---|---|---|
| `userId` | ObjectId string | required |
| `sessionsLimit` | number | `10`, clamped `0…50`; `0` omits recent sessions |

**Get** — response-shaped:

```ts
{
  user?: SafeUser,
  entitlement?: {
    planCode, planTitle, isPaid, limits, subscriptionStatus,
    currentPeriodEnd?, cancelAtPeriodEnd, autoRenew, startedAt?,
    grantMode?, usageCaps?          // present at runtime, not requestable today
  },
  historyQuota?: { limit, used, remaining, unlimited },
  usage?: {
    sessionCount, listenTimeSec, firstActiveAt, lastActiveAt,
    trackCount, storageBytes, annotationCount, playlistCount,
    contextCount, onlineCollectionCount
  },
  recentSessions?: Array<{
    _id, contentHash, startedAt, endedAt, durationListenedSec,
    startPositionSec, endPositionSec, playbackSpeed, completed,
    interrupted, seeked, deviceInfo, contextType, contextKey,
    track: { title }
  }>
}
```

Notes:

- `entitlement.subscriptionStatus` is `none | active | trialing | past_due |
  canceled | expired`. It is **not** called `status`.
- `limits` uses `-1` for unlimited.
- `historyQuota.limit` is `-1` and `remaining` is `-1` when unlimited.
- `usage` is derived from live counts, not stored.
- All operators may use this act, including `support`.

**Refusals:** `"User not found"`.

#### `adminGetUserHistory` — `user`

**Set**

| Field | Type | Default |
|---|---|---|
| `userId` | ObjectId string | required |
| `page` | number | `1` |
| `limit` | number | `25`, clamped `1…200` |
| `from` | number? | inclusive epoch ms on `startedAt` |
| `to` | number? | inclusive epoch ms on `startedAt` |
| `contentHash` | string? | exact match |

**Get** — one `playbackSession` row via
`selectStruct("playbackSession", 1, ["clientId", "deviceInfo"])`.

**Response** — `{ rows, total, page, limit }`, sorted `startedAt: -1`.

The default `$project` includes `_id`, `contentHash`, `startedAt`, `endedAt`,
positions, `durationListenedSec`, `playbackSpeed`, `completed`, `interrupted`,
`seeked`, `contextType`, `contextKey`, `track.title`. `clientId` and `deviceInfo`
are deliberately excluded from the allow-list. If you need `deviceInfo`, the
backend contract must change; do not invent a second read.

**Refusals:** `"User not found"`.

#### `adminUpdateUser` — `user`

**Set**

| Field | Type | Constraint |
|---|---|---|
| `userId` | ObjectId string | required |
| `username` | string? | |
| `email` | email string? | must be unique; exact-match uniqueness check |
| `displayName` | string? | |
| `avatarUrl` | string? | |
| `role` | `user \| admin \| support`? | cannot change own role |
| `status` | `active \| suspended`? | cannot change own status; `deleted` is not accepted here |
| `suspendedReason` | string? | used when suspending, or edits the reason while already suspended |

**Get** — `safeUserStruct()` (same allow-list as `adminListUsers`).

**Behaviour**

- Suspending sets `suspendedAt = now` and `suspendedReason`; reactivating unsets
  both and clears the reason.
- Demoting an admin is refused if there is no other active admin.
- Email collision is refused.
- Every accepted change writes `user.update` to the audit log with before/after
  values.
- An empty change set returns the current user without an audit write.

**Refusals**

- `"User not found"`
- `"You cannot change your own role"`
- `"You cannot change the status of your own account"`
- `"There must be at least one active admin"`
- `"Another account already uses that email"`

#### `adminDeleteUser` — `user`

**Set**

| Field | Type | Constraint |
|---|---|---|
| `userId` | ObjectId string | required |
| `confirmEmail` | string | required; must match the account email case-insensitively after trimming |

**Get** — `{ deleted?, userId?, purged? }`.

**Behaviour**

- Purges `annotation`, `playbackSession`, `playbackContext`, `playlist`,
  `onlineCollection`, `aiUsage`, `subscription`, then `track`, then the user.
- **Billing transactions are never deleted.** The ledger stores `userId` as a
  string snapshot so a receipt survives account deletion.
- Refuses self-deletion and deleting the last active admin.
- Writes `user.delete` with per-collection purged counts.

**Refusals**

- `"User not found"`
- `"You cannot delete your own account"`
- `"There must be at least one active admin"`
- `"Type the account's email address to confirm the deletion"`
- `"The account could not be deleted"` (race: the user row disappeared)

#### `adminResetUserPassword` — `user`

**Set**

| Field | Type | Constraint |
|---|---|---|
| `userId` | ObjectId string | required |
| `password` | string? | 8–100 chars; if absent a 16-character password is generated |

**Get** — `{ userId?, password?, generated? }`.

**Behaviour**

- Returns the password **exactly once**, in this response.
- The audit row records the reset and whether it was generated, never the password.
- The generated password is a UUID with dashes removed, sliced to 16 characters.

**Refusals:** `"User not found"`.

---

### 4.2 Analytics

All four are read-only, registered under `playbackSession`, and available to
`support`. Time buckets are UTC. "Active" means **listened**, not logged in.

#### `adminGetOverview` — `playbackSession`

**Set:** `{}`.

**Get:** response-shaped:

```ts
{
  generatedAt: number,
  users: {
    total, active, suspended,
    newLast24h, newLast7d, newLast30d
  },
  activity: {
    activeLast24h, activeLast7d, activeLast30d   // distinct listeners
  },
  content: {
    sessions, listenTimeSec, lastSessionAt,
    tracks, storageBytes, annotations, playlists,
    contexts, onlineCollections
  },
  revenue: {
    mrrCents, currency, payingUsers, arpuCents,
    conversionRate,                              // 0…1, 4 decimal places
    planDistribution: Array<{
      planCode, title, priceCents, isActive, users
    }>                                          // sorted users desc
  },
  quota: {
    freeHistoryLimit,
    usersAtLimit
  }
}
```

Definitions that matter:

- **MRR** is derived from the current plan catalogue, not transaction snapshots.
  `year` is divided by 12; `lifetime` contributes 0.
- `payingUsers` counts active/trialing subscriptions with no end or a future end.
- `arpuCents` is integer `mrr / payingUsers`, or 0.
- `conversionRate` is `payingUsers / totalUsers`, rounded to 4 decimals, or 0.
- `planDistribution` includes **all** plan rows, including archived ones, sorted by
  current user count.
- `quota.usersAtLimit` is a platform-wide count of accounts with at least
  `freeHistoryLimit` stored sessions. See [§8](#8-known-gaps-and-traps).

#### `adminGetTimeseries` — `playbackSession`

**Set:** `days` — default `30`, clamped `7…90`.

**Get:** `{ days: Point[], from, to }`.

```ts
Point = {
  date: string,          // YYYY-MM-DD, UTC
  timestamp: number,     // UTC day start, epoch ms
  signups: number,
  sessions: number,
  listenTimeSec: number,
  activeUsers: number    // distinct listeners that day
}
```

Every day in the window is present, including zero days. `to` is the last
millisecond of today (UTC).

#### `adminGetTopTracks` — `playbackSession`

**Set**

| Field | Type | Default / constraint |
|---|---|---|
| `days` | number | `30`, clamped `1…365` |
| `limit` | number | `10`, clamped `1…50` |

**Get:** `{ days, rows: TopTrack[] }`.

```ts
TopTrack = {
  trackId: string | null,
  contentHash: string | null,
  title: string,
  author: string | null,
  isAudiobook: boolean,
  origin: string,
  listenTimeSec: number,
  playCount: number,
  listenerCount: number
}
```

Ranked by **listening time**, not play count. Titles are joined from the live
`track` collection; a missing/deleted track falls back to the session snapshot or
`"Unknown track"`. `listenerCount` is the number of distinct listeners.

#### `adminGetRetention` — `playbackSession`

**Set**

| Field | Type | Default / constraint |
|---|---|---|
| `cohorts` | number | `6`, clamped `1…12` |
| `weeks` | number | `6`, clamped `1…12` |

**Get:** `{ cohorts: Cohort[], weeks }`.

```ts
Cohort = {
  cohortStart: number,     // Monday 00:00 UTC, epoch ms
  cohortDate: string,      // YYYY-MM-DD
  size: number,
  weeks: Array<{
    week: number,          // 0 = signup week
    activeUsers: number,
    rate: number           // 0…1, 4 decimals
  }>
}
```

Cohorts are Monday–Sunday UTC weeks. Week 0 is the signup week. Empty cohorts are
included with `size: 0` and zero rates.

---

### 4.3 Plans

#### `adminListPlans` — `plan`

**Set:** `includeInactive` — boolean, default `false` (archived plans hidden).

**Get** — one plan row:

`_id`, `code`, `title`, `description`, `priceCents`, `currency`,
`billingInterval`, `isActive`, `isDefault`, `sortOrder`, `limits`, `features`,
`createdAt`, `updatedAt`, plus computed `subscribers`.

**Response** — `{ rows, total, page, limit }` with `page: 1`,
`limit: rows.length`, `total: rows.length`. Not paged.

Sorted `sortOrder: 1`, then `priceCents: 1`. `subscribers` is a live count of
active/trialing subscriptions with no end or a future end. It is outside the
projection and always returned.

#### `adminUpsertPlan` — `plan`

**Set**

| Field | Type | Constraint |
|---|---|---|
| `code` | string | required; upsert key |
| `title` | string? | required when creating |
| `description` | string? | |
| `priceCents` | number? | `>= 0` |
| `currency` | string? | |
| `billingInterval` | `month \| year \| lifetime`? | |
| `isActive` | boolean? | cannot archive a plan with live subscribers |
| `isDefault` | boolean? | exactly one default; setting true clears others |
| `sortOrder` | number? | |
| `limits` | partial object? | merged with existing; each numeric value is `-1` or `>= 0` |
| `features` | string[]? | replaces the array |

`limits` fields: `historyEntries`, `crossDeviceSync` (boolean), `playlists`,
`maxTracks`, `aiCreditsPerMonth`.

**Get:** `selectStruct("plan", 1)`.

**Refusals**

- `"{name} must be -1 (unlimited) or a number of zero or more"` for any limit
  `< -1`
- `"priceCents cannot be negative"`
- `"A new plan needs a title"`
- `"Mark another plan as the default before unsetting this one"`
- `"This plan still has N active subscriber(s). Move or revoke them before archiving it."`

**Behaviour**

- Limits are merged, not replaced. Omitted limits keep their current values.
- Setting `isDefault: true` unsets every other plan's flag in the same request.
- Audits `plan.create` or `plan.update`.
- An archived plan can still be read; it cannot be bought or granted.

---

### 4.4 Subscriptions and grants

#### `adminGrantSubscription` — `subscription`

**Set**

| Field | Type | Constraint |
|---|---|---|
| `userId` | ObjectId string | required |
| `planCode` | string | required; must exist and be active |
| `mode` | `forever \| duration \| usage`? | omit for the legacy one-interval grant |
| `duration` | `{ value: number, unit: "day" \| "week" \| "month" \| "year" }`? | only with `mode: "duration"`; `value` is a positive integer |
| `caps` | `{ historyEntries?, playlists?, maxTracks? }`? | only with `mode: "usage"`; each cap is an integer `>= 0`; at least one required |
| `interval` | `month \| year \| lifetime`? | legacy path only; defaults to the plan's `billingInterval` |
| `note` | string? | recorded on the subscription and in the audit metadata |

**Get** — response-shaped:

```ts
{
  reference: string,          // txn_<uuid>
  planCode, planTitle,
  status: SubscriptionStatus,
  grantMode?: "forever" | "duration" | "usage",
  usageCaps?: { historyEntries?, playlists?, maxTracks? },
  currentPeriodEnd?: number,
  periodStart?: number,
  periodEnd?: number
}
```

**Grant semantics**

| Mode | End | Caps | Extends? |
|---|---|---|---|
| `forever` | none — `currentPeriodEnd` is absent | none | never |
| `duration` | calendar date from `duration`, or the plan interval on the legacy path | none | yes, when the same plan is running and has a future end |
| `usage` | no time end; ends as soon as any cap is reached | overrides only the named resources | no; a repeat grant replaces the cap set |

Rules:

- A grant is always a **plan plus one amount**. It goes through the same
  transaction ledger as a purchase, with `provider: "manual"` and the plan's list
  price, so a comped month and a paid month leave the same kind of receipt.
- `mode` omitted keeps the legacy behaviour: one interval determines the end;
  `lifetime` becomes `forever`. This path sets `autoRenew` true for timed plans.
- A grant (any explicit mode) sets `autoRenew: false`; an operator decides when it
  ends.
- `duration` uses calendar arithmetic: weeks are +7 days; months/years use UTC
  calendar arithmetic.
- A usage cap is a **stock threshold**, not a delta. `historyEntries: 15000` means
  15,000 stored sessions in total, including rows that predate the grant.
- When any usage cap is reached, the **whole grant expires** and the account falls
  back to free. Existing data is kept. This is evaluated during the grant itself:
  if the account already has at least the capped stock, the act still returns
  success, with the grant's `planCode` and `status: "expired"` (the activation
  result is echoed even though `resolveEntitlement` immediately fell back to
  free). Re-read `adminGetUser.entitlement` after a usage grant before saying the
  plan is live.
- The AI meter is deliberately not a usage cap. It is future balance-based credit.

**Refusals**

- `"A usage grant needs at least one cap"`
- `"A usage grant does not take a duration"`
- `"caps.{name} must be zero or a positive whole number"`
- `"A duration grant needs a duration"`
- `"duration.value must be a positive whole number"`
- `"A duration grant does not take caps"`
- `"A forever grant does not take a duration or caps"`
- `"Choose a grant mode for a duration or usage grant"`
- `"User not found"`
- `"That plan does not exist"`
- `"That plan is no longer available"` (archived plan)

#### `adminRevokeSubscription` — `subscription`

**Set**

| Field | Type | Constraint |
|---|---|---|
| `userId` | ObjectId string | required |
| `reason` | string? | recorded in the audit metadata |

**Get:** `{ revoked?, planCode?, status?, limits? }`.

**Behaviour**

- Immediate revocation: writes `currentPeriodEnd = now`, `status = "canceled"`,
  `cancelAtPeriodEnd = true`, `autoRenew = false`.
- The next entitlement read returns the free plan with status `canceled`.
  The response therefore reports the **post-revoke** state: free `planCode`, free
  limits, `status: "canceled"`.
- The subscription row is kept, never deleted.
- The guard is "is there a running subscription", not "was money charged": an
  active, trialing or past-due comp can be revoked too.

**Refusals**

- `"User not found"`
- `"This account has no active subscription to revoke"`

#### `adminListSubscriptions` — `subscription`

**Set**

| Field | Type | Default |
|---|---|---|
| `page` | number | `1` |
| `limit` | number | `25`, clamped `1…200` |
| `status` | `active \| trialing \| past_due \| canceled \| expired`? | |
| `planCode` | string? | |
| `search` | string? | substring of the account's email or username |

**Get:** `selectStruct("subscription", 1)`.

**Response:** `{ rows, total, page, limit }`, sorted `currentPeriodEnd` ascending,
then `createdAt` descending.

> **Sort trap:** MongoDB treats a missing `currentPeriodEnd` as `null`, and `null`
> sorts **before** numbers in ascending order. Lifetime/no-end rows therefore
> currently appear **first**, not last, despite the comment in the act. Do not
> assume the top of the table is the next renewal; filter/sort in the UI or fix
> the backend sort deliberately.

Each row includes the stored subscription fields and the embedded user summary:

`_id`, `planCode`, `status`, `startedAt`, `currentPeriodStart`,
`currentPeriodEnd`, `cancelAtPeriodEnd`, `canceledAt`, `provider`, `providerRef`,
`autoRenew`, `note`, `createdAt`, `user { _id, email, username, displayName }`.

The fixed projection does **not** include `grantMode` or `usageCaps`. See
[§8](#8-known-gaps-and-traps).

---

### 4.5 Transactions

The ledger is append-heavy and is never deleted. `pending` is the manual provider's
work queue. The owner is `userId` (string) plus an email snapshot; there is no
relation to `User`.

#### `adminListTransactions` — `billingTransaction`

**Set**

| Field | Type | Default |
|---|---|---|
| `page` | number | `1` |
| `limit` | number | `25`, clamped `1…200` |
| `status` | `pending \| paid \| failed \| refunded \| canceled`? | |
| `provider` | string? | |
| `planCode` | string? | |
| `userId` | string? | string id, not an ObjectId type |
| `search` | string? | substring of `userEmail` or `reference` |
| `from` | number? | inclusive epoch ms on `createdAt` |
| `to` | number? | inclusive epoch ms on `createdAt` |

**Get:** `selectStruct("billingTransaction", 1, ["metadata"])`.

**Response:** `{ rows, total, page, limit }`, newest first.

Projected row fields: `_id`, `reference`, `userId`, `userEmail`, `planCode`,
`planTitle`, `amountCents`, `currency`, `billingInterval`, `status`, `provider`,
`providerRef`, `periodStart`, `periodEnd`, `note`, `paidAt`, `refundedAt`,
`createdAt`. `metadata` is deliberately excluded from the allow-list; do not build
a UI that needs arbitrary provider payloads without a backend change.

#### `adminConfirmTransaction` — `billingTransaction`

**Set**

| Field | Type | Constraint |
|---|---|---|
| `reference` | string | required |
| `note` | string? | written to the transaction |

**Get:** `{ reference?, status?, alreadyProcessed?, planCode?, periodStart?, periodEnd? }`.

**Behaviour**

- Looks up the transaction; refuses a refunded one.
- `completeTransaction` claims `pending → paid` conditionally. A second confirm
  returns `alreadyProcessed: true` and does not extend the period again.
- On success the subscription is activated/extended and the transaction's
  `periodStart` / `periodEnd` are filled in.
- If activation fails, the claim is rolled back to `pending` so the payment stays
  retryable. The act still throws the activation error.
- Audits `transaction.confirm`.
- If the transaction is already `paid`, the response has no `planCode` /
  `periodStart` / `periodEnd` because no activation was performed.

**Refusals**

- `"Transaction not found"`
- `"This payment was refunded"`
- `"This payment was refunded and cannot be completed"`
- `"This payment was canceled and cannot be completed"`

#### `adminRefundTransaction` — `billingTransaction`

**Set**

| Field | Type | Constraint |
|---|---|---|
| `reference` | string | required |
| `reason` | string? | written to the transaction note and audit |

**Get:** `{ refunded?, reference?, status?, accessRevoked? }`.

**Behaviour**

- Only a `paid` transaction can be refunded.
- Writes the ledger first (`status: "refunded"`, `refundedAt`, note), then revokes
  access immediately.
- The transaction row is never deleted.
- The current subscription is revoked regardless of whether it was the one this
  transaction bought. See [§8](#8-known-gaps-and-traps).

**Refusals**

- `"Transaction not found"`
- `"Only a paid transaction can be refunded"`

---

### 4.6 Audit log

#### `adminListAuditLogs` — `adminAuditLog`

**Set**

| Field | Type | Default |
|---|---|---|
| `page` | number | `1` |
| `limit` | number | `25`, clamped `1…200` |
| `actorId` | string? | exact |
| `action` | string? | exact dotted vocabulary |
| `targetType` | string? | exact |
| `targetId` | string? | exact |
| `from` | number? | inclusive epoch ms on `createdAt` |
| `to` | number? | inclusive epoch ms on `createdAt` |

**Get:** `selectStruct("adminAuditLog", 1)`.

**Response:** `{ rows, total, page, limit }`, newest first.

Row: `_id`, `actorId`, `actorEmail`, `actorRole`, `action`, `targetType`,
`targetId`, `summary`, `metadata` (JSON string), `createdAt`.

Action vocabulary: `user.update`, `user.delete`, `user.resetPassword`,
`plan.create`, `plan.update`, `subscription.grant`, `subscription.revoke`,
`transaction.confirm`, `transaction.refund`, `platform.update`,
`ai.grantCredits`.

`targetType` is `user | plan | subscription | transaction | platformSetting |
aiUsage`. For subscription grants/revokes, `targetId` is the **listener's user id**
(the subscription row is per-user). For transactions, `targetId` is the reference.

`metadata` is a JSON string because its shape differs per action. Parse it in the
client; do not add it to a shared strict type.

**Audit is best-effort.** The backend awaits the write so the response is not sent
before the line exists, but an audit-write failure is logged and does **not** roll
back the mutation. Do not tell the operator that the action failed because the
audit write failed.

---

### 4.7 Platform switches

#### `adminGetPlatformSetting` — `platformSetting`

**Set:** `{}`.

**Get:** `{ key?, signupsEnabled?, aiEnabled?, maintenanceMode?, announcement? }`.

`key` is always `"platform"`. An empty/whitespace `announcement` is returned as
`null`.

#### `adminUpdatePlatformSetting` — `platformSetting`

**Set** (all optional; omitted fields unchanged):

| Field | Type |
|---|---|
| `signupsEnabled` | boolean |
| `aiEnabled` | boolean |
| `maintenanceMode` | boolean |
| `announcement` | string |

**Get:** same as `adminGetPlatformSetting`.

**Behaviour**

- Reads/creates the singleton row first, so the first edit is never a no-op.
- Only changed fields are written; an empty change set does not write or audit.
- Audits `platform.update` with before/after values.
- `announcement` can only be set to a string. Use `""` to clear; the read turns it
  into `null`.
- These are **not** limits. Limits belong to plans because they are sold. Do not
  add a history cap or a price here.

The listener/public read is `getPlatformStatus` (`model: "platformSetting"`,
tokenless). It returns the same four fields without `key` and is not an admin act.
Do not expose `adminGetPlatformSetting` to an unauthenticated client.

---

### 4.8 AI credits

#### `adminGrantAiCredits` — `aiUsage`

**Set**

| Field | Type | Constraint |
|---|---|---|
| `userId` | ObjectId string | required |
| `credits` | number | positive integer; truncated with `Math.trunc` |
| `periodKey` | string? | `YYYY-MM`; defaults to the current UTC month |
| `note` | string? | audit metadata only; not stored on the meter |

**Get:** `{ userId?, periodKey?, granted?, bonusCredits?, creditsUsed? }`.

**Behaviour**

- Adds to `bonusCredits`; never edits `creditsUsed`.
- Creates the `(user, periodKey)` row if absent; a unique index makes concurrent
  grants safe (the loser falls back to an increment).
- The row is created on first spend, so a listener who never uses AI has no row.
- Audits `ai.grantCredits` with the period and post-grant balance.

**Refusals**

- `"Credits must be a positive whole number"`
- `"User not found"`

---

## 5. Entitlements, limits and quotas

This is the model the panel displays; the backend enforces it on every ingest.

### 5.1 Resolution

`resolveEntitlement(userId)` returns:

```ts
{
  planCode, planTitle, isPaid,
  limits: {
    historyEntries, crossDeviceSync, playlists,
    maxTracks, aiCreditsPerMonth
  },
  subscriptionStatus,       // none | active | trialing | past_due | canceled | expired
  currentPeriodEnd?, cancelAtPeriodEnd, autoRenew, startedAt?,
  grantMode?, usageCaps?
}
```

Rules:

- **No subscription row means free.** Registration writes no row.
- **Free is a plan row too.** Its limits are read from the `free` plan on every
  resolution, so an admin edit takes effect immediately. `FALLBACK_LIMITS` only
  applies when the row is missing entirely.
- **The clock wins over `status`.** A row that still says `active` after
  `currentPeriodEnd` is expired; the expiry is written lazily on read.
- **A missing plan row degrades to free limits**, never to unlimited.
- **A usage grant is resolved against live counts.** Any capped resource reaching
  its ceiling expires the whole grant and returns free limits.
- `-1` means unlimited. A cap is always a non-negative integer; negative caps are
  ignored (never read as unlimited).

### 5.2 Quota

```ts
{ limit, used, remaining, unlimited }
```

For unlimited: `limit: -1`, `remaining: -1`, `unlimited: true`.

- `historyQuota` counts stored `playbackSession` rows.
- Playlist and track quotas are used by ingest, not by an admin act.
- A quota never deletes data. Over the cap, new rows are skipped and reported.

### 5.3 Subscription status meanings

| Status | Meaning |
|---|---|
| `none` | No subscription row; free. |
| `active` | Paid/time-bound or comped; valid until `currentPeriodEnd` or forever. |
| `trialing` | Same as active for entitlement; a timed state. |
| `past_due` | Still running until the period end; payment problem. |
| `canceled` | Revoked or canceled. Admin revoke ends access now; listener cancel keeps the paid days. |
| `expired` | The clock or a usage cap ended it. The row is kept. |

`isPaid` is true only when the plan has a price > 0. A zero-price comp is not
"paid", but it is still a running entitlement.

### 5.4 Grant mode and caps

- `grantMode` is absent on a normal purchase; present on an admin comp.
- `forever`: no `currentPeriodEnd`.
- `duration`: ends at `currentPeriodEnd`; extends a running same-plan period.
- `usage`: `usageCaps` hold absolute stock ceilings for `historyEntries`,
  `playlists`, and `maxTracks`. A cap replaces that resource's plan limit; an
  uncapped resource keeps the plan's limit. Repeating a usage grant replaces the
  caps.
- Reaching **any** cap expires the whole grant and drops the account to free.
- AI credits are not a cap.

---

## 6. Money lifecycle (what the transaction buttons do)

1. `createCheckout` (listener or panel) creates a `pending` transaction with
   `txn_<uuid>`. The amount is copied from the plan at that moment.
2. A manual payment waits in `pending`. The operator confirms it with
   `adminConfirmTransaction`.
3. Completion claims `pending → paid` with a conditional update. Duplicate
   confirmations return `alreadyProcessed: true`; they do not extend twice.
4. Activation either creates the one-per-listener subscription row or extends it:
   - same plan + timed → starts where the paid time ends;
   - different plan → starts now;
   - lifetime/forever → no end;
   - usage → caps replace, no time end.
5. Refund writes the ledger first, then revokes access immediately. Ledger rows are
   never deleted.
6. A failed activation rolls the transaction back to `pending`, so the operator can
   retry.

The panel should treat `pending` as the work queue and `refunded` as terminal.

---

## 7. Frontend implementation guidance

### 7.1 Suggested file shape

```
src/app/(admin)/admin/
  layout.tsx                 ← getMe + notFound() for role user; admin nav
  page.tsx                   ← adminGetOverview
  analytics/page.tsx         ← timeseries, top tracks, retention
  users/page.tsx             ← table + filters
  users/[id]/page.tsx        ← detail + actions + recent history + scoped audit
  plans/page.tsx             ← list + editor
  subscriptions/page.tsx     ← list + revoke
  transactions/page.tsx      ← list + confirm/refund
  audit/page.tsx             ← feed
  platform/page.tsx          ← switches
src/app/actions/admin/
  get-overview.ts
  get-timeseries.ts
  get-top-tracks.ts
  get-retention.ts
  list-users.ts
  get-user.ts
  get-user-history.ts
  update-user.ts
  delete-user.ts
  reset-user-password.ts
  list-plans.ts
  upsert-plan.ts
  grant-subscription.ts
  revoke-subscription.ts
  list-subscriptions.ts
  list-transactions.ts
  confirm-transaction.ts
  refund-transaction.ts
  list-audit-logs.ts
  get-platform-setting.ts
  update-platform-setting.ts
  grant-ai-credits.ts
src/lib/admin/
  guard.ts                   ← requireAdmin / requireSupport (normal module)
  domain/*.ts                ← parsers and display helpers
```

`guard.ts` must not be a `"use server"` module: it exports functions used by
actions, and `"use server"` modules may only export async functions.

### 7.2 Page rules

- Reads happen in Server Components through Server Actions. Do not `fetch` the
  backend from the browser.
- Every data surface renders **skeleton, empty, error, offline** — not a blank
  table.
- Use the returned server truth. Do not compute entitlement, quota, MRR, subscriber
  counts, or retention on the client.
- Use `Intl` with `"en-US"` pinned for dates and numbers.
- The panel is English/LTR, like the rest of the web app. Persian names in records
  are data, not copy.
- Logical CSS properties only (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`), because a
  row can hold a Persian `displayName`.

### 7.3 Mutation rules

- **No optimistic UI.** Await the act; render its result or re-read.
- **Typed confirmation** for irreversible actions:
  - delete account → type the account email (`confirmEmail`);
  - refund → type/confirm the reference and amount;
  - revoke → confirm the plan and that access ends now;
  - archive plan → confirm, and surface the backend's active-subscriber refusal.
- **Never hide the only copy of a destructive action behind a generic "Are you
  sure?"** A checkbox is not a confirmation for deletion.
- **Do not swallow errors.** The backend messages are English and specific; map
  each to a readable sentence or show it as a validation message.
- **Do not infer success from a re-read** when the act returns the result. Use
  `refunded`, `deleted`, `revoked`, `alreadyProcessed`, etc.

### 7.4 The user detail page

Recommended sections, in order:

1. **Identity** — username, email, display name, avatar, role, status, created,
   suspended reason.
2. **Entitlement** — plan, `subscriptionStatus`, `isPaid`, `currentPeriodEnd`,
   `cancelAtPeriodEnd`, `autoRenew`, limits. Use `adminGetUser.entitlement`.
3. **Quota** — `historyQuota` with used/limit/remaining; render unlimited as
   `Unlimited`, not `-1`.
4. **Usage** — sessions, listening time, tracks, storage, annotations, playlists,
   contexts, online collections, first/last active.
5. **Recent sessions** — `sessionsLimit` control; link to the paged history.
6. **Actions** — grant, revoke, reset password, suspend/reactivate, role change,
   delete, AI credits. Support sees none of these controls; admin sees them.
7. **Audit** — `adminListAuditLogs` with `targetType: "user"`, `targetId: id`.

Do not render a content browser here. History is a table, not a library.

### 7.5 The plans page

- List active plans by default; a toggle sends `includeInactive: true`.
- Show price as `priceCents / 100` with the plan's `currency`; never assume USD.
- Show `-1` limits as `Unlimited`.
- The editor posts only changed fields; limits are merged server-side.
- Marking a plan default is a single-choice control; the backend clears the others.
- Archiving a plan with subscribers must show the backend's count and message, not
  silently disable the button without explanation.

### 7.6 The transactions page

- Default view is `pending` — that is the manual provider's work queue.
- Show `reference`, amount + currency, user email/name, plan, provider, status,
  created/paid/refunded dates.
- Confirm is for `pending`; refund is for `paid`. Do not offer refund on a
  `pending` or `refunded` row.
- `alreadyProcessed: true` means the click was a duplicate, not a failure. Say so.
- A refund revokes access immediately. Make that explicit in the confirmation.

### 7.7 The audit page

- Newest first; filter by actor, action, target type/id and date range.
- Render `metadata` only after `JSON.parse` in a client component or a safe parser;
  a malformed/retired row must not break the page.
- A `targetId` link for `user` should go to the account detail.
- Do not promise that every attempted action appears. Refusals are not logged; only
  successful mutations are.

### 7.8 The platform page

- Four switches only: signups, AI, maintenance, announcement.
- `maintenanceMode` is a client signal, not a server interlock. The panel itself
  keeps working during maintenance.
- An empty announcement is `null`; render nothing, not an empty banner.
- Closing signups affects `register`; it does not sign anyone out.

---

## 8. Known gaps and traps

These are real current behaviours, not invitations to invent a workaround.

1. **`adminListUsers.planCode` is not authoritative.** The row is built from the
   **latest subscription row**, not `resolveEntitlement`. A canceled/expired row
   can make the table show a plan the account no longer has. Use
   `adminGetUser.entitlement` for a detail page and a decision; treat the list
   column as a hint.
2. **`adminListUsers.subscription` is also the latest row**, with the same caveat.
3. **`adminGetOverview.quota.usersAtLimit` counts every account** with at least
   `freeHistoryLimit` stored sessions, including paid accounts. It is not a count
   of free listeners at the paywall. Label it honestly ("accounts at or above the
   free history size") or fix the backend before using it as a business metric.
4. **`adminGetUser` cannot project `grantMode` / `usageCaps`.** The entitlement
   projection struct omits them. If you omit `entitlement` from `get`, you get no
   entitlement; if you request those leaves, validation rejects them. Sending no
   `get` at all returns the full computed object (which does contain them), but that
   defeats projections and the generated type does not advertise them. Show grant
   state from `adminGrantSubscription`'s response or from a backend change. Do not
   guess.
5. **`adminListSubscriptions` cannot return `grantMode` / `usageCaps`.** Its fixed
   `$project` omits them even though the model has them. A grant comp is visible by
   `provider: "manual"` and `autoRenew: false`, but not by mode. Plan a backend
   change if the panel needs a "comped: duration/usage" badge.
6. **`adminGetUserHistory` cannot return `deviceInfo`.** It is excluded from the
   generated allow-list. The panel should not promise per-device diagnosis.
7. **`adminListTransactions` cannot return `metadata`.** Provider payloads are
   excluded. Build the ledger from the explicit columns.
8. **`adminRefundTransaction` revokes the account's current subscription**, not
   necessarily the subscription this transaction bought. If the account re-bought
   after this payment, a refund of the older payment still revokes the current
   grant. The confirmation must say "revokes current access", and the operator
   should verify before refunding.
9. **`adminGrantSubscription` writes a pending transaction before activation.**
   If the plan is archived or activation fails, the ledger can retain a `pending`
   row. The act throws; the panel should refresh the ledger.
10. **Audit writes are best-effort.** A mutation can succeed and still be missing
    from the feed if the audit insert failed. Do not treat the feed as a
    transactional guarantee.
11. **`adminListPlans` is not paged.** `limit` is `rows.length`, not 25. Do not put
    it behind the shared pagination component.
12. **`adminListUsers` `get` is a closed safe-user allow-list.** You cannot request
    `password` (nor should you), and computed columns are not projection leaves.
13. **`adminGetUser` recent sessions are capped at 50**, default 10. For real
    history use `adminGetUserHistory`.
14. **Role is not a free-text field.** Only `user`, `admin`, `support` are accepted;
    legacy accounts read as `user`.
15. **A missing role must fail closed.** Any client check is `role === "admin"` or
    `role === "support"`, never `role !== "user"`.

---

## 9. Verification checklist

Before calling the frontend panel done:

- [ ] `npm run check` is green: declarations in sync, `tsc`, `eslint`, `vitest`,
      `next build`.
- [ ] A `user` visiting `/admin` gets `notFound()`, not a blank page or a 403.
- [ ] A `support` user can read every list and detail page.
- [ ] A `support` user calling a mutating action directly gets a refusal and is not
      signed out.
- [ ] An `admin` can list users, open one, grant forever/duration/usage, revoke,
      reset a password, suspend/reactivate, and delete with typed confirmation.
- [ ] `getMe` returns `role` and `status`, and a legacy user with neither still
      reads as `user` / `active`.
- [ ] No admin read calls a `getMy*` act.
- [ ] No client code computes entitlement, quota, MRR, subscribers or retention.
- [ ] Every table has skeleton, empty, error and offline states.
- [ ] Destructive actions require typed confirmation and show the server's refusal.
- [ ] `grep -r "getMyTracks\|getMyListeningHistory\|getMyStats" src/app/\(admin\)`
      returns nothing.
- [ ] The panel never renders `password`, `metadata` raw, or an unparsed audit
      blob.

---

## 10. Open product decisions

Resolve these before the UI hardens:

1. **Is `role` editable in the panel?** The backend supports it and the backend
   docs say admins promote each other. The earlier web brief said "no role control,
   set it with mongosh". Recommendation: support role changes on the user detail
   page for `admin` only, with the self/last-admin guards surfaced.
2. **How much history may support see?** The backend permits paged history. Keep it
   as a support tool, not a content product.
3. **Should the overview's `usersAtLimit` be fixed to free accounts only?** If it is
   used as a business metric, yes. Until then, label it as "accounts at or above
   the free cap".
4. **Does the panel need grant mode in list/detail?** If yes, fix the two projection
   gaps rather than deriving it from `provider`/`autoRenew`.
5. **Recurring billing.** Checkout is one-off today. The panel confirms manual
   payments; Stripe renewal/webhooks are not implemented. Do not build a
   subscription-management UI that implies automatic renewal.

---

## 11. Reference: response envelopes by act

```ts
// Row lists
{ rows: T[], total: number, page: number, limit: number }

// Analytics
adminGetOverview       -> Overview (object, see §4.2)
adminGetTimeseries     -> { days: Point[], from: number, to: number }
adminGetTopTracks      -> { days: number, rows: TopTrack[] }
adminGetRetention      -> { cohorts: Cohort[], weeks: number }

// Detail / computed
adminGetUser           -> { user, entitlement, historyQuota, usage, recentSessions }
adminGrantSubscription -> { reference, planCode, planTitle, status, grantMode?, usageCaps?, currentPeriodEnd?, periodStart?, periodEnd? }
adminRevokeSubscription-> { revoked, planCode, status, limits }
adminConfirmTransaction-> { reference, status, alreadyProcessed, planCode?, periodStart?, periodEnd? }
adminRefundTransaction -> { refunded, reference, status, accessRevoked }
adminDeleteUser        -> { deleted, userId, purged }
adminResetUserPassword -> { userId, password, generated }
adminGrantAiCredits    -> { userId, periodKey, granted, bonusCredits, creditsUsed }
adminGetPlatformSetting-> { key, signupsEnabled, aiEnabled, maintenanceMode, announcement }
adminUpdatePlatformSetting -> same
```

A `get` on a response-shaped act projects this object. A `get` on a row-shaped act
projects **one row**; the wrapper is always added.
