# 06 — The admin panel

> **Implementation brief for an agent working in `/Users/syd/work/Pejvak/front`.**
>
> This **supersedes** `front/prompts/05-entitlements-and-admin.md` for the admin
> surface. That file was written before the backend had RBAC and describes acts
> that do not exist. Where the two disagree, this file and
> [`front/docs/ADMIN-PANEL.md`](../docs/ADMIN-PANEL.md) win.
>
> Read, in this order:
>
> 1. `front/AGENTS.md` — the web app's hard rules (Next 16, Server Actions only,
>    `httpOnly` token, English/LTR, no second source of truth).
> 2. `front/docs/ADMIN-PANEL.md` — the full wire contract for all 22 admin acts,
>    grant modes, limits, analytics, audit and known gaps.
> 3. `back/AGENTS.md` §"Roles and the admin panel" and §"Entitlements and billing"
>    — the backend rules the UI must reflect.
> 4. `front/docs/PLAN.md` for general app conventions — but **ignore its §2 C1 and
>    Phase 6**. They predate RBAC and say the panel is impossible. It is not.
>
> `mobile/` and `back/` are read-only references for this task.

## Mission

Build the cross-user operator console at `/admin` over the **22 admin acts that
already exist**. Two roles use it:

- **`support`** — read-only. Can look at accounts, history, subscriptions,
  transactions, audit and platform settings to answer a ticket.
- **`admin`** — everything, including mutations, with self-protection and
  last-admin guards.

A normal listener (`role: "user"`) must get a clean 404 and never learn the panel
exists.

This is a security surface that happens to have UI. Do not invent a second
authority, do not reuse a listener act, and do not trust a hidden button.

## Ground truth (do not re-derive)

- **22 admin acts**, registered under their real Lesan schema, not an `admin`
  schema. The schema goes in `model:`; the folder name is not the schema.
- Reads use `requireSupport`; mutations use `requireAdmin`. A support token calling
  a mutation is refused by the backend even if the UI offers the button.
- Lists return `{ rows, total, page, limit }`; `page` defaults to 1, `limit` to 25,
  clamped 1–200. `adminListPlans` is the exception: it is not paged.
- `get` is an explicit `0 | 1` allow-list. Generated types are vendored at
  `src/types/declarations/selectInp.ts`; do not hand-write request shapes and do
  not regenerate the file locally.
- Money and limits are **data on plan rows**, never constants. `-1` means
  unlimited.
- A grant is a plan plus one amount: `forever`, `duration` or `usage`. A usage cap
  is an absolute stock threshold; reaching any cap expires the whole grant and
  falls back to free, keeping the data.
- Every successful mutation writes an audit row. Refusals are not logged. Audit
  writes are best-effort and never roll back the mutation.

## Hard rules

1. **Server Actions only.** No client `fetch` to the backend, no React Query, no
   SWR, no second transport. Use `callAct`.
2. **The token stays in the `httpOnly` cookie.** Never read it in a client
   component, never pass it to one.
3. **Guard every admin action on the server.** Call `requireAdmin()` or
   `requireSupport()` as the first statement. The layout guard is not enough: a
   Server Action is a POST to its own route and can be called directly.
4. **Do not reuse `getMy*` acts for admin reads.** They hard-filter `user._id`.
   Parameterising that filter removes the only security boundary in the product.
5. **No client-side entitlement.** Render `adminGetUser.entitlement`,
   `historyQuota`, and analytics as returned. Do not compare `currentPeriodEnd` to
   `Date.now()` to decide access.
6. **No optimistic UI for mutations.** Await the server. Refunds, grants, deletes
   and role changes are not speed sliders.
7. **Typed confirmation for irreversible actions.** Delete requires the account
   email; refund and revoke require an explicit confirmation of the reference/plan
   and the consequence. A checkbox is not a confirmation.
8. **Never render a password except the one returned by reset.** The reset
   password is returned exactly once and must not be logged or shown in the audit
   feed.
9. **No second source of truth.** Subscriber counts, quota, MRR, retention and
   usage are computed by the backend. Do not store or recompute them client-side
   from a second query.
10. **English/LTR.** Persian names in records are data, not copy. Use logical CSS
    properties.

## Phase 0 — make the shell know about roles

The current `getMe` only requests identity fields, so the admin layout cannot see a
role. Do this first and keep the listener shell working.

1. Extend `src/lib/domain/user.ts`:
   - add `role: "user" | "admin" | "support"` and `status: "active" | "suspended" |
     "deleted"` to `CurrentUser`;
   - request `role` and `status` in `USER_GET`;
   - parse with **fail-closed defaults**: missing `role` → `"user"`, missing
     `status` → `"active"`. A legacy account must not become an admin because a
     field is absent.
