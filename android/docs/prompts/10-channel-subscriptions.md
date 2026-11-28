# Prompt 10 — Channel Subscriptions (Android brief & decisions)

Append-only. Sector: `android/`. Roadmap: [`../plans/10-channel-subscriptions.md`](../plans/10-channel-subscriptions.md).
Backend: [`../../back/docs/plans/01-listener-channels.md`](../../back/docs/plans/01-listener-channels.md)
(the subscription change lives in `back/src/channels/` and is pinned by `back/http/channels.hurl`).

## Original brief (owner's words, condensed)

Listeners should be able to **follow** a channel they like, see **how many people follow** a channel, get
a **"Following" list** of the channels they follow, and creators should be able to **see who follows
them**. A follow is a one-tap toggle. It must not break the offline-first posture, must not turn into a
second sync queue, and must reuse the existing channels surfaces and auth modal — no new hard gate. The
native `android/` app is the product; `mobile/` (RN) is deprecated and untouched.

## Decisions log (append-only)

**D1 — Following is a server-owned read-cache, never a device-owned sync row.** The follow relationship
lives on the server (`channelSubscription` join model). The phone mirrors *which* channels the listener
follows (`channel_subscriptions`) and the `subscriber_count` for offline rendering, but **never** pushes
either through `syncLocalData` — the same posture as the channel rows themselves (plan 07 D2). The
follow/unfollow action is a direct act call, not the offline batch queue. A listener's **playback** of a
channel episode still syncs as a normal `PlaybackSession` (unchanged).

**D2 — The local source of truth for "do I follow this?" is the join table, not a channel column.** A
general directory pull can overwrite a channel column but can never touch `channel_subscriptions`. The
detail button and the shelf both read the join table; `getChannel.isSubscribed` and the
subscribe/unsubscribe reply **reconcile** it (insert/delete), they do not replace it. `subscriber_count`
is a plain channel column because it describes the channel, not the relationship.

**D3 — Following requires a session and routes through the existing auth modal.** A signed-out tap on
Follow opens the round-13 non-blocking `AuthSheet` (plan 07 D4) rather than a hard gate. The app is never
interrupted; the action resumes after sign-in.

**D4 — A creator cannot follow their own channel.** The server refuses self-follow (501), so the client
**hides** the follow control when `channel.isMine` and shows the **Subscribers** action instead. This is a
UI decision backed by a server guard, not a client-only rule.

