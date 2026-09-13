#!/usr/bin/env bash
# Static checks for the whole monorepo: backend (Deno) then mobile (Expo/tsc).
# Usage: ./check.sh
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"

echo "== backend: deno check / lint / fmt =="
(cd "$root/back" && deno check mod.ts && deno lint && deno fmt --check)

echo "== mobile: expo lint / tsc =="
(cd "$root/mobile" && npm run lint && npm run typecheck)

echo "All checks passed."
