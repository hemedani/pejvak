# Plan 10 — Channel Subscriptions (Android)

Sector: `android/`. Brief: [`../prompts/10-channel-subscriptions.md`](../prompts/10-channel-subscriptions.md).
Backend counterpart: the subscription change inside
[`../../back/docs/plans/01-listener-channels.md`](../../back/docs/plans/01-listener-channels.md) — new
`channelSubscription` join model + `subscriberCount` on `channel`, and the four acts
`subscribeChannel` / `unsubscribeChannel` / `getMySubscribedChannels` / `listChannelSubscribers`
plus a computed `isSubscribed` on `getChannel`.
Precedence: code > plan > `android/AGENTS.md` > docs.

> **Status: backend SHIPPED + verified (`channels.hurl` green); Android build can start now.** The
> follow/unfollow acts are live and pinned by the hurl suite. This plan is the native feature inventory;
> every `SUB-` ID ends up implemented or explicitly retired. No Android subscriber code exists yet —
> the plan-07 mirror (`channels`/`channel_playlists`/`channel_audios`, DB v4) has **no** follow concept.

---

## 1. What lands on the phone

A listener can now **follow** a channel, and the surfaces around that fact:

1. **Follow / unfollow** on a channel page — a single idempotent toggle. Signed-out opens the
   existing non-blocking `AuthSheet` (plan 07 D4), never a hard gate. A creator never sees it on their
   own channel (the server refuses self-follow).
2. **Subscriber count** on a channel page and on channel cards (informational, from the server).
3. **"Following" shelf** — the channels this listener follows, newest follow first, mirrored for
   offline browsing like every other channel row.
4. **Owner subscriber list** — a creator (and an operator) can see who follows a channel; a
   non-owner gets a handled notice, and the UI only offers it when `isMine`.

Following is **not** a personal `playlist`, not an online collection, and not a device-owned row. It is a
server-owned relationship the phone mirrors read-only (prompt D1/D2).

---

## 2. What we reuse (do not re-invent)

| Need | Reuse | Why |
|---|---|---|
| Channel mirror + offline browse | the plan-07 Room mirror (`channels`/`channel_playlists`/`channel_audios`) | Followed channels are just channel rows; the shelf is the same read-cache posture (D2). |
| Act transport | `LesanClient.callBody` + `ChannelRemoteDataSource` pattern | Same `{model,act,details}` POST, `{success,body}` envelope, 501 refusal → `LesanException` → non-blocking notice. |
| Signed-out action routing | the plan-07 D4 `AuthSheet` path (create/edit channel) | Follow needs a session; reuse the exact signed-out → `AuthSheet` behavior. |
| Result type | `ChannelRepository.ChannelOp<T>` (Ok / Failed with the server `body.message`) | A refusal (self-follow, non-owner subscriber list) is a notice, not a crash. |
| UI primitives | `BubbleButton`, `GlassChip`, `ListRow`/`ListGroup`, `PaletteTile`, `InlineNotice`, `EmptyState`, `SkeletonRows`, `GlassSheet` | Design-system rule: upgrade shared parts once. |
| Auth identity | `AuthSession`/`AuthRepository.getCachedUser()` | `isMine`/signed-in gating already comes from the cached user. |

---

## 3. Local data model (Room, v4 → v5)

Two additions, both **read-cache** (no `sync_status`; never in `syncLocalData`, prompt D1):

- **`channels.subscriber_count`** (`INTEGER NOT NULL DEFAULT 0`) — mirrors the server's informational
  counter. A `Channel` gains `subscriberCount: Int = 0`.
- **`channel_subscriptions`** — the device's "who do I follow" mirror:
  `channel_server_id TEXT PRIMARY KEY`, `followed_at INTEGER NOT NULL`. This is the **single local
  source of truth** for whether the listener follows a channel and in what order the shelf renders; it
  is reconciled from the server and never derived from the general directory pull (so a directory
  refresh cannot silently un-follow).
  - `ChannelSubscriptionDao`: `upsert`, `deleteByChannelId`, `observeAll`/`getAll` (ordered by
    `followed_at DESC`), `exists(channelServerId)`, `deleteAll`.

Why a join table and not an `is_subscribed` column on `channels`: a general `listChannels` pull would
overwrite a column, but it can never touch the join table; and the shelf needs follow order, which the
channel row does not carry. `subscriber_count` is a plain column because it is a property of the channel,
not of the relationship.

Migration `MIGRATION_4_5`:
- `ALTER TABLE channels ADD COLUMN subscriber_count INTEGER NOT NULL DEFAULT 0`
- `CREATE TABLE channel_subscriptions(channel_server_id TEXT NOT NULL PRIMARY KEY, followed_at INTEGER NOT NULL)`
- Export `5.json`; register the DAO in `PejvakDatabase` + `AppModule`.

Domain (`domain/channel/ChannelModels.kt`), pure:
- `Channel.subscriberCount`.
- `ChannelSubscription(channelServerId, followedAt)` (or the DAO row directly).
- `formatSubscriberCount(count: Int): String?` — `null` at 0, `"1"`… `"999"`, then compact `"1.2k"` /
  `"3.4M"` (pure, unit-tested; never a second source of truth, the raw count stays on `Channel`).

---

## 4. UI surfaces (design-system rules apply to every one)

- **Channel detail** (`ChannelDetailScreen` + `ChannelDetailViewModel`) — a **follow/unfollow**
  action (a `BubbleButton`/`GlassChip` in the identity card or header) shown when the channel is not
  `isMine`; the **subscriber count** in the subtitle/identity; when `isMine`, a **Subscribers** action
  instead (opens the subscriber list). Signed-out tap → `AuthSheet` (D3). Optimistic state from the
  toggle reply, reconciled against the join table.
