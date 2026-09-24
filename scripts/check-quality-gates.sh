#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
printf 'chore: verify quality gates\n' | pnpm exec commitlint
if printf 'invalid commit message\n' | pnpm exec commitlint >/dev/null 2>&1; then
  echo 'commitlint accepted an invalid message' >&2
  exit 1
fi
fixture=$(mktemp ./quality-gate-XXXXXX.js)
trap 'rm -f "$fixture"' EXIT
printf 'export const sample = 1;\n' > "$fixture"
pnpm exec biome check "$fixture" >/dev/null
printf 'debugger;\n' > "$fixture"
if pnpm exec biome check "$fixture" >/dev/null 2>&1; then
  echo 'Biome accepted a debugger statement' >&2
  exit 1
fi
echo 'Quality gate rejection checks passed'
