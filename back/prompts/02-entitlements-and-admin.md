# 02 — Entitlements, the sync gate, and the operator panel

> Task brief for an implementation agent working in `/Users/syd/work/Pejvak/back`.
>
> Read `../AGENTS.md` and `AGENTS.md` first. They are authoritative for Lesan
> patterns, act conventions, validation, idempotency, and the schema-vs-folder
> rule. This document defines the **product contract** for paid sync and for
> cross-user administration. Where this file and `AGENTS.md` disagree on
> mechanics, `AGENTS.md` wins; where it is silent on product behaviour, this
> file is the decision.

## Mission

Pejvak is going to charge for **server-side persistence**, not for playback.
The player must stay free and fully usable offline forever. What a listener pays
for is that their history, annotations, playlists, runs and saved collections
exist somewhere other than one device.

This task adds three things and nothing else:

1. **An entitlement** — a stored, server-authoritative answer to "may this
   account write to the server right now?".
2. **A gate** on the two acts that write listener data (`syncLocalData`,
   `registerTrack`), which refuses *new writes* without ever destroying or
   hiding data already written.
3. **A role** on `User` plus the small set of admin acts an operator needs to
   run the business — look up an account, change a plan, disable an account,
   read the audit trail.

## The one rule that shapes everything

**The server is the only authority on entitlement. Clients render, they do not
compute.**

There is exactly one function in this codebase that decides whether an account
may sync, and it lives here. The web app and the Android app must never
reimplement "is the trial over" — two implementations of a billing rule is two
answers, and the one that disagrees will be the one a paying customer sees.

That means the acts must return a **capability object**, not a plan name:

```ts
type SyncCapability = {
  canSync: boolean;
  /** Why not. `null` when `canSync` is true. */
  reason: "trialing" | "active" | "trial_expired" | "payment_failed" | "canceled" | "disabled" | null;
  /** Epoch ms. Null when there is no trial (paid, or never started). */
  trialEndsAt: number | null;
  /** Epoch ms. Null for trialing and lapsed accounts. */
  currentPeriodEnd: number | null;
};
```

`reason` is an enum the clients switch on. It is **not** prose. Do not return
`"Your trial has ended"` as a reason and expect a client to parse it.

## What this task must not do

- **Do not gate reads.** A lapsed account must be able to read every row it
  already synced, on every device, forever, for free. Locking a listener out of
  data they gave you is not a paywall, it is a hostage situation, and it is the
  single fastest way to turn a churned customer into a hostile one. Only writes
  are gated.
- **Do not delete anything on lapse.** Not sessions, not annotations, not the
  account. Retention is a separate policy with a separate clock; see
  "Retention" below.
- **Do not put the entitlement in the JWT.** `utils/token.ts` mints a token that
  lives 90 days with `{_id, username, email}` and no refresh path. Baking a
  plan into it would mean a cancellation takes up to 90 days to take effect, and
  a payment takes up to 90 days to take effect either. The check is per request,
  against the database.
- **Do not widen `setUser`.** `utils/setUser.ts` projects `{_id: 1}` for *every*
  authenticated act. Adding entitlement fields there taxes every read in the
  product — including the library and the player — to serve two write acts.
  Read the entitlement inside the gate, not in the shared preAct.
- **Do not add a `"blocked"` status to anything the clients store.** See the
  mobile brief; it is called out there because it silently orphans rows.
- **Do not build a billing integration.** This task stores and enforces a
  state. Who sets it — Stripe, Google Play, Zarinpal, a human with `mongosh` —
  is out of scope and deliberately swappable. Define the seam, not the vendor.

## 1. The `entitlement` sub-document

Extend `models/user.ts`. Follow the shape already used for `setting_pure`: a
nested pure object, `optional` so every existing document stays valid and
`register` stays untouched.

```ts
export const entitlement_pure = object({
  /** What the account is entitled to. One value today; the enum exists so a
   *  later tier does not require a migration. */
  plan: defaulted(enums(["none", "sync"]), "none"),
  status: defaulted(
    enums(["trialing", "active", "lapsed", "canceled", "disabled"]),
    "trialing",
  ),
  /** Epoch ms. Stamped by the server on the first successful sync — never by
   *  a client, and never at registration. */
  trialStartedAt: defaulted(nullable(number()), null),
  trialEndsAt: defaulted(nullable(number()), null),
  currentPeriodEnd: defaulted(nullable(number()), null),
  /** Free-form vendor handle. The backend never interprets it. */
  provider: defaulted(nullable(string()), null),
  providerCustomerId: defaulted(nullable(string()), null),
  updatedAt: defaulted(number(), 0),
});
```

