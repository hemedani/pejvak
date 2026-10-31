# 01 — Shared listener state: the `setting` field on `User`

> Task brief for an implementation agent working in
> `/Users/syd/work/Pejvak/back`.
>
> Read `../AGENTS.md` and `AGENTS.md` first. They are authoritative for Lesan
> patterns, act conventions, validation, and idempotency. This document defines
> the product contract for the state that must follow a listener between the
> Android app and the web app.

## Mission

The clients store several kinds of state locally. Some of it belongs to the
listener and must travel to any other device; some of it belongs to one device
and must never leave it. The backend already stores history-shaped state
(tracks, sessions, annotations, playlists, runs, saved online collections) but
has no place for the listener's **preferences** — most importantly the one
language they chose for online resources.

Add that state as a **`setting` object inside the existing `user` document**,
plus the acts to read and update it. Do not create a separate settings model,
collection, or table.

### What this task must not do

- **Do not create `models/userSetting.ts`, a `userSetting` collection, or a
  `userSetting` schema.** The field lives on `User`.
- Do not touch `mobile/` or `front/` in this task. They are separate workspaces;
  this brief defines the contract they will consume.
- Do not add a second HTTP layer. Every endpoint is a Lesan act.
- Do not store media bytes, stream URLs, local file paths, download state, or
  device hardware preferences on the server.
- Do not add RBAC, admin acts, or cross-user reads.
- Do not change session semantics: sessions remain append-only.
- Do not hand-edit `declarations/`. Regenerate it by starting the server.

---

## 1. The shared-state inventory

Keep this audit intact. If a future field does not fit one of these rows, stop
and ask rather than guessing.

| State                                         | Where it lives today               | Share across devices? | Backend storage                             |
| --------------------------------------------- | ---------------------------------- | --------------------- | ------------------------------------------- |
| Account identity (`displayName`, `avatarUrl`) | `User`                             | Yes                   | `User` (already)                            |
| Chosen online language                        | mobile `settings.languageCode`     | **Yes — this task**   | `User.setting.languageCode`                 |
| Default playback speed                        | mobile `settings.defaultSpeed`     | **Yes — this task**   | `User.setting.defaultSpeed`                 |
| History sort                                  | mobile `settings.historySort`      | **Yes — this task**   | `User.setting.historySort`                  |
| Theme                                         | mobile `settings.themePreference`  | No                    | device-local; web owns its theme cookie     |
| Motion preference                             | mobile `settings.motionPreference` | No                    | OS/device capability                        |
| Haptics                                       | mobile `settings.hapticsEnabled`   | No                    | hardware capability                         |
| Track metadata                                | mobile `tracks`                    | Yes                   | `Track` (already)                           |
| Local file URI, folder path, tree grant       | mobile `tracks`, `folders`         | No                    | **never** store                             |
| Download state, download path, file bytes     | mobile `download_*`                | No                    | **never** store                             |
| Playback sessions                             | mobile `sessions`                  | Yes                   | `PlaybackSession` (already)                 |
| Annotations                                   | mobile `annotations`               | Yes                   | `Annotation` (already)                      |
| Playlists                                     | mobile `playlists`                 | Yes                   | `Playlist` (already)                        |
| Collection runs (ended)                       | mobile `context_plays`             | Yes                   | `PlaybackContext` (already)                 |
| Saved / favourited online collections         | mobile `online_collections`        | Yes                   | `OnlineCollection` (already)                |
| Per-track resume position                     | derivable from sessions            | Yes                   | derive from `PlaybackSession`; no new field |
| Open run / live playback position             | mobile `context_plays` (open row)  | Not in this task      | see §7                                      |
| `lastSyncAt`, checkpoints, UI state           | mobile local tables                | No                    | **never** store                             |

Two consequences worth stating explicitly:

1. **The chosen language is not the collection's language.**
   `OnlineCollection.languageCode` records the language a saved course was found
   under. `User.setting.languageCode` records the language the listener chose
   for browsing. They are different facts and must not overwrite each other.
2. **`Track.downloadedAt` already exists on the server and is device-specific.**
   Do not extend it, and do not let the web treat it as "downloaded". Leave it
   alone in this task.

---

## 2. The field: `setting` on `User`

Edit `models/user.ts`. Add one optional embedded object to `user_pure`:

