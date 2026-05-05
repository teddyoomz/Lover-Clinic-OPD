#!/usr/bin/env bash
# .agents/scripts/session-brief.sh
#
# Pre-compute everything /session-end needs in ONE call. Emits structured
# state so the LLM doesn't have to read SESSION_HANDOFF.md (huge) or
# re-grep wiki/index.md just to find insertion points.
#
# Output sections (greppable):
#   ===BASE===        commit SHA of last `docs(agents): EOD ...` (or repo root)
#   ===HEAD===        current HEAD SHA
#   ===PROD===        last production SHA from .agents/active.md frontmatter
#   ===TESTS===       vitest tail (PASS/FAIL counts)
#   ===COMMITS===     git log --oneline base..HEAD
#   ===FILES===       git diff --name-only base..HEAD
#   ===SHORTSTAT===   git diff --shortstat base..HEAD
#   ===SUBJECTS===    one subject per line (for skip-detection: are all "docs(...)"?)
#   ===WIKI===        whether wiki/index.md exists (auto-update gate)
#   ===NEW_LIB===     newly added files in src/lib/ or scripts/ (entity-page candidates)
#   ===NEW_RULES===   diff of .claude/rules/01-iron-clad.md (concept-page candidates)
#   ===NEXT_TODO===   tail of .agents/active.md "Outstanding user-triggered actions" block
#
# Usage: bash .agents/scripts/session-brief.sh

set -euo pipefail

# ─── Find base ─────────────────────────────────────────────────────────────
# Prefer the most recent `docs(agents): EOD` commit (canonical session boundary).
# Fall back to the most recent .agents/sessions/*.md file's first-add commit.
# Final fallback: 7 days ago.
BASE=$(git log --grep='^docs(agents): EOD' --format='%H' -n 1 2>/dev/null || true)
if [ -z "$BASE" ]; then
  LAST_SESSION_FILE=$(ls -t .agents/sessions/*.md 2>/dev/null | head -1 || true)
  if [ -n "$LAST_SESSION_FILE" ]; then
    BASE=$(git log --diff-filter=A --format='%H' -n 1 -- "$LAST_SESSION_FILE" 2>/dev/null || true)
  fi
fi
if [ -z "$BASE" ]; then
  BASE=$(git rev-list --max-count=1 --before='7 days ago' HEAD 2>/dev/null || git rev-list --max-parents=0 HEAD | head -1)
fi

HEAD_SHA=$(git rev-parse --short=7 HEAD)
BASE_SHA=$(git rev-parse --short=7 "$BASE" 2>/dev/null || echo "(none)")

# ─── Prod SHA from active.md frontmatter ───────────────────────────────────
PROD=$(grep -E '^production_commit:' .agents/active.md 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)".*/\1/' || echo "(unknown)")

# ─── Emit ──────────────────────────────────────────────────────────────────
echo "===BASE==="
echo "$BASE_SHA"
echo "===HEAD==="
echo "$HEAD_SHA"
echo "===PROD==="
echo "$PROD"

echo "===TESTS==="
# vitest output format varies by version; take last 5 lines of stderr+stdout
# (typically includes "Test Files N passed", "Tests N passed", "Duration").
npx vitest run 2>&1 | tail -5 | sed 's/\x1b\[[0-9;]*m//g' || echo "(vitest unavailable)"

echo "===COMMITS==="
if [ "$BASE_SHA" != "(none)" ]; then
  git log --oneline "$BASE..HEAD"
fi

echo "===FILES==="
if [ "$BASE_SHA" != "(none)" ]; then
  git diff --name-only "$BASE..HEAD"
fi

echo "===SHORTSTAT==="
if [ "$BASE_SHA" != "(none)" ]; then
  git diff --shortstat "$BASE..HEAD"
fi

echo "===SUBJECTS==="
if [ "$BASE_SHA" != "(none)" ]; then
  git log --format='%s' "$BASE..HEAD"
fi

echo "===WIKI==="
if [ -f wiki/index.md ]; then
  echo "exists"
  echo "log_entries: $(grep -c '^## \[' wiki/log.md 2>/dev/null || echo 0)"
else
  echo "absent"
fi

echo "===NEW_LIB==="
if [ "$BASE_SHA" != "(none)" ]; then
  git diff --name-only --diff-filter=A "$BASE..HEAD" | grep -E '^(src/lib/|scripts/)' || true
fi

echo "===NEW_RULES==="
if [ "$BASE_SHA" != "(none)" ]; then
  git diff --shortstat "$BASE..HEAD" -- .claude/rules/ || true
fi

echo "===NEXT_TODO==="
awk '/^## Outstanding/{flag=1; next} /^##/{flag=0} flag{print}' .agents/active.md 2>/dev/null | head -10 || true

echo "===MODE==="
# Heuristic for skill: skip if 0 commits; minimal if all commits docs(); full otherwise.
TOTAL=$(git log --oneline "$BASE..HEAD" 2>/dev/null | wc -l | tr -d ' ')
SOURCE=$(git log --format='%s' "$BASE..HEAD" 2>/dev/null | grep -cv -E '^(docs|chore|ci)\(' || echo 0)
if [ "$TOTAL" = "0" ]; then
  echo "skip"
elif [ "$SOURCE" = "0" ]; then
  echo "minimal"
else
  echo "full"
fi

echo "===SLUG_SUGGESTION==="
# Derive a slug from the most recent feat()/fix() subject; fall back to "session".
git log --format='%s' "$BASE..HEAD" 2>/dev/null \
  | grep -E '^(feat|fix)\(' \
  | head -1 \
  | sed -E 's/^(feat|fix)\(([^)]+)\):.*/\2/' \
  | sed -E 's#/#-#g' \
  || echo "session"

echo "===END==="
