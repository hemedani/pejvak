# Pejvak Web Rebrand — Phase 2

Written against: `42682f5`

Phase 2 covers playlists, settings, browse, auth, and the root loading/error/not-found
surfaces (see the Phase 1 plan's follow-on list). The audit used `DESIGN.md`, the
Phase 1 spec, and the rendered component path; accessibility and behaviour-only
candidates were excluded by the `improve-ui` proof gate.

## Audit

### Design language

- Audited surface: `/playlists`, `/playlists/[id]`, `/settings`, `/browse`,
  `/login`, `/`, root `loading.tsx`, `not-found.tsx`, `error.tsx`.
- Design sources: `docs/DESIGN.md`, `docs/superpowers/specs/2026-11-04-pejvak-rebrand-design.md`,
  `docs/UI-REVIEW.md`, `src/styles/tokens.css`, `src/app/globals.css`.
- Governing owners: `PageHeader`, `Card`, `TextField`, `Skeleton`, `state.tsx`,
  `playlist-card.tsx`, `playlist-editor.tsx`, layout `loading.tsx`.
- Explicit exceptions: none documented.

### Findings

| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
| 1 | The root `loading.tsx` draws the dashboard's four stat cells and chart for **every** route that lacks its own loading boundary, including Settings, Playlists and Browse. | `src/app/loading.tsx` is the only `loading.tsx` in `src/app`; DESIGN rule "four states" and the file's own comment say the skeleton must match the surface it precedes. | Move the dashboard shape to a home-only `(shell)/(home)/loading.tsx`; make the root fallback a neutral page skeleton. | Root + home route group | High |
| 2 | Playlist titles and descriptions are listener-authored text and are the only such strings without `dir="auto"`; track titles, history rows and annotations all carry it. | `src/components/domain/playlist-card.tsx:53,57`, `src/components/domain/playlist-editor.tsx:385,484`; exemplars `track-table.tsx`, `history-row.tsx`, `annotation-list.tsx`; DESIGN rule 6. | Add `dir="auto"` to the card title/description, editor heading, delete confirmation and rename field. | Playlists | High |
| 3 | The playlist card's metadata sentence ("3 tracks · Updated 2 days ago") uses `type-numeric`, the figure step, for prose. | `src/components/domain/playlist-card.tsx:60`; the type table reserves `type-numeric` for figures, and `history-row.tsx` applies it only to the numbers inside a caption. | Use `type-caption` for the sentence. | Playlist card | Medium |

Everything else in `UI-REVIEW.md` §3 that falls inside these routes either landed in
Phase 1 or is a Phase 3/5 concern (player density, timeline segments, print/forced colours).

## Tasks

### Task 1 — A loading skeleton that matches the route

- `git mv src/app/(shell)/page.tsx src/app/(shell)/(home)/page.tsx`.
- Add `src/app/(shell)/(home)/loading.tsx` with the current dashboard shape.
- Rewrite `src/app/loading.tsx` as a neutral header + content block.
- Contract test: the home loading has four stat placeholders; the root loading does not.

### Task 2 — Playlist text direction

- `playlist-card.tsx`: `dir="auto"` on the title and description.
- `playlist-editor.tsx`: `dir="auto"` on the `h1`, the delete confirmation, and the
  rename `TextField` (which spreads props to the input).
- Render test with a Persian title plus a source assertion for the editor.

### Task 3 — Playlist meta typography

- Replace `type-caption type-numeric` with `type-caption` on the card meta.
- Assert the class in the same render test.

## Done when

`npm run check` is green and a Persian playlist title renders with its own direction.
