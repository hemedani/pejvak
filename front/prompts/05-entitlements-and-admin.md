# 05 — Paid sync and the operator panel

> **Superseded (2026-11-04).** The admin half of this brief was written before the
> backend had RBAC. It references acts such as `getMyEntitlement` and
> `SyncCapability` that do not exist, and its listener-side paywall model does not
> match `getMySubscription` / `entitlement_required`. For the admin panel, read
> [`06-admin-panel.md`](./06-admin-panel.md) and
> [`../docs/ADMIN-PANEL.md`](../docs/ADMIN-PANEL.md) instead. This file is kept for
> history and for the listener-side ideas that are still relevant.
>
> Task brief for an implementation agent working in `/Users/syd/work/Pejvak/front`.
>
> Read `front/AGENTS.md` and `front/docs/PLAN.md` first. Read
> `back/prompts/02-entitlements-and-admin.md` for the wire contract — this file
> consumes it and must not invent a second version of it. `mobile/` and `back/`
> are read-only references for this task.

## Mission

Two surfaces, both downstream of a decision the backend already made.

1. **The listener's side:** `/settings` says what their account can do, and the
   app behaves accordingly — without ever showing a red error for a billing
   state, and without hiding data they already synced.
2. **The operator's side:** `/admin`, which is the answer to [D1](../docs/PLAN.md#3-decisions)
   = (b). Phase 6 in the plan, boxes 6.1–6.4.

This is the first cross-user surface in the product, and that changes the threat
model of every file you touch. Treat it as a security task that happens to have
UI.

## What this task must not do

- **Do not compute entitlement on the client.** The server returns
  `SyncCapability`; the web renders it. There is no `isTrialExpired()` in
  `front/`. If you find yourself comparing `trialEndsAt` to `Date.now()` to
  decide whether to *allow* something, stop — you are writing the second
  authority.
- **Do not gate a read.** A lapsed account sees its whole library, history,
  playlists and stats exactly as before. Only the "this is no longer syncing"
  message is new.
- **Do not reuse a `getMy*` act for an admin read.** Every one of them
  hard-filters `user._id` (`front/docs/PLAN.md` §2 C1). Parameterising that
  filter is a one-line change that removes the only security boundary in the
  product.
- **Do not put an admin action behind client-side hiding.** The sidebar link is
  a courtesy. `requireAdmin` inside the Server Action is the control.

## Part A — the listener's side

### A1. The failure vocabulary has to grow, carefully

`lib/result.ts` defines `FailureKind = "unauthorized" | "validation" | "offline"
| "server" | "unknown"` and states in its doc comment that **four kinds cover
everything the backend can do to us**. A paywall is a fifth thing, and it is not
any of them: it is not a validation error (the payload was fine), not `server`
(nothing broke), and rendering it as either is a lie the listener will read as a
bug.

Add `"paywall"` to `FailureKind`, and treat the addition as a small breaking
change:

- `lib/messages.ts` — `BY_KIND` must cover it. The sentence is not "something
  went wrong"; it is "Saving to the server needs a subscription. Your listens
  are still saved on this device." Note the existing rule: this file is the
  **only** place a failure becomes a sentence.
- Grep every `switch` and every exhaustive `Record<FailureKind, …>` in `src/`
  and extend it. TypeScript will find most of them; `eslint` will not find the
  rest.
- `lib/errors.ts` — `classifyActFailure` currently classifies by **regex over
  the message string** (`UNAUTHORIZED_PATTERNS`, `VALIDATION_PATTERNS`). Do
  **not** add a `PAYWALL_PATTERNS` regex. Read the structured code the backend
  now returns (`entitlement_required`) out of the envelope and map it. Then
  delete nothing else — the existing patterns still have to work for the acts
  that were not touched.
- One test in `lib/__tests__/` that the code is read from the envelope and that
  a message containing the word "subscribe" does **not** become a paywall. That
  second assertion is the one that stops the next person from reintroducing the
  regex.

### A2. The domain and the actions

Mirror the pattern already used for settings (`lib/domain/settings.ts`,
`actions/settings/get-my-settings.ts`):

- `lib/domain/entitlement.ts` — `SyncCapability`, `DEFAULT_CAPABILITY`
  (`canSync: true`, `reason: "trialing"`), `parseCapability(raw)` with per-field
  fallback, and `describePlan(capability, now)` returning the display sentence.
  Optimistic default: a failed read must never make a paying listener look
  lapsed.
- `actions/entitlements/get-my-entitlement.ts` — `callAct("user",
  "getMyEntitlement", …)`, `ok`/`fail` like every other action. Cache it with
  the same `cache()` discipline the shell's `getMe` uses; it is read by the
  shell and by `/settings`, and it must be one round trip per request, not two.