2. Add `src/lib/admin/guard.ts` as a **normal module** (not `"use server"`):
   - `requireAdmin()` and `requireSupport()`;
   - both call `getMe()` and return a discriminated result or throw a sentinel the
     action can turn into `fail(...)`;
   - never classify a permission failure as `unauthorized`; that would clear the
     cookie and sign the operator out.
3. Add `src/app/(admin)/admin/layout.tsx`:
   - call `getMe()`;
   - on `unauthorized`, redirect to `/login` as the shell does;
   - on a backend/offline failure, render an error state, not a redirect;
   - **`role === "user"` → `notFound()`**;
   - render an admin-specific nav (no listener player bar), passing the role to
     hide mutation controls for support.
4. Do **not** add role logic to `proxy.ts`. It is a cheap cookie check and must
   never redirect a POST. The layout and actions are the real gates.
5. Extend failure classification in `src/lib/errors.ts` for the admin messages that
   are safe to surface: at minimum `not found`, `cannot`, `requires an admin
   account`, `no active subscription`, `still has … active subscriber`, and the
   grant-mode messages. Add a test that a permission message does not become
   `unauthorized`.

**Gate:** a `user` visiting `/admin` gets `notFound()`, a `support` user renders the
layout, a direct `adminUpdateUser` call from support gets a refusal and is still
signed in, and `npm run check` is green.

## Phase 1 — domain types and actions

Create `src/lib/admin/domain/` parsers for the wire shapes. Follow the existing
`lib/domain/*` style: `asRecord` / `asString` / `asNumber` from `lib/parse`, no
`any`, no casts that hide a missing field.

Create one action per act under `src/app/actions/admin/` (names below are
suggestions; keep one verb per file, `"use server"` with only async exports):

| Action file | Act |
|---|---|
| `get-overview.ts` | `adminGetOverview` |
| `get-timeseries.ts` | `adminGetTimeseries` |
| `get-top-tracks.ts` | `adminGetTopTracks` |
| `get-retention.ts` | `adminGetRetention` |
| `list-users.ts` | `adminListUsers` |
| `get-user.ts` | `adminGetUser` |
| `get-user-history.ts` | `adminGetUserHistory` |
| `update-user.ts` | `adminUpdateUser` |
| `delete-user.ts` | `adminDeleteUser` |
| `reset-user-password.ts` | `adminResetUserPassword` |
| `list-plans.ts` | `adminListPlans` |
| `upsert-plan.ts` | `adminUpsertPlan` |
| `grant-subscription.ts` | `adminGrantSubscription` |
| `revoke-subscription.ts` | `adminRevokeSubscription` |
| `list-subscriptions.ts` | `adminListSubscriptions` |
| `list-transactions.ts` | `adminListTransactions` |
| `confirm-transaction.ts` | `adminConfirmTransaction` |
| `refund-transaction.ts` | `adminRefundTransaction` |
| `list-audit-logs.ts` | `adminListAuditLogs` |
| `get-platform-setting.ts` | `adminGetPlatformSetting` |
| `update-platform-setting.ts` | `adminUpdatePlatformSetting` |
| `grant-ai-credits.ts` | `adminGrantAiCredits` |

Every action:

1. calls its guard first;
2. calls `callAct("<schema>", "<act>", { set, get })` with an explicit projection;
3. returns `ActResult<T>`; pages render failure states instead of throwing.

Put query shapes and constants in `src/lib/admin/domain/*-query.ts`, not in the
`"use server"` file — a `const` export passes `tsc` and fails `next build`.

## Phase 2 — overview and analytics

- `/admin` — `adminGetOverview`: total/active/suspended accounts, new accounts
  24h/7d/30d, active listeners 24h/7d/30d, content totals, MRR/ARPU/conversion/plan
  distribution, free history cap and accounts at/above it.
- `/admin/analytics` — `adminGetTimeseries` (one point per UTC day, including zero
  days), `adminGetTopTracks` (ranked by listening time), `adminGetRetention`
  (Monday UTC cohorts; week 0 is the signup week).
- Charts get **four states**: skeleton, empty, error, offline. An empty chart is a
  designed state, not a blank panel.
- Label `usersAtLimit` honestly. It currently counts **all** accounts at or above
  the free history size, not only free accounts. See `ADMIN-PANEL.md` §8.

## Phase 3 — users

### `/admin/users`

- Table columns: email, username, display name, role, status, plan hint, created.
- Filters: search (username/email/display name), role, status, plan code; sort by
  created/updated/email/username/display name, asc/desc.
- Server-render from `searchParams`; use the shared pagination primitive.
- `role` and `status` filters already handle legacy rows; do not add a client-side
  fallback that hides them.
- `planCode` and `subscription` in this list are a **hint** from the latest
  subscription row, not resolved entitlement. Do not use them to decide access.

### `/admin/users/[id]`

