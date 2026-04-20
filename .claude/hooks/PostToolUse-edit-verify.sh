#!/usr/bin/env bash
# PostToolUse hook — verify Edit/Write operations didn't silently fail.
#
# Why: The Edit tool can return "succeeded" even if a parameter typo caused
# the underlying operation to error. Busy conversations often skip the
# grep-pair verification step. This hook reminds + optionally enforces.
#
# Install: add to your .claude/settings.json:
#   {
#     "hooks": {
#       "PostToolUse": [
#         { "matcher": "Edit|Write", "command": "./.claude/hooks/PostToolUse-edit-verify.sh" }
#       ]
#     }
#   }
#
# Runtime: this is just a reminder emitted after every Edit/Write. For
# enforcement (hard-fail on missed grep-pair), wire to PreCommit or CI.

INPUT=$(cat)

# Extract the file path that was just edited (tool_input.file_path)
FILE=$(echo "$INPUT" | grep -oE '"file_path":\s*"[^"]+"' | sed 's/"file_path":\s*"//; s/"$//')

if [ -z "$FILE" ]; then
  # No file extracted — nothing to verify
  exit 0
fi

# Check if edit landed in an API router file (has "case '...':" dispatcher pattern)
if grep -q "case ['\"].*['\"]:" "$FILE" 2>/dev/null; then
  CASES=$(grep -c "case ['\"].*['\"]:" "$FILE")
  HANDLERS=$(grep -cE "^(async )?function handle[A-Z]" "$FILE")
  if [ "$CASES" -ne "$HANDLERS" ]; then
    echo "⚠️  GREP-PAIR MISMATCH in $FILE"
    echo "   case count: $CASES"
    echo "   handler defs: $HANDLERS"
    echo "   Run: grep 'case ' $FILE && grep '^async function handle' $FILE"
    echo "   to verify every case has a matching handler."
  fi
fi

# Check if edit was to a .rules file — remind about probe-deploy-probe
if echo "$FILE" | grep -qE "\.rules$|firestore\.rules|storage\.rules"; then
  echo "ℹ️  You edited a rules file. Before deploying, run Probe-Deploy-Probe (rule B):"
  echo "   1. Curl-probe every unauth write path → 200"
  echo "   2. firebase deploy --only firestore:rules"
  echo "   3. Re-probe → any 403 = revert"
  echo "   4. Clean up probe docs"
fi

exit 0