**D5 — Idempotent by contract; trust the reply.** `subscribeChannel` and `unsubscribeChannel` return
`{ subscribed: Boolean, subscriberCount: Int }` and are idempotent (a replay is success, not an error; the
counter is `$inc`'d only on a real change and clamped at zero). The client applies the returned state to
the join table + count and never treats a repeat as a failure.

**D6 — The owner subscriber list is owner/operator-only.** `listChannelSubscribers` returns
`{ rows, total, page, limit }` of `{ _id, username, displayName, avatarUrl }` for the channel owner or an
operator; everyone else gets a 501 (`success:false`, "Channel not found" — deliberately not a 403, so a
channel id cannot be probed). The client only offers the surface when `isMine` and renders a refusal as a
non-blocking `InlineNotice`, never a crash.

**D7 — The subscriber count is informational and formatted, never authoritative.** Keep the raw
`subscriberCount` on `Channel`; render a compact, pure `formatSubscriberCount` (null at 0, `1.2k`/`3.4M`
above 999). It is a cache value that may be stale offline; refresh on the next read. Do not derive any
other number from it.

**D8 — Design system governs every surface.** `BubbleButton`/`GlassChip` for actions, `ListRow`/
`ListGroup` for the shelf and subscriber list, `PaletteTile` for avatars, `InlineNotice`/`EmptyState`/
`SkeletonRows` for states, `GlassSheet` for any modal (a titled sheet passes `icon`). All strings in
`strings.xml`; all colours from `ui/theme/`; new glyphs (`person_add`, `person_remove`, `groups`) behind
`Icon`/`ICON_GLYPHS` and pinned in `IconCatalogTest`. Light + dark from day one; motion gated on
`useMotionEnabled()`.

**D9 — Wire contract is SHIPPED; this pins the exact act surface the client codes against.** Verified
against a live Mongo (`back/http/channels.hurl`, subscriptions section green). Every call is the standard
`POST /lesan` `{ model, act, details:{set,get} }` with the JWT in the **`token` header (no Bearer)** and
the `{ success, body }` envelope; **a refusal is HTTP 501 with `{ success:false, body.message }`**.

- `channel/subscribeChannel` — `set { channelId }`, `get { subscribed, subscriberCount }` → `200`
  `{ subscribed:true, subscriberCount }`. Idempotent. Refuses a removed channel ("Channel not found")
  and self-follow ("You cannot subscribe to your own channel"). Requires an **active** session.
- `channel/unsubscribeChannel` — `set { channelId }`, `get { subscribed, subscriberCount }` → `200`
  `{ subscribed:false, subscriberCount }`. Idempotent (absent row is success); counter clamped ≥ 0.
- `channel/getMySubscribedChannels` — `set { page, limit }` (the `pagination` mixin; no search),
  returns a **bare array** of channel rows (newest follow first), same projection as `listChannels`.
  Removed channels are skipped. Requires a session.
- `channel/listChannelSubscribers` — `set { channelId, page, limit }`, returns
  `{ rows, total, page, limit }` where each row is `{ _id, username, displayName, avatarUrl }` (an
  allow-list; never `email`/`setting`/`role`/`status`). Owner + operator only.
- `channel/getChannel` — now returns a **computed `isSubscribed: Boolean`** in addition to the row,
  `playlists[]` and `audios[]`. It is always present regardless of the `get` projection (like
  `playlists`/`audios`); `subscriberCount` is a pure field and is returned only when requested, so the
  client's `channelProjection` **must include `subscriberCount`**.
- `channel/listChannels` — each row carries `subscriberCount` (request it in the projection); useful for
  cards. No `isSubscribed` here — that is per-listener and comes from `getChannel` / the join table.

**D10 — Deferred / explicitly not built (so nothing is silently dropped):** push notifications for new
episodes of a followed channel, a follower activity feed, blocking/muting a channel, follower counts on
anything beyond the channel page/cards, and following a *playlist* (only channels are followable). None
are v1.

## Non-negotiables carried from android AGENTS

- Offline-first; sync never blocks or errors the UI; integer seconds; `contentHash` identity; JWT in the
  `token` header (no Bearer); device-only prefs never sync.
- **Zero Kotlin warnings** + JVM tests green is the ship gate; on-device light/dark/gesture verification
  is **always the owner's**, never claimed here.
- Never touch `mobile/`. Backend lands before the client (it has).

---

## Enhanced implementation prompt — backend is LIVE (start building)

The subscription acts are deployed on the same server the app already targets
(`BuildConfig.LESAN_BASE_URL`). No base-URL or transport change: the follow calls go through the existing
`LesanClient`/`ChannelRemoteDataSource` exactly like the channel reads and creator writes.

### Build order
1. **S1 — data + transport (SUB-D01..D04):** migration v5 (`subscriber_count` + `channel_subscriptions`
   join mirror + DAO), domain `subscriberCount`/`formatSubscriberCount`/`ChannelSubscription`, extend the
   remote projection/parse with `subscriberCount` and `isSubscribed`, add the four act wrappers, and the
   repository methods returning `ChannelOp<…>`. **Acceptance: a manual subscribe from a debug call
   updates the join table + count and the shelf renders it.**
2. **S2 — surfaces (SUB-U01..U04):** follow/unfollow on detail (hidden for `isMine`; signed-out →
   `AuthSheet`), subscriber count on detail + cards, the "Following" shelf route `subscribed` + hub entry,
   and the owner subscriber list. Reconcile `getChannel.isSubscribed` into the join table in
   `loadChannel` so the button is correct after a cold open.
3. **S3 — design/a11y/tests (SUB-X01..X02, SUB-T01..T03):** glyphs behind `Icon` + `IconCatalogTest`,
   all copy in `strings.xml`, pure unit tests, clean `assembleDebug`, then the owner's device pass.

### Invariants to honour
- Follow needs a session; signed-out → `AuthSheet` (D3). Self-follow is hidden client-side and refused
  server-side (D4).
- The join table is the local truth for "do I follow"; the server reply reconciles it (D2/D5). A directory
  pull must not clear it.
- A 501 refusal (self-follow, non-owner subscriber list, network) is a non-blocking `InlineNotice`, never
  a crash or blocking dialog (D6).
- `subscriberCount` is informational: format it, keep it raw on the model, refresh on read (D7).
- Design system governs every surface (D8).

### Open items to verify during integration (flag, don't guess)
- **`getChannel` projection:** confirm on the live server that `isSubscribed` is present even when the
  client's `get` omits it (the fn returns it as a computed column) and that `subscriberCount` arrives when
  requested — pin whichever form the deployment returns.
- **Bare-array shape:** `getMySubscribedChannels` returns an array, not the `{rows,…}` envelope; the
  parser must branch on `JsonArray` (the same as `getMyChannels`).
- **Empty state:** a freshly registered listener follows nothing; exercise both the empty shelf and a
  populated one (subscribe from a second account / the creator's own account cannot self-follow).
- On-device light/dark/gesture checks remain **the owner's** — never claimed here.

### Ship gate (unchanged)
`./gradlew assembleDebug` with **zero Kotlin warnings** + JVM unit tests green (`testDebugUnitTest`,
`IconCatalogTest`, contrast contract). Tick each `SUB-` box + append a `../plans/10-channel-subscriptions.md`
§8 row after EVERY small task; update `android/docs/summary.md`.
