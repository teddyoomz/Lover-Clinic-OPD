#!/usr/bin/env bash
# verify-skill-customizations.sh
#
# Audits the 4 user-customized Superpowers skill files at ~/.claude/skills
# to ensure the 2026-05-19/20 customization rules are still present
# AFTER any upstream skills-repo update.
#
# Customizations under audit:
#   1. brainstorming                  — Visual Companion AUTO-USE from question stage
#   2. writing-plans                  — Plans in .html with <h2>Mockup Design</h2> + <h2>Flow</h2>
#   3. executing-plans                — Read .html plans + review Mockup+Flow first
#   4. subagent-driven-development    — Spec/plan in HTML + Mockup+Flow target
#
# Layer relationship:
#   L1 (this audit) = the SKILL.md files themselves
#   L2 (always-wins) = ~/.claude/CLAUDE.md "PLANS + SPECS = HTML" section +
#                      LoverClinic-app/CLAUDE.md mirror section
#   Per `using-superpowers` Instruction Priority, L2 overrides L1 when conflict.
#   Even if L1 is reverted by an upstream update, behavior survives via L2.
#   This audit alerts so L1 can be re-aligned with L2 for clarity.
#
# Run:
#   bash scripts/verify-skill-customizations.sh
#   SKILLS_DIR=/custom/path bash scripts/verify-skill-customizations.sh
#
# Exit 0 = all green. Exit 1 = at least one marker missing.

set -u

SKILLS_DIR="${SKILLS_DIR:-$HOME/.claude/skills}"
FAIL=0
PASS=0

# check_F  = grep -F (literal substring)
# check_E  = grep -E (extended regex)
check_F() {
  local id="$1" file="$2" pattern="$3" desc="$4"
  if grep -qF -- "$pattern" "$file" 2>/dev/null; then
    echo "  [PASS] $id :: $desc"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $id :: $desc"
    echo "         file:    $file"
    echo "         pattern: $pattern"
    FAIL=$((FAIL+1))
  fi
}

check_E() {
  local id="$1" file="$2" pattern="$3" desc="$4"
  if grep -qE -- "$pattern" "$file" 2>/dev/null; then
    echo "  [PASS] $id :: $desc"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $id :: $desc"
    echo "         file:    $file"
    echo "         pattern: $pattern"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Skill Customization Audit ($(date +%Y-%m-%d)) ==="
echo "Skills dir: $SKILLS_DIR"
if [ ! -d "$SKILLS_DIR" ]; then
  echo "  [FATAL] Skills directory not found."
  exit 2
fi
echo

# ---------------------------------------------------------------------------
echo "[1/4] brainstorming -- Visual Companion auto-trigger from question stage"
F="$SKILLS_DIR/brainstorming/SKILL.md"
check_E "B1" "$F" "Visual Companion.*AUTO-USE.*question stage"  "Visual Companion auto-trigger declaration"
check_F "B2" "$F" "AUTO-USE FROM THE QUESTION STAGE"            "Mandatory-from-asking marker (no consent message)"
check_F "B3" "$F" "ตั้งแต่ตอนถามเสมอ"                          "User directive verbatim (Thai, 2026-05-20)"
echo

# ---------------------------------------------------------------------------
echo "[2/4] writing-plans -- HTML plans + Mockup+Flow mandatory"
F="$SKILLS_DIR/writing-plans/SKILL.md"
check_F "WP1" "$F" "HTML FORMAT IS MANDATORY"                   "HTML mandate header (2026-05-19 directive)"
check_F "WP2" "$F" "<h2>Mockup Design</h2>"                     "Mockup Design section template tag"
check_F "WP3" "$F" "<h2>Flow</h2>"                              "Flow section template tag"
check_E "WP4" "$F" "Mockup Design \+ Flow.*BOTH mandatory.*ALWAYS"  "Both-mandatory-always rule heading"
echo

# ---------------------------------------------------------------------------
echo "[3/4] executing-plans -- Read .html plans + review Mockup+Flow first"
F="$SKILLS_DIR/executing-plans/SKILL.md"
check_F "EP1" "$F" "Plans are HTML by convention"                       "HTML plan reading convention"
check_F "EP2" "$F" "Review the Mockup Design AND Flow sections first"   "Review-first directive at step 2"
echo

# ---------------------------------------------------------------------------
echo "[4/4] subagent-driven-development -- HTML spec/plan + Mockup+Flow target"
F="$SKILLS_DIR/subagent-driven-development/SKILL.md"
check_E "SD1" "$F" "Plans are HTML.*\.html.*by user directive 2026-05-19"    "HTML plan directive in handoff context"
check_F "SD2" "$F" "<h2>Mockup Design</h2> AND <h2>Flow</h2>"                "Both targets explicit for reviewers"
echo

# ---------------------------------------------------------------------------
echo "=== Summary ==="
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo

if [ "$FAIL" -gt 0 ]; then
  cat <<EOF
[FAIL] Audit failed -- $FAIL customization marker(s) missing.

Recovery options:
  (a) Restore from git baseline at ~/.claude/skills (if customizations were
      committed to the local skills git repo):
        cd ~/.claude/skills
        git status
        git diff HEAD -- <skill>/SKILL.md
        git checkout HEAD -- <skill>/SKILL.md   # restore one file
        # or:
        git restore <skill>/SKILL.md            # equivalent

  (b) If an upstream update was intentional and the customizations should
      be re-applied, see the canonical rule text in:
        ~/.claude/CLAUDE.md  -- section "PLANS + SPECS = HTML WITH MOCKUP + FLOW"
        F:/LoverClinic-app/CLAUDE.md  -- same section (project mirror)
        ~/.claude/projects/F--LoverClinic-app/memory/feedback_plans_html_with_mockup.md
        ~/.claude/projects/F--LoverClinic-app/memory/feedback_visual_companion_always_allowed.md

  (c) Per `using-superpowers` Instruction Priority, behaviour is preserved
      by CLAUDE.md (L2) even when SKILL.md (L1) is reverted -- but L1 should
      be re-aligned for clarity + drift avoidance.
EOF
  exit 1
fi

echo "[PASS] All $PASS customization markers intact across 4 skills."
echo "       Baseline: cd ~/.claude/skills && git log --oneline -1"
exit 0