- **"Following" shelf** — a new `SubscribedChannelsScreen` + `SubscribedChannelsViewModel` (a route
  `subscribed`), reachable from the Channels hub header. Same card/row language as the hub; Room-first
  from the join table, refreshed by `getMySubscribedChannels`; `EmptyState` with a "browse channels"
  action when nothing is followed; `InlineNotice` on a pull failure.
- **Subscriber list** — a `ChannelSubscribersScreen`/sheet (owner/operator only), a paginated list of
  `{username, displayName, avatarUrl}` rows (`ListRow` + `PaletteTile`); a 501 (non-owner) is an
  `InlineNotice`, never a crash. Reachable from the manage screen and/or the detail owner action.
- **Channel cards** (hub/detail/discover) — show the subscriber count via `formatSubscriberCount`, not a
  raw unformatted integer.
- **Routes** — add `subscribed` (and the subscriber list route/sheet) in `PejvakNavHost.kt`, wired from
  the hub header and the owner surfaces.
- Every string in `res/values/strings.xml` (`channel_follow`, `channel_following`,
  `channel_subscribers`, `channels_following_title`, …); every colour from `ui/theme/`; new semantic
  glyphs (`person_add`, `person_remove`, `groups`) behind `Icon`/`ICON_GLYPHS` and pinned in
  `IconCatalogTest`. Light **and** dark from the first commit; motion gated on `useMotionEnabled()`.

---

## 5. Offline / sync posture

- The follow **state** is mirrored (join table) so the detail button and the shelf render offline; the
  follow **action** needs network (it is a direct act call, like creator writes — D1). A failed toggle
  keeps the previous state and surfaces a non-blocking notice.
- `subscriberCount` is a read-cache value; a stale count offline is acceptable (it is informational) and
  refreshes on the next `getChannel`/directory pull.
- **Never** pushed by `syncLocalData`: a follow is server-owned. The listener's **playback** of a channel
  episode still syncs as a normal `PlaybackSession` (unchanged from plan 07).
- The subscriber list is online-only (no cache) — it is an owner tool, not a browse surface.

---

## 6. Feature IDs & phases

### Phase S1 — Data & transport
- [ ] SUB-D01 Room: `channels.subscriber_count`, `channel_subscriptions` table + DAO; `MIGRATION_4_5`;
      schema `5.json`; `AppModule` DAO provider.
- [ ] SUB-D02 Domain: `Channel.subscriberCount`, `ChannelSubscription`, `formatSubscriberCount`; add
      `subscriberCount` to the remote `channelProjection` and parse it; parse computed `isSubscribed` on
      `getChannel`.
- [ ] SUB-D03 `ChannelRemoteDataSource`: `subscribeChannel(token, channelId)`,
      `unsubscribeChannel(token, channelId)` (both return `{subscribed, subscriberCount}`),
      `getMySubscribedChannels(token, page, limit)` (bare array), `listChannelSubscribers(token,
      channelId, page, limit)` (`{rows,total,page,limit}` of identity rows).
- [ ] SUB-D04 `ChannelRepository`: `subscribe`/`unsubscribe` returning `ChannelOp<SubscriptionResult>`
      that reconcile the join table + `subscriber_count`; `refreshSubscribedChannels()` /
      `observeSubscribedChannels()`; `refreshSubscribers(channelId)`; reconcile
      `getChannel.isSubscribed` into the join table in `loadChannel`.

### Phase S2 — Listening surfaces
- [ ] SUB-U01 Follow/unfollow control on channel detail (hidden for `isMine`; signed-out → `AuthSheet`);
      optimistic + reconciled state; non-blocking notice on failure.
- [ ] SUB-U02 Subscriber count on detail identity + channel cards via `formatSubscriberCount`.
- [ ] SUB-U03 "Following" shelf screen + route `subscribed` + hub header entry (Room-first, refresh,
      empty/offline states).
- [ ] SUB-U04 Owner subscriber list screen/sheet + entry from manage/detail; paginated; 501 → notice.

### Phase S3 — Design-system, a11y & tests
- [ ] SUB-X01 new glyphs (`person_add`/`person_remove`/`groups`) behind `ICON_GLYPHS` + `IconCatalogTest`.
- [ ] SUB-X02 all copy in `strings.xml`, colours only from `ui/theme/`, RTL-safe per-text content.
- [ ] SUB-T01 JVM tests: `formatSubscriberCount` boundaries, join-table reconciliation, act parsing
      (`{subscribed,subscriberCount}`, bare array, subscriber envelope) — the `ChannelModelsTest` style.
- [ ] SUB-T02 `./gradlew assembleDebug` → **zero Kotlin warnings**; `testDebugUnitTest` green.
- [ ] SUB-T03 light/dark + reduced-motion verified **by the owner on device** (never claimed here).

---

## 7. Done criteria (per android AGENTS)

Done only when `assembleDebug` passes with **zero Kotlin warnings**, JVM unit tests for the touched pure
logic pass, follow/unfollow is idempotent and offline-safe (mirror renders offline; action needs
network and fails as a notice), the shelf and subscriber list work against the live server, and it has
been looked at in **both themes** — the last of which is **always the owner's on-device check**, never
signed off here.

---

## 8. Progress log

| Task | Done | Note |
|---|---|---|
| Plan authored (design only) | ✅ | Was blocked on the backend subscription change; now unblocked. No Android code yet. |
| Backend landed → Android unblocked | ✅ | `channelSubscription` join model + `subscriberCount` + the four acts + computed `isSubscribed` on `getChannel` are implemented and verified (`back/http/channels.hurl`, subscriptions section green). Wire contracts pinned in the prompt (D9). Android work starts at S1. |