### A3. Where it shows

**`/settings`** — a "Sync" card above the existing preferences, following the
same `Card` + `CardHeading` + `SettingRow` shape box 3.6 established:

| state | heading | body |
|---|---|---|
| `trialing` | Syncing | "Trial ends in 9 days. Everything you listen to is saved to the server." |
| `active` | Syncing | "Renews on 14 March." |
| `trial_expired` | Not syncing | "New listens are saved on this device and will sync when you subscribe." |
| `payment_failed` | Not syncing | "We could not renew. Your history is safe; sync resumes when payment goes through." |
| `canceled` | Not syncing | "Your history is still here. New listens stay on this device." |
| `disabled` | Turned off | "Syncing is turned off for this account." |

One button, and it is the only place a price may appear. Do not render a price
if the rail is undecided — see the mobile brief's Play Billing note; the same
constraint applies to a web checkout that sells an in-app good.

**The player.** Nothing. The player does not know entitlements exist. Verify by
grep.

**`/history`.** When there are unsynced rows and `canSync` is false, one line
above the list: "N listens are saved on this device." Reuse the existing
`type-caption text-text-tertiary` treatment; do not invent a warning banner.

## Part B — the operator panel

### B1. The guard

`/admin` sits beside the shell. Two independent checks, and you need both:

1. **`src/proxy.ts`** — extend the matcher to `/admin/:path*` so an
   unauthenticated request never reaches a Server Component. This is a
   redirect, not a security control; the middleware has no database.
2. **`requireAdmin()`** — a function in `lib/auth/` that reads the current user
   (via the existing `getMe` action), checks `role === "admin"`, and is called
   as the **first statement of every admin Server Action**. Not a wrapper you
   can forget to apply: a line you can see in the diff.

The `/admin` layout renders `notFound()` for a non-admin, not a "403" page. A
signed-in listener should not learn that `/admin` exists. Log the attempt; do
not render it.

### B2. The screens (plan boxes 6.3, 6.4)

- `/admin` — a small overview: accounts, active subscriptions, trials ending in
  7 days, syncs refused in the last 24 h. Aggregates only; no user rows.
- `/admin/users` — a paged table: email, username, role, plan, status, created.
  Filter by status and a search on email/username. Server-rendered from
  `searchParams`, same pagination primitive as `/library`.
- `/admin/users/[id]` — one account: identity, entitlement, counts (tracks,
  sessions, playlists), and the audit trail for that account. **No content
  browsing.** An operator needs to answer "why is this person's sync failing",
  not to read someone's listening history. If support genuinely needs it later,
  that is a separate decision with its own audit entry.
- `/admin/audit` — the append-only trail, newest first.

### B3. Rules for admin mutations

Every one of these is a rule because breaking it is invisible until it matters:

- **No optimistic UI.** The settings form in box 3.6 saves optimistically
  because a speed change is trivial to get wrong. Changing a customer's
  subscription is not. Await the action, render the server's answer.
- **Typed confirmation for destructive actions.** Disabling an account requires
  typing the account's email, matching the `Plan`/`danger` pattern already in
  `components/ui/`. A checkbox is not a confirmation.
- **Every mutation writes an audit row** — that is the backend's job, but the
  action must not swallow the result. If the audit write fails, the mutation
  fails.
- **`role` is not editable in the UI.** There is no control for it, at all. It
  is set with `mongosh`. Say so in a comment so the next person does not add one.

## Part C — conventions that will bite here

- `"use server"` modules may export **only async functions**. A parser or a
  constant in the same file passes `tsc` and fails `next build`.
- `TextField` cannot render in a Server Component (`useId`). The admin filter
  form is server-side — use `fieldTrackClass` and static ids, as
  `/settings` already does.
- Logical CSS properties only (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`), even
  though the app is LTR: one admin table cell may hold a Persian `displayName`.
- Locale is pinned to `"en-US"` for every `Intl` call.
- A count derived from other rows is never stored (D-something, `AGENTS.md`) —
  the admin overview aggregates; it does not denormalise.

## Definition of done

- `npm run check` green: declarations in sync, `tsc`, `eslint`, `vitest`,
  `next build`.
- A non-admin hitting `/admin` gets a 404, and a non-admin calling an admin
  action directly gets a refusal — test the action, not the page.
- A lapsed account's `/library`, `/history` and `/playlists` render exactly as
  before, with one added caption.
- `grep -r "canSync\|capability" front/src/components/player front/src/lib/player`
  returns nothing.
- `front/docs/PLAN.md` — tick 6.1–6.4 and box 3.6's successor if any, with a
  §14 log entry; update D1 to "resolved: (b), built" with the date.
- `front/AGENTS.md` — record the new act, the `paywall` failure kind, and the
  `requireAdmin` rule.
