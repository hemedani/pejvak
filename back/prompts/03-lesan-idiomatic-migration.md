# Lesan-idiomatic migration of the entitlements, billing and admin surface

Status: executing
Owner: backend (`back/`)
Spec: `../AGENTS.md`, `AGENTS.md`, `docs/DEEPSEEK.md`, `docs/QWEN.md`

## Why

The entitlements/billing/admin surface was added by another agent and works under
`admin.hurl` only because every request omits `get`. Lesan validates the whole
`details` object with superstruct, and `object()` is strict, so a validator whose
root lacks `get` rejects the real client's `{ set, get }` payload. Verified:

```text
is({set:{},get:{}}, object({set: object({})})) === false
create(..., object({set: object({})})) throws "At path: get -- Expected a value
of type 'never'"
```

The same gap makes `ReqType` emit no `get` for those acts, so
`front/src/lib/call-act.ts` resolves `get` to `never`.

This migration closes the contract gap, aligns response shapes with Lesan
conventions, fixes a missing `requireActive`, and removes the circular coupling
through `src/bootstrap.ts`.

## Decisions

- Full Lesan-idiomatic migration (not a minimal patch).
- `AdminAuditLog` fields stay **flat**. The log is append-only and queried by
  exact keys; nesting would force nested indexes/filters and a backfill on
  immutable rows. Only the `targetType` vocabulary and the index improve.
- Declarations and both vendored copies are updated in the same change.
- `get` is **optional** everywhere it is added, so existing callers that omit it
  keep working.
- A list act's `get` describes one **row**; the `{ rows, total, page, limit }`
  wrapper and computed columns (`planCode`, `subscription`, `usage`,
  `subscribers`) are always returned. This preserves the existing
  `get: { _id: 1 }` calls that still assert `rows[0].planCode`.
- Computed/response-shaped acts declare a response-shaped `get` and enforce it
  with `pickByGet`.

## Tasks

### Phase 0 — Tests first

- [ ] Add a realistic `get` to every `http/admin.hurl` request whose act
      currently omits one.
- [ ] Assert projection behaviour (asking for one field hides the others).
- [ ] Add coverage for `adminListSubscriptions`, `adminGetUserHistory`,
      `adminGetPlatformSetting`, `adminResetUserPassword`.
- [ ] Change `adminGetUser` requests to the response-shaped `get`.
- [ ] Watch the suite fail against the current code (RED).

### Phase 1 — Shared helpers

- [ ] `utils/projection.ts`: add recursive `pickByGet(value, get?)`.
- [ ] `src/entitlements/structs.ts`: `limitsProjection`, `quotaProjection`,
      `entitlementProjection`.
- [ ] `src/admin/query.ts`: `safeUserStruct()` derived from `SAFE_USER_FIELDS`.

### Phase 2 — Validators and fn wiring (19 computed + 5 list acts)

Computed / document-shaped:

| Act | Get shape |
|---|---|
| `getPlatformStatus` | signupsEnabled, aiEnabled, maintenanceMode, announcement |
| `adminGetPlatformSetting` | same + key |
| `adminUpdatePlatformSetting` | same + key |
| `getMySubscription` | plan, price, limits, history quota |
| `createCheckout` | reference, provider, status, url/instructions, amount |
| `confirmCheckout` | reference, status, alreadyProcessed, planCode, window |
| `cancelMySubscription` | canceled, status, cancelAtPeriodEnd, periodEnd |
| `getMyAiUsage` | period, enabled, plan, allowance, bonus, used, remaining |
| `adminGrantAiCredits` | userId, periodKey, granted, bonusCredits, creditsUsed |
| `adminGrantSubscription` | reference, entitlement, activation window |
| `adminRevokeSubscription` | revoked, planCode, status, limits |
| `adminConfirmTransaction` | reference, status, alreadyProcessed, window |
| `adminRefundTransaction` | refunded, reference, status, accessRevoked |
| `adminDeleteUser` | deleted, userId, purged |
| `adminResetUserPassword` | userId, password, generated |
| `adminGetOverview` | users, activity, content, revenue, quota |
| `adminGetTimeseries` | days[], from, to |
| `adminGetTopTracks` | days, rows[] |
| `adminGetRetention` | cohorts[], weeks |
| `adminGetUser` (refine) | user (safe struct), entitlement, historyQuota, usage, recentSessions |

List acts (row-shaped `get`):

| Act | Row get |
|---|---|
| `adminListPlans` | `selectStruct("plan", 1)`; wrapper + subscribers |
| `adminListSubscriptions` | `selectStruct("subscription", 1)` |
| `adminListTransactions` | `selectStruct("billingTransaction", 1, ["metadata"])` |
| `adminListAuditLogs` | `selectStruct("adminAuditLog", 1)` |
| `adminGetUserHistory` | `selectStruct("playbackSession", 1, ["clientId", "deviceInfo"])` |

Also replace `selectStruct("user", 1)` with `safeUserStruct()` in
`adminListUsers`, `adminGetUser`, `adminUpdateUser`.

### Phase 3 — Contract fixes

- [ ] `adminListPlans` returns the standard wrapper (only response-shape change).
- [ ] `adminGetUser` honours `get`.
- [ ] `confirmCheckout` gets `requireActive`.
- [ ] Every admin list act returns `{ rows, total, page, limit }` via `pageArgs`.

### Phase 4 — Module boundaries and audit hygiene

- [ ] Move `DEFAULT_PLANS` / `ensureDefaultPlans` to
      `src/entitlements/defaultPlans.ts`.
- [ ] Move platform-setting helpers to `src/platform/setting.ts`.
- [ ] Move `ensureIndexes` to `src/db/indexes.ts`; `src/bootstrap.ts` orchestrates.
- [ ] Move `currentPeriodKey` to `src/ai/period.ts`.
- [ ] Add `"aiUsage"` to `AuditInput.targetType`; use it from
      `adminGrantAiCredits`.
- [ ] Audit index becomes `{ targetType: 1, targetId: 1, createdAt: -1 }`.
- [ ] Keep `as never` casts: established ODM idiom; only remove if `deno check`
      proves it unnecessary.

### Phase 5 — Declarations

- [ ] `deno check mod.ts`, `deno lint`, `deno fmt`.
- [ ] Regenerate `declarations/selectInp.ts` by booting the server once.
- [ ] Copy byte-for-byte to `front/src/types/declarations/selectInp.ts` and
      `mobile/src/lib/generated/selectInp.ts`.
- [ ] Verify with `cmp`; run `npm run check` in `front/`.

### Phase 6 — Docs

- [ ] `back/AGENTS.md`: 21 → 22 acts; document `get` conventions, flat audit
      fields, the new module split, the audit index.
- [ ] Root `AGENTS.md`: only if an act count/structure line is now wrong.

## Verification

```bash
cd back
deno check mod.ts
deno lint
deno fmt --check
deno task test:all        # requires MongoDB and a running server
cmp declarations/selectInp.ts ../front/src/types/declarations/selectInp.ts
cmp declarations/selectInp.ts ../mobile/src/lib/generated/selectInp.ts
cd ../front && npm run check
```

## Out of scope

- Enforcing `get` in pre-existing listener acts (`getMyStats` accepts but ignores
  it).
- Repo-wide ODM cast cleanup.
- Recurring billing / webhooks.

## Risks

- Declarations are a breaking client change; backend and both vendored copies
  belong together.
- `adminListPlans` changes from a bare array to a wrapper (panel not built yet).
- Honouring `get` can hide fields a caller used to receive implicitly; the hurl
  updates make that explicit.