```ts
import {
  defaulted,
  enums,
  nullable,
  number,
  object,
  optional,
  refine,
  size,
  string,
} from "lesan";

export const setting_pure = object({
  /**
   * The one language the listener chose for online resources, or null for none.
   *
   * Deliberately not validated against a server-side catalogue: the catalogues
   * live in the clients and can gain languages without a backend deploy. A code
   * that no longer exists must make the client hide its tab, not make a settings
   * read fail.
   */
  languageCode: defaulted(nullable(string()), null),
  /** Playback speed for a new session. Player range is 0.5–3.0. */
  defaultSpeed: defaulted(
    refine(
      number(),
      "defaultSpeed between 0.5 and 3.0",
      (value) => value >= 0.5 && value <= 3,
    ),
    1,
  ),
  /** "newest" | "oldest" | "longest" — mirrors mobile HISTORY_SORT_OPTIONS. */
  historySort: defaulted(enums(["newest", "oldest", "longest"]), "newest"),
  /**
   * Epoch milliseconds, not a Date: this is the last-write-wins token the
   * clients send and compare, so it stays a number on the wire.
   */
  updatedAt: defaulted(number(), 0),
});

export const user_pure = {
  username: string(),
  email: emailPattern,
  password: string(),
  displayName: optional(string()),
  avatarUrl: optional(string()),
  /**
   * Shared listener preferences. Optional so existing users and the register
   * act stay valid; defaults are applied on read (see §3.1), not written at
   * registration.
   */
  setting: optional(setting_pure),
  ...createUpdateAt,
};
```

### Why this shape

- `User` is already the per-user document, so preferences need no new
  collection, no relation, no unique index, and no race between two first-time
  inserts.
- One document means one read for auth and preferences; the client can get
  `setting` through `getMe` without a second round trip.
- `setting.updatedAt` is its own last-write-wins token. Do **not** reuse the
  user document's top-level `updatedAt`: a profile edit must not make an older
  settings change look newer, and a speed change must not dirty the account row.
- Do not add a reverse relation or an index for this field.

### Registration

No change is required in `register`. `setting` is optional; a new user simply
has no `setting` object until the first write, and reads return defaults. Do not
write defaults during registration.

---

## 3. Acts

Create `src/settings/` with two acts, validator before implementation, and
register the domain in `src/mod.ts` beside the others:

```text
src/settings/
  getMySettings/
    getMySettings.val.ts
    getMySettings.fn.ts
    mod.ts
  updateMySettings/
    updateMySettings.val.ts
    updateMySettings.fn.ts
    mod.ts
  mod.ts
```

Both acts are **on the `user` schema**:

```ts
coreApp.acts.setAct({
  schema: "user",
  fn: getMySettingsFn,
  actName: "getMySettings",
  preAct: [setTokens, setUser],
  validator: getMySettingsValidator(),
});
```

Routes are therefore `POST /user/getMySettings` and
`POST /user/updateMySettings`. Both use `preAct: [setTokens, setUser]` and
filter on the caller's `user._id`. There is no public settings read.

### 3.1 `getMySettings`

- `set: object({})`.
- `get`: a projection over the four setting fields. Do **not** use
  `selectStruct("user", …)` and return the whole user — that would expose
  account fields from a settings act. Define the projection explicitly:

```ts
object({
  languageCode: optional(enums([0, 1])),
  defaultSpeed: optional(enums([0, 1])),
  historySort: optional(enums([0, 1])),
  updatedAt: optional(enums([0, 1])),
});
```

- If the user has no `setting` object, **do not create one**. Return:

```json
{
  "languageCode": null,
  "defaultSpeed": 1,
  "historySort": "newest",
  "updatedAt": 0
}
```

`updatedAt: 0` means "never written"; any client change wins over it. `null`
means "no language chosen", matching the mobile
`settings.languageCode:
string | null` contract.

- If `setting` exists but is missing a field, fill that field from the same
  defaults. Do not mutate the document on read.
- If `get` is empty, return all four fields. If `get` names a subset, return
  only those keys. A tiny `pick` helper is enough; do not build an exclusion
  projection.
