# 02 — Paid sync on the phone, without ever taking the player away

> Task brief for an implementation agent working in `/Users/syd/work/Pejvak/mobile`.
>
> Read `../AGENTS.md` and `AGENTS.md` first. `back/prompts/02-entitlements-and-admin.md`
> is the backend half of this contract and defines the wire shape; read it too.
> `back/` is read-only for this task.

## Mission

The backend can now refuse a sync. The phone has to handle that refusal in a way
that is **invisible to anyone who is not looking for it**, and that never costs
the listener a single thing they already had.

Concretely: playback keeps working. Local history keeps being written. Every
session that cannot be pushed stays queued and gets pushed the moment the
account can sync again. Nothing is deleted, nothing is marked permanently
failed, and no screen ever says "error" for a billing state.

## The four things that must not change

These are not aspirations; each is a line of existing code that this task must
leave working.

1. **`getPendingSessions` must keep returning blocked rows.**
   `LocalDBService.getPendingSessions` selects
   `WHERE sync_status IN ('pending', 'failed')`. That is the whole retry
   mechanism. If you add a `"blocked"` value to `SyncStatus` and set it on a
   refused sync, every row disappears from that query and the backlog is
   silently orphaned — the listener pays, and their history from the last three
   months never arrives. **Do not add a status.** The rows stay `failed`
   (`runSync`'s existing catch already does the right thing) or `pending`, and
   the *reason* is derived from the cached capability, not stored per row.

2. **`runSync`'s catch stays.** It marks every attempted row `failed`, which
   already means "retry on the next run". A paywall refusal is just another
   failure to it. Do not special-case it into a terminal state.

3. **Playback never reads entitlement.** Not in `TrackPlayerService`, not in the
   player screen, not in the queue. If a grep for `capability` or `canSync`
   reaches `src/services/TrackPlayerService.ts`, the change is wrong.

4. **The local database is never pruned because of billing.** No row, in any
   table, is deleted on lapse. `softDeleteSession` and friends exist for the
   listener's own actions only.

## 1. The client half of the rule

The backend returns:

```ts
type SyncCapability = {
  canSync: boolean;
  reason: "trialing" | "active" | "trial_expired" | "payment_failed"
        | "canceled" | "disabled" | null;
  trialEndsAt: number | null;
  currentPeriodEnd: number | null;
};
```

Add `mobile/src/lib/entitlement.ts`:

- The `SyncCapability` type, re-exported from the generated declarations where
  possible — **do not hand-write a second copy** if `src/lib/generated/` already
  carries it after `back/` regenerates. Check first; if it is not there, define
  it once here and note in a comment that it mirrors the backend.
- `DEFAULT_CAPABILITY` — `canSync: true, reason: "trialing", trialEndsAt: null`.
  **Optimistic on boot.** An app that starts in a "blocked" state because a
  request has not finished yet is an app that shows a paywall to a paying
  customer on a bad train connection.
- `describeCapability(capability, now): string | null` — one sentence for the
  settings screen, or `null` when there is nothing to say (trialing with plenty
  of time left, or active). Every string is English, per the same rule the rest
  of the app follows.
- `daysLeft(endsAt, now)` — a whole number, floored, never negative.

**Never compute the trial locally.** `trialEndsAt` comes from the server and
`now` is `Date.now()`; the phone only formats the difference. Do not derive the
end date from `trialStartedAt + 14 days` on the device — the device clock is
attacker-controlled and, more mundanely, wrong.

## 2. Reading and caching it

`SettingsService` (or a small `EntitlementService`) caches the last known
capability in the same local store the settings snapshot uses, with the epoch ms
it was read at.

- Read on boot and after login, from `getMyEntitlement`.
- Re-read after **every refused sync** — the reason may have changed since boot.
- Staleness rule: a cached capability older than 24 h is a *hint*, not an
  answer. On boot with a stale cache, render optimistically and refresh in the
  background; never block the first frame on the network.

`SyncService` gets one change: when `syncLocalData` (or `registerTrack`) returns
the `entitlement_required` refusal, it **re-reads the capability and returns a
result that carries it**, so `useSyncStatus` can say why. Do not throw past the
service boundary — `runSync` already models failure as data.

## 3. Where it surfaces — three places, all calm

**Settings (`src/app/settings.tsx`).** A "Sync" section above the existing
preferences:

| state | what it says |
|---|---|
| `trialing` | "Syncing. Trial ends in 9 days." |
| `active` | "Syncing. Renews on 14 March." |
| `trial_expired` | "Your trial has ended. New listens are saved on this device and will sync when you subscribe." |
| `payment_failed` | "We could not renew your subscription. Your history is safe — sync resumes when payment goes through." |
| `canceled` | "Subscription canceled. Your history is still here; new listens stay on this device." |
| `disabled` | "Syncing is turned off for this account. Contact support." |

One primary action per state (`Subscribe`, `Manage`, `Retry payment`,
`Contact support`). No modal on launch, no badge on the tab bar, no blocking
sheet. A billing state is not an emergency.

**The sync indicator (`use-sync-status.ts`).** It already exposes
`pendingTotal` and `lastSyncAt`. Add `capability` and let the "N waiting" label
carry the reason when there is one: "37 waiting · sync paused". The tap target
goes to Settings, not to a purchase sheet.

**The history screen.** When there are unsynced rows and sync is paused, one
quiet line above the list, once — not per row:

> 37 listens are saved on this device. They will sync when you subscribe.

This is the single most important sentence in the feature. It tells the
listener their data is safe at exactly the moment they would otherwise assume it
was lost.

## 4. Purchases — the seam, not the vendor

Do not integrate a payment SDK in this task. Add:

- `src/lib/purchases.ts` with a narrow interface — `purchase()`,
  `restore()`, `isAvailable()` — and a no-op implementation that resolves to
  `{ ok: false, reason: "unavailable" }`. Every call site depends on the
  interface only.
- A comment recording the constraint that will decide the vendor: **Google Play
  requires Play Billing for digital goods sold inside an Android app.** If sync
  is sold in-app, a Stripe link in the app is a policy violation. Decide the
  rail before writing any UI that says a price.

The UI never states a price. It says "Subscribe" and lets the store's own sheet
show the number. Hardcoding "$2" in the app means a price change ships as an
app update.

## 5. Tests

`jest` in `src/lib/__tests__/`:

- `describeCapability` for each reason, including the null case returning `null`.
- `daysLeft` floors, and returns 0 (not negative) once passed.
- A refused `syncLocalData` leaves rows `pending`/`failed` and **does not
  change their status to anything new** — assert against the actual
  `setSessionSyncStatus` call args.
- `getPendingSessions` still returns a `failed` row after a refusal (the
  regression that would orphan a backlog).
- Boot with an empty cache yields `canSync: true`.
- `DEFAULT_CAPABILITY` is not mutated by a failed read.

## Definition of done

- `npx tsc --noEmit` and `npx eslint` clean; `jest` green.
- A grep for `canSync` / `capability` returns nothing in `TrackPlayerService.ts`,
  the player screen, or the queue.
- `SyncStatus` still has exactly four values.
- Killing the network, then simulating a refusal, then restoring both: the
  backlog arrives on the next successful sync. Verify this by hand, not only in
  a test — it is the one behaviour the whole feature rests on.