Sections: identity, entitlement, history quota, usage, recent sessions, actions,
scoped audit trail. The full field list is in `ADMIN-PANEL.md` §7.4.

Actions:

- **Grant subscription** — plan picker, mode picker (`forever` / `duration` /
  `usage`), duration value + unit, or cap inputs for history/playlists/tracks.
  At least one cap for usage; positive whole duration; never send both duration and
  caps. Show the returned `grantMode`, caps, and period.
- **Revoke** — explicit "access ends now"; the response reports the post-revoke
  free state with `status: "canceled"`.
- **Reset password** — show the returned password once, with a copy control and a
  clear "this will not be shown again" message. Never put it in the audit feed.
- **Suspend / reactivate** — suspend sets a reason; reactivate clears it. No
  self-suspension.
- **Role change** — only if the product decision is resolved; backend supports
  `user | admin | support`. Disable self-role changes and surface the last-admin
  refusal.
- **Delete** — typed email confirmation, then show `purged` counts. Billing
  transactions survive; say so.
- **Grant AI credits** — positive whole number, optional `YYYY-MM` period and note.
  Show `bonusCredits` / `creditsUsed` after the grant.
- **View history** — paged `adminGetUserHistory`; filters on `startedAt` and
  `contentHash`. Do not promise `deviceInfo`.

Support sees the same page but **no mutation controls**. Hiding them is a
convenience; the backend guard is the control.

## Phase 4 — plans, subscriptions, transactions

- `/admin/plans` — list active; toggle archived. Show limits with `-1` as
  `Unlimited`. Editor posts changed fields; limits are merged. Setting default is a
  single-choice control. Archiving with live subscribers shows the backend's count
  and refuses. Do not paginate this list.
- `/admin/subscriptions` — table over `adminListSubscriptions`. **The backend sort
  is a trap:** it sorts `currentPeriodEnd` ascending, and Mongo puts missing
  (lifetime/no-end) rows first, not last. Do not label the top as "next renewal";
  either sort/filter in the page or fix the backend sort deliberately. Filters:
  status, plan, account search. Revoke from the row; confirm it is immediate. Show
  `provider`, `autoRenew`, `cancelAtPeriodEnd`, `note`.
- `/admin/transactions` — default filter `pending` (the manual work queue). Confirm
  pending; refund paid. Show amount + currency, account, plan, reference, provider,
  dates. `alreadyProcessed: true` is a duplicate click, not an error. Refund
  revokes **current** access; say so in the confirmation.
- Do not render `metadata` or `providerRef` as if they were a stable schema.

## Phase 5 — audit and platform

- `/admin/audit` — newest first; filters by actor, action, target type/id, date
  range. Parse `metadata` defensively; an old/retired action must not break the
  page. Link `targetType: "user"` to the account detail.
- `/admin/platform` — four switches only. `announcement: ""` clears (renders
  `null`). Maintenance is a client signal; the panel keeps working. Closing
  signups does not sign anyone out.

## Phase 6 — hardening

- Verify every list/detail has skeleton, empty, error and offline.
- Verify no admin route or action calls a `getMy*` act.
- Verify no client code computes entitlement, quota, MRR, subscribers or retention.
- Verify destructive actions are typed, awaited and not optimistic.
- Verify all date/number formatting pins `"en-US"`.
- Run `npm run check` (declarations drift → tsc → eslint → vitest → next build).
  A phase is not done because it typechecks.

## Definition of done

- `npm run check` is green.
- A `user` gets `notFound()` on `/admin`; a `support` user can read every page; a
  support token calling a mutation is refused and stays signed in.
- An `admin` can complete every flow above against the local backend.
- `getMe` exposes `role`/`status` with fail-closed defaults.
- Every mutation returns the server's result and every destructive one has a typed
  confirmation.
- The known gaps in `ADMIN-PANEL.md` §8 are either respected in the UI or fixed
  deliberately in the backend, not papered over in the client.
- `front/AGENTS.md` is updated with the admin guard rule and the new admin acts.
- `front/docs/PLAN.md` D1/Phase 6 is updated to say the backend has shipped and
  the panel is unblocked, with the date.

## Out of scope

- Building AI features that spend credits. The meter and grant act exist; the
  spending acts do not.
- Recurring billing/webhooks. Checkout is one-off; do not imply automatic renewal
  in the UI.
- A content browser, per-listener library management, or media playback in the
  panel.
- A listener-facing paywall/upgrade flow unless separately requested. The admin
  panel is the operator surface.

## If a contract is wrong or missing

The source of truth is `back/`. If the panel needs a field the act cannot return
(for example `grantMode` on `adminListSubscriptions`), stop and report it. Do not
invent a second backend call, a client-side derivation from `provider`/`autoRenew`,
or a parallel endpoint. A backend change plus a declarations refresh is the honest
fix; a workaround here becomes a second answer to the same question.