Add `entitlement: optional(entitlement_pure)` to `user_pure`.

**Trial starts on first sync, not on registration.** A trial that burns while
the account is dormant gives away the product to someone who was never going to
convert, and it starts the clock before the listener has any data worth keeping.
Stamp `trialStartedAt`/`trialEndsAt` inside the gate, on the first write, with
`Date.now()`. Make the length a single named constant (`TRIAL_DAYS = 14`) in one
module so the clients never hardcode it.

**`disabled` is an operator action, not a billing state.** A disabled account
can log in and read, and cannot sync or be re-enabled by paying. It exists so
support can stop an abusive account without deleting it.

## 2. The resolver

One module, `src/entitlements/resolve.ts`, exporting a single pure function and
one thin reader:

```ts
/** The only place the rule lives. Pure: no clock, no database. */
export function resolveCapability(
  entitlement: Entitlement | null | undefined,
  now: number,
): SyncCapability;
```

Rules, in order — the order *is* the specification:

1. `status === "disabled"` → `canSync: false, reason: "disabled"`.
2. `status === "active"` and `currentPeriodEnd !== null` and
   `now < currentPeriodEnd` → `canSync: true, reason: "active"`.
3. `status === "active"` and the period has passed → treat as
   `payment_failed`: `canSync: false`. An expired paid period is not a free
   extension. (Do not mutate the stored status on read — the resolver is pure,
   and a read that writes is a read that can fail a page.)
4. `status === "trialing"` and `trialEndsAt !== null` and `now < trialEndsAt`
   → `canSync: true, reason: "trialing"`.
5. `status === "trialing"` and the trial has passed → `canSync: false,
   reason: "trial_expired"`.
6. `status === "canceled"` → `canSync: false, reason: "canceled"`.
7. **`trialStartedAt === null`** (a brand-new account that has never synced) →
   `canSync: true, reason: "trialing"`, with `trialEndsAt: null`. The trial has
   not started; the first write starts it.
8. Anything else → `canSync: false, reason: "trial_expired"`. Fail closed.

Note rule 7's interaction with rule 4: an account that has never synced has no
`trialEndsAt`, so it must not fall through to "expired". Write a test for
exactly this case — it is the bug that would lock out every new user on day one.

The thin reader, `readCapability(userId)`, does one `findOne` projecting only
`{ entitlement: 1 }` and calls the pure function with `Date.now()`. Keep the
clock at the boundary so the function is testable without freezing time.

## 3. `getMyEntitlement`

New act, `src/entitlements/getMyEntitlement/`, registered under the **`user`**
schema (`preAct: [setTokens, setUser]`) — the folder is `entitlements/`, the
schema is not. Same trap as `settings/` registering under `user`.

Returns the `SyncCapability` object above, plus `plan` and `status` for display.
It must never return `providerCustomerId`.

Every client calls this on boot and after any sync refusal. It must be cheap: one
projected `findOne`, no aggregation, no join.

## 4. The gate

A preAct or an in-function check on **exactly two acts**:
`syncLocalData` and `registerTrack`. Both live under the `track` schema.

Put it in one exported helper and call it from both, so there is one
implementation:

```ts
export async function requireSyncCapability(userId: string): Promise<void>;
```

**A refusal must be structured, not a message.** `utils/throwError.ts` throws a
bare `Error(msg)`, and the web client classifies act failures with a **regex
over the message string** (`front/src/lib/errors.ts`, `classifyActFailure`). A
paywall that arrives as prose would be classified as a `server` error and shown
to the listener as a red "something broke" state, and would teach the next
person to add a string match, which is the fragility this whole design is
avoiding.

So the refusal needs a code the clients can switch on. Two acceptable shapes;
pick one and document it in `AGENTS.md`:

- **(a) Return, don't throw.** Let the act return
  `{ ok: false, code: "entitlement_required", capability: {…} }` and have the
  validator/`get` allow it. Cleanest for the client, but it changes the
  response shape of a hot act — check every existing caller first.
- **(b) Throw a typed error** that Lesan surfaces with a distinguishable field,
  and widen `classifyActFailure` to read that field rather than a pattern.

