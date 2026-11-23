# Prompt 06 — New server, non-blocking auth, home sign-in button

## Owner brief (verbatim intent)

Migrate the project to a new server. It has been running on a test server; the app is not
officially released yet. The owner has personally spent a long time using the app and wants to
**preserve the data already generated on the device** and move it to the new server. There is **no
backup of the previous server**.

On the new server, the system should **check the auth token; if it is invalid, the user is directed
to a modal for registration or login**. Once registered/logged in, the data should **sync with the
server so nothing is lost** — at minimum the data currently stored on the device is preserved. This
must work for **all users, including those who have used the app without registering**: they can sign
up and have their existing local data synced to the server.

The app must **not abruptly interrupt an active user** by demanding registration/login. Instead there
is a **button with an attractive icon on the home screen** for this purpose.

New Lesan address: `http://46.245.98.207:1405/`.

Backend changes must respect `back/AGENTS.md`, the Lesan data models, and relationship definitions.
The React Native `mobile/` app is deprecated — do not touch it; the native `android/` app is the
product.

## Clarified decisions (this round)

1. **Signed-in home button → "Account + sync sheet."** The same header button, once authenticated,
   opens a sheet showing identity, what is still queued, last-synced, *Sync now*, manage-in-Settings,
   and *Sign out*. (Not hidden, not a bare jump to Settings.)
2. **The owner WAS logged in on the old server.** So the device holds rows already marked `synced`
   against the old endpoint. A plain URL swap + login would leave those stranded, because the sync
   engine only pushes `pending`/`failed` rows and there is no stored server identity to notice the
   move. → a **one-time full re-queue on the new endpoint** is required and is the core of "preserve
   my data."

## Constraints honoured

- Offline-first: the app stays usable with or without an account; sync is background and never blocks
  the UI.
- The backend already exposes `register`/`login`/`getMe`/`syncLocalData`/`getMySettings` and is
  idempotent on `clientId` (unique sparse index) — so re-pushing rows to a fresh server inserts them,
  and re-pushing to a server that already has them is a harmless skip. **No backend change is
  needed** for this feature; the move is client-side.
- Reuse the design system: `GlassSheet` is the single modal shell; the home button is a `BubbleButton`
  in the existing `GlassHeader` action slot; the auth form is the existing `AuthViewModel`/`AuthRepository`.
- English LTR strings, all user-facing text in `strings.xml`; no color literals outside `ui/theme/`.