- `getMe` already returns the user document. Because `setting` is a normal
  field, a client may also request it through `getMe`; make sure the generated
  `getMe` projection includes `setting` (check the regenerated declarations, and
  update `getMe`'s `selectStruct` depth/validator only if it does not).

### 3.2 `updateMySettings`

`set` is a **patch**:

```ts
object({
  languageCode: optional(nullable(size(string(), 0, 16))),
  defaultSpeed: optional(
    refine(
      number(),
      "defaultSpeed between 0.5 and 3.0",
      (value) => value >= 0.5 && value <= 3,
    ),
  ),
  historySort: optional(enums(["newest", "oldest", "longest"])),
  updatedAt: optional(number()),
});
```

Rules:

- A call with no setting fields is a no-op: return the current canonical
  settings and do **not** bump `updatedAt`. `updatedAt` alone is not a setting
  change.
- `languageCode`: trim and lowercase before storing. `null` or `""` clears the
  choice; store `null`. Reject values longer than 16 characters after trimming.
  Do not reject an unknown code.
- `defaultSpeed`: inclusive `0.5–3.0`. This is the player's full range; the
  mobile settings list is a UI subset and must not become a server restriction.
- `historySort`: one of the three values.
- `updatedAt`: epoch milliseconds. If omitted, use `Date.now()`. Clamp a future
  value down to `Date.now()` so a wrong device clock cannot make the field
  unmovable forever.
- Return the **authoritative canonical settings object**, not the raw input. A
  client that lost LWW can discover the winner without a second call.

### 3.3 The merge must be atomic

Do not implement read-check-write with a gap: two devices can update at once.
Use one conditional `findOneAndUpdate` (or `updateOne` followed by a read) with
a filter that only matches when the incoming timestamp is newer:

```ts
const incoming = Math.min(input.updatedAt ?? Date.now(), Date.now());

const patch = mode === "snapshot"
  ? {
    setting: {
      ...DEFAULT_SETTING,
      ...definedFields(input),
      updatedAt: incoming,
    },
  }
  : Object.fromEntries(
    Object.entries(definedFields(input))
      .map(([key, value]) => [`setting.${key}`, value]),
  );

const applied = await user.findOneAndUpdate({
  filter: {
    _id: userId,
    $or: [
      { setting: { $exists: false } },
      { "setting.updatedAt": { $exists: false } },
      { "setting.updatedAt": { $lt: incoming } },
    ],
  },
  update: { $set: { ...patch, "setting.updatedAt": incoming } },
  projection: { setting: 1 },
});
```

Adapt the exact wrapper call to the Lesan version in this repo, but preserve the
contract:

- `incoming > existing.updatedAt` (or no existing setting) → apply.
- `incoming <= existing.updatedAt` → change nothing; equal timestamps are
  idempotent.
- No row/collection race exists because the target is the user document.
- If the conditional update matches nothing, read and return the current
  canonical settings. Do not return a 500 for a lost LWW write.

Both `updateMySettings` and `syncLocalData` must use **one shared helper** for
this merge. Do not write the LWW logic twice. Put it in `src/settings/` or a
shared `utils/` module that does not create an import cycle. Suggested shape:

```ts
type SettingInput = {
  languageCode?: string | null;
  defaultSpeed?: number;
  historySort?: "newest" | "oldest" | "longest";
  updatedAt?: number;
};

type Setting = {
  languageCode: string | null;
  defaultSpeed: number;
  historySort: "newest" | "oldest" | "longest";
  updatedAt: number;
};

export const DEFAULT_SETTING: Setting = {
  languageCode: null,
  defaultSpeed: 1,
  historySort: "newest",
  updatedAt: 0,
};

export async function mergeSetting(
  userId: ObjectId,
  input: SettingInput,
  mode: "patch" | "snapshot",
): Promise<{ applied: boolean; setting: Setting }> { ... }
```

- `patch`: omitted fields stay as they are (`updateMySettings`).
- `snapshot`: omitted fields mean "use defaults" (`syncLocalData.settings`). The
  client sends every field; the mode keeps the intent explicit.

### 3.4 Wire examples

Read:

```json
{
  "model": "user",
  "act": "getMySettings",
  "details": {
    "set": {},
    "get": {
      "languageCode": 1,
      "defaultSpeed": 1,
      "historySort": 1,
      "updatedAt": 1
    }
  }
}
```

Write:

```json
{
  "model": "user",
  "act": "updateMySettings",
  "details": {
    "set": {
      "languageCode": "fa",
      "updatedAt": 1760000000000
    },
    "get": {
      "languageCode": 1,
      "defaultSpeed": 1,
      "historySort": 1,
      "updatedAt": 1
    }
  }
}
```

Add both acts to the acts table in `back/AGENTS.md`.

---

## 4. Extend `syncLocalData` for the offline path

The mobile app is offline-first. A settings change is written to SQLite first,
and the push must survive being offline. Resending the current settings snapshot
on every sync is safe because the merge is LWW and idempotent.

### Request

Add an optional `settings` object to `set`:

```json
{
  "settings": {
    "languageCode": "fa",
    "defaultSpeed": 1,
    "historySort": "newest",
    "updatedAt": 1760000000000
  }
}
```

Validator rules:

- `languageCode: nullable(size(string(), 0, 16))` (required inside the object;
  send `null` for none).
- `defaultSpeed: refine(number(), …)` (0.5–3.0).
- `historySort: enums(["newest", "oldest", "longest"])`.
- `updatedAt: number()` (required; the device's change time).
- The whole `settings` object is optional, so every existing client keeps
  working unchanged.

### Behavior

- Call `mergeSetting(userId, set.settings, "snapshot")` when present.
- Always return the authoritative settings in the response, even when no
  settings were sent. This makes the sync act a pull for settings as well as a
  push.
- Add `syncedSettings` to the response and to the `get` validator:
  `syncedSettings: optional(enums([0, 1]))`.
  - `1` when the incoming snapshot was applied,
  - `0` when it was absent or lost LWW.
- Also declare an optional `settings` projection object in the `get` validator
  (`languageCode`, `defaultSpeed`, `historySort`, `updatedAt`, each
  `optional(enums([0, 1]))`). The act returns the whole authoritative object
  regardless, but the generated client must be able to name the field.

Response shape addition:

```json
{
  "syncedSessions": 2,
  "syncedSettings": 1,
  "settings": {
    "languageCode": "fa",
    "defaultSpeed": 1,
    "historySort": "newest",
    "updatedAt": 1760000000000
  }
}
```

Do not add settings to the existing `get` id-map fields. They are unrelated.

### Client contract (for the follow-up mobile work, not this repo task)

- `SettingsService` records `settingsUpdatedAt` (epoch ms) whenever any shared
  setting changes.
- `SyncService` sends the full snapshot with `updatedAt = settingsUpdatedAt`.
- After the response, if `settings.updatedAt > local.settingsUpdatedAt`, apply
  the server values locally. Otherwise keep the local values.
- The web app reads `getMySettings` after login and writes with
  `updateMySettings`. It does not need `syncLocalData` for settings.

Add a short version of this contract to `back/AGENTS.md` under the sync section.

---

## 5. What a client must send, and what it must not

### Language

- Store the code the source catalogue uses (`fa`, `en`, `ar`, …), trimmed and
  lowercased.
- `null` or `""` means no choice; store `null`. A code with no sources simply
  renders nothing in the client.
- Clearing the language is a normal update with `languageCode: null`; it is not
  a delete and needs no tombstone.

### Speed

- `defaultSpeed` is the speed a **new** session starts at, not the speed of an
  existing session. Session rows keep their own `playbackSpeed`.
- Accept the player range `0.5–3.0`; do not import the mobile UI option list
  into the backend.

### History sort

- The three values are `newest`, `oldest`, `longest`. They are a display choice
  for the History screen and have no server-side effect.

### Never send

- `themePreference`, `motionPreference`, `hapticsEnabled` — device preferences.
- `file_uri`, `source_uri`, `source_path`, `folder_key`, `tree_uri`,
  `download_path`, `download_state`, file bytes — device state.
- `lastSyncAt`, playback checkpoints — device state.
- The web's theme cookie — web state.

---

## 6. Profile state already exists; do not duplicate it

`User` already stores `displayName` and `avatarUrl`, and `getMe` already returns
them. This task does not add `updateMe`; profile editing is a separate act and
is not required to share the chosen language. Do not put profile fields inside
`setting`.

Likewise, do not move `OnlineCollection.languageCode` or `isFavorite` into
`setting`. The shelf is already synced per collection; the chosen browsing
language is one preference per user.

---

## 7. Resume and "continue" state: derive, do not duplicate

A web "continue listening" card can be built from data that already exists:

- the latest `PlaybackSession` for a track gives the last position;
- a session's `contextPlayId` / `contextType` / `contextKey` place it in a run;
- ended `PlaybackContext` rows give collection-level progress.

Therefore this task must **not** add a mutable "current playback" pointer to
`User` or `setting`. A live pointer would be a second source of truth, and two
devices playing at once would race with no product rule for who wins.

If live handoff across devices becomes a requirement, design a separate
`playbackState` document in a follow-up with its own `updatedAt` and an explicit
"at most one active device" rule. Do not smuggle it into `setting`.

There is one accepted limitation to document: an **open** run is not sent until
it ends (`syncLocalData.contextPlays.endedAt` is required). The latest paused
session still carries the position, so a web continue card can use that; the
run's aggregate figures are only final after it closes.

---

## 8. Tests

Extend `http/e2e.hurl` with steps that prove the contract, not just the happy
path. Use the existing `{{unique}}` variable and the registered user/token.

Required assertions:

1. **Defaults do not create a field.** `getMySettings` before any write returns
   `languageCode == null`, `defaultSpeed == 1`, `historySort == "newest"`, and
   `updatedAt == 0`. (The `setting` object may be absent on the user document;
   the act must still return these values.)
2. **Create.** `updateMySettings` with `languageCode: "fa"` returns `"fa"`.
3. **Persist.** A second `getMySettings` returns `"fa"`.
4. **Stored inside the user.** `getMe` with `get.setting` returns the same
   setting object (or the value is otherwise visible through the user document),
   proving there is no separate collection.
5. **Stale writes lose.** Send an older `updatedAt` with a different language;
   the response and a subsequent read keep the newer language.
6. **Newer writes win.** Send a newer `updatedAt`; the new language is stored.
7. **Equal timestamps are idempotent.** Replaying the same write does not change
   the document and does not duplicate anything.
8. **Clear.** Send `languageCode: null`; the value round-trips as `null`.
9. **Range.** `defaultSpeed: 3` succeeds; `defaultSpeed: 0.1` fails validation.
10. **Sort enum.** An unknown `historySort` fails validation.
11. **Per-user isolation.** A second registered user gets defaults and cannot
    see the first user's language.
12. **Sync push.** `syncLocalData` with `settings` applies it and returns
    `syncedSettings == 1` plus the authoritative object.
13. **Sync pull.** `syncLocalData` without `settings` still returns the current
    settings and `syncedSettings == 0`.
14. **Sync LWW.** A sync snapshot with an older `updatedAt` does not overwrite
    the newer value; the response shows the winner.

Run:

```bash
deno check mod.ts
deno lint
deno fmt --check
deno task test        # requires MongoDB and a running server
```

If the local environment has no MongoDB, still run the first three and report
that `deno task test` was not run. Do not claim the feature is done without the
hurl steps.

---

## 9. Documentation updates

Update `back/AGENTS.md`:

- Add `setting` to the **User** model subsection: the four fields, defaults,
  `null` language sentinel, and the fact that it is embedded in `User` (do not
  add a `models/userSetting.ts` entry to the structure).
- Add `getMySettings` and `updateMySettings` to the acts table with their
  `/user/...` routes.
- Update the `syncLocalData` behavior paragraph with the settings snapshot, LWW
  rule, `syncedSettings`, and the response's `settings` object.
- Add a short "Shared vs device-local" table matching §1 so the next agent does
  not re-add theme or downloads to the sync payload.

Do not edit `front/docs/PLAN.md` or `mobile/AGENTS.md` from this workspace. Note
in the final report that the mobile and web follow-ups need the regenerated
declarations and the new act names.

---

## 10. Declaration regeneration

`declarations/` is generated on server start and is not hand-edited.

1. Start the backend against a live MongoDB, as `back/AGENTS.md` describes.
2. Let `typeGeneration: true` rewrite `declarations/selectInp.ts`.
3. Stop the server.
4. Confirm the new acts, `setting`, and the `settings` payload appear in the
   generated request types.

The mobile app vendors a byte-identical copy at
`mobile/src/lib/generated/selectInp.ts`; the front does the same under
`front/src/types/declarations/selectInp.ts`. Updating those copies is a separate
workspace change. Say so in the final report rather than editing them here.

---

## 11. Definition of done

- [ ] `setting` is an optional embedded object on `user_pure` in
      `models/user.ts`; **no separate model, collection, or index exists**.
- [ ] `getMySettings` returns defaults without writing, and the stored field
      otherwise.
- [ ] `updateMySettings` is a patch with atomic LWW, clamps future timestamps,
      and returns the authoritative object.
- [ ] `syncLocalData` accepts an optional settings snapshot, returns
      `syncedSettings` and the authoritative `settings`, and leaves every
      existing payload working.
- [ ] `languageCode: null` round-trips; unknown codes are accepted; speed is
      bounded to 0.5–3.0; history sort is one of the three values.
- [ ] Cross-user isolation is proven by a hurl step.
- [ ] `deno check mod.ts`, `deno lint`, `deno fmt --check` pass.
- [ ] `deno task test` passes with the new steps.
- [ ] `back/AGENTS.md` is updated.
- [ ] The final report names the mobile/web follow-ups and does not claim they
      are done.