Whichever you choose, the **client-side classifier change belongs in the same
commit as the backend change**, or the first paying-gate rollout shows every
free user a server error. Say so in the commit message.

The gate runs **before any write**, so a refused call leaves the database
untouched — no half-applied batch. `syncLocalData` is idempotent on `clientId`,
so a refused call that the client retries later is safe by construction; keep it
that way.

`registerTrack` is gated too, and this matters: a session cannot exist without
its parent track. If you gate only `syncLocalData`, a lapsed account keeps
writing tracks forever while its sessions pile up locally — a slow leak with no
upside.

## 5. `role` and the operator acts

Add `role: defaulted(enums(["listener", "admin"]), "listener")` to `user_pure`.

**`role` must never be settable through an act.** It is changed with `mongosh`
or a migration, full stop. An act that can grant admin is an act that can be
called by an attacker who found one IDOR; there is no version of this that is
worth the convenience.

Add `requireAdmin` to `utils/`, mirroring `setUser`: resolve the user, read
`role`, throw if it is not `admin`. **Every** admin act calls it as its first
line. Not a middleware you can forget, a call you can see in the diff.

Admin acts, all under the `user` schema in a `src/admin/` folder:

| act | what it does | notes |
|---|---|---|
| `listUsers` | paged, filterable by email/username/status | project `_id, email, username, role, entitlement, createdAt`; never `password` |
| `getUserDetail` | one account + counts (tracks, sessions, playlists) | counts come from the existing `getMyStats` logic with the `user._id` filter parameterised — do not write a second aggregation |
| `setUserEntitlement` | set `plan`/`status`/`currentPeriodEnd` | the operator's override; writes an audit row |
| `setUserDisabled` | flip `disabled` | separate from the above so the audit trail can tell "stopped paying" from "banned" |
| `listAuditEvents` | paged audit trail | read-only |

**Admin reads must not reuse the `getMy*` acts.** Every one of them hard-filters
`user._id` in the query. Parameterising that filter is a one-line change that
silently removes the only security boundary in the product; write the admin
query explicitly, with the `_id` you were given, and a test that proves an
admin asking for user A does not receive user B's rows.

## 6. The audit trail

New model `models/auditEvent.ts`:

```ts
{
  actorId: ObjectId,       // who did it
  action: string,          // "entitlement.set", "user.disable"
  targetUserId: ObjectId,  // who it was done to
  before: optional(object),// the fields that changed, before
  after: optional(object), // and after
  at: number,              // epoch ms
}
```

Append-only. Nothing in the product updates or deletes an audit row, and there
is no act that can. Index on `{ targetUserId: 1, at: -1 }` and `{ at: -1 }`.

Write one for **every** admin mutation. An operator panel with no trail is an
operator panel where you cannot answer "who downgraded this paying customer and
when", which is the first question you will actually have.

## 7. Retention (policy, not code)

Do not implement deletion in this task. Do implement **one exported constant and
one documented answer**, because a paywall without a retention policy is a
promise you have not made and will be held to anyway:

- `RETENTION_AFTER_LAPSE_DAYS = 365`, exported from the entitlements module.
- A lapsed account's data is **readable indefinitely** and **retained** for at
  least this long.
- Document in `AGENTS.md` that any future cleanup job must read that constant,
  and must warn the account before deleting.

## 8. Tests

`deno test` plus the existing `http/e2e.hurl` style. Cover at minimum:

- `resolveCapability` — every branch, including rule 7 (never-synced account is
  **not** expired) and the "active but period elapsed" case.
- The gate refuses a lapsed account on both acts and writes nothing.
- The gate admits a trialing account and stamps `trialStartedAt` exactly once.
- A second sync does not restamp the trial.
- A non-admin calling an admin act gets a refusal, not a partial result.
- An admin calling `getUserDetail` for user A cannot see user B's sessions.
- `setUserEntitlement` writes exactly one audit row with a correct `before`.

## Definition of done

- `deno check` clean, tests green, `http/e2e.hurl` extended.
- `getMyEntitlement` returns the capability object for a fresh account without
  creating an entitlement document.
- A lapsed account can still read everything it synced; it cannot write.
- Nothing in the diff deletes data.
- `AGENTS.md` records: the schema-vs-folder placement of the new acts, the
  refusal shape chosen in §4, and the retention constant.
