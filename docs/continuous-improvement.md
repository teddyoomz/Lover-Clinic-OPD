# Continuous Improvement (Rule D)

**The engine of memory growth.**

Every bug, every near-miss, every "oh no that could have been bad" moment
triggers a 4-step response. Not a 1-step just-fix. The 4-step sequence is
what makes the team smarter over time.

---

## The 4 steps

### Step 1: Fix the code

Make the failing test pass. This is the part everyone does.

### Step 2: Add adversarial test

Write 5+ nasty input tests for this class of bug, not just the one input
that bit you. Examples:
- Boundary values (0, -1, max+1, empty string, huge string)
- Wrong type (number instead of string, null, undefined, array)
- Race condition (two requests same second, two parallel updates)
- Concurrent delete (delete while read is in flight)
- Malformed input (missing required field, extra unexpected field)

Why 5+: AI generates convincing code for happy paths. Adversarial tests
are where drift is caught.

### Step 3: Update rule file

If an existing rule covered this class, great — the rule is validated.

If no rule covered it, **write a new rule**. Format:

```markdown
### {Next letter or next number}. {Rule name}

{One paragraph on what the rule requires.}

**Why**: {1-2 sentences — link to V-entry for the real bug.}

**Anti-example** (V{N} YYYY-MM-DD):
- {Short title}
- Bug: {what went wrong}
- Fix: {commit SHA + what changed}
```

Add to `.claude/rules/01-iron-clad.md` or create `05-{topic}.md` if it's
a new area.

### Step 4: Add audit invariant

Add a numbered grep pattern to the relevant audit skill. Example:

```markdown
## AV13 — Silent catch in async handlers

Silent `catch (_) {}` in async error paths hides bugs. Check:

grep -rnE "catch\s*\(\s*_\s*\)\s*\{\s*\}" src/

Fix: log the error or rethrow. Add explanatory comment if ignore is safe.
```

If no skill covers this area yet, create `audit-{topic}/SKILL.md` using
the `_template/` pattern.

Register the new skill in `/audit-all` at the appropriate tier.

---

## Why not just fix it?

Because the same class of bug recurs. Humans have memory; AI sessions
don't. Without rules + tests + audits, the next AI-driven commit will
re-introduce the same class.

Example actual progression:

**V1 (week 1)**: "Math.random for invite link tokens" → fixed by switching
to `crypto.getRandomValues`.

Without Rule D:
- Week 3: new feature uses `Math.random` for password-reset tokens
- Week 5: new feature uses `Math.random` for magic-link tokens
- Each "fix" is independent; no system protection

With Rule D:
- Week 1: fix + add test + add Rule C2 + add audit invariant AV2
- Week 3: audit skill catches `Math.random` before review merges PR
- Week 5: same — skill runs, catches, fix at PR time, not prod

Step 4 is the multiplier. Without it, you're Sisyphus.

---

## When to skip (rare)

You can skip the full sequence only when ALL of these are true:
- The bug was in a non-shipping area (experiment branch, throwaway prototype)
- There's no shared pattern that other features use
- The code is literally about to be deleted

Even then, consider: future-you might write the same prototype again.
A 2-minute rule-write is worth it.

## When the sequence is too heavy

If writing a new rule + audit skill feels like too much for a small bug:

- **The bug was actually not small.** Step back and think about the class.
- **Your rule file is too disorganized.** Split into smaller files or
  reorganize. The rule-write should be 5-10 lines, not a page.
- **You're writing the same rule twice.** Check if an existing rule
  covers it (D1 — deduplication applies to rules too).

## Measuring Rule D adoption

Signals the team is actually doing this:

- V-log grows every month
- Audit skills gain new invariants every month
- Test count grows with each bug fix (not just with new features)
- Old bugs don't recur (check: grep git log for similar commit messages
  over 6 months — should trend down)

Signals the team is skipping it:

- V-log dormant despite bugs shipping
- Audit skills static
- Same type of bug fixed 3+ times over 3 months
- Test suite doesn't grow with bug-fix commits

---

## Rule D on itself

The meta-principle: this document should grow too. If you discover a new
anti-pattern in how teams skip Rule D, add it here.

If you find the 4-step sequence isn't working for a class of issue,
document WHY and propose a revision. The methodology is shaped by the
teams who use it, not prescribed from above.
