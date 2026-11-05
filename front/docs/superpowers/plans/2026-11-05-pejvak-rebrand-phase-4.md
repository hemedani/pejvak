# Phase 4 — the admin console

_Audited 2026-11-05 against `docs/DESIGN.md` and the rebrand spec §8. Three
findings survived the proof gate; all three are fixed here._

## Design language

- **Audited surface:** `/admin` — layout, overview, users, plans, analytics,
  transactions, audit, platform. Supporting components in `components/admin/`.
- **Design sources:** `docs/DESIGN.md` (tokens, type, the eight rules, "where to
  change what") and `docs/superpowers/specs/2026-11-04-pejvak-rebrand-design.md`
  §8 ("listener and admin must not fork primitives").
- **Documented decisions:** figures stay sans and tabular; the value a surface
  exists to show owns the loudest tier; token-first; 44 px targets on coarse
  pointers; catalogue/user content is data and sets its own direction.
- **Governing owners:** `components/ui/*` (button, card, badge, fields, states),
  `components/domain/stat-cell.tsx` (the listener stat), `styles/tokens.css`.
- **Explicit exceptions:** admin tables may use a denser spacing mode (spec §8);
  nothing else.

## Findings

| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Admin stat cards fork the listener stat and break the figure rule | `components/admin/stat-card.tsx` rendered `type-title` (display serif) for a number; DESIGN says figures stay sans/tabular, and the spec says the two consoles must not fork primitives; `Overview` imported its own card while the listener shell uses `domain/stat-cell.tsx` | Delete `StatCard`; use `StatCell` for all eight overview figures, mapping `note` to `detail` | Overview | High |
| 2 | Narrow admin controls are 40 px, below the coarse-pointer minimum | `admin-nav.tsx` strip link `h-10`; `admin-pagination.tsx` link `h-10`; DESIGN rule 5 sets 44 px on coarse pointers | Add `coarse:h-[var(--tap-min)]`; keep `h-10` for fine-pointer density | Admin shell | High |
| 3 | Operator- and listener-authored text never sets its own direction | Plan title/description, user username/display name/email, analytics track/author, transaction email/note render without `dir`; DESIGN rule 6 makes authored content data | Add `dir="auto"` on those values (and the shared detail `Fact`) | Plans, users, analytics, transactions | Medium |

## Changes

- `app/(admin)/admin/page.tsx` — `StatCell` for every overview figure; plan
  distribution title `dir="auto"`.
- `components/admin/stat-card.tsx` — deleted; the listener primitive is the one
  owner.
- `components/admin/admin-nav.tsx`, `admin-pagination.tsx` — coarse-pointer
  target.
- `components/admin/plan-editor.tsx`, `app/(admin)/admin/users/page.tsx`,
  `users/[id]/page.tsx`, `analytics/page.tsx`, `transactions/page.tsx` —
  `dir="auto"` on data.
- `components/admin/admin-shell.test.tsx` — guards the target size, the shared
  stat, and the plan direction.

## Done when

- `npm run check` is green; no admin component imports a forked stat; every
  admin control is at least 44 px under `pointer: coarse`; authored values carry
  `dir="auto"`.
