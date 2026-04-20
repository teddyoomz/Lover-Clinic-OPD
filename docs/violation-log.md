# Violation Log Format

The V-log (V1, V2, V3, ...) is the catalog of every real production bug or
near-miss that shipped. It lives in `.claude/rules/00-session-start.md`
section 2 ("PAST VIOLATIONS").

**Never delete old V-entries.** They're the reason current rules exist.

---

## Entry format

```markdown
### V{N} — YYYY-MM-DD — {One-line title}

- Bug: {what happened — specific, not vague}
- Root cause: {why it happened — the actual mechanism}
- Fix: {commit SHA + what changed}
- Rule added: {which iron-clad rule or audit invariant this motivated}
- Worst part / lesson: {optional — if there's an embarrassing aspect
  worth documenting so future team doesn't repeat}
```

## Examples (generic)

### V1 — 2026-01-15 — Deploy tightened rules without probing

- Bug: commit `abc1234` tightened firestore write rules → webhook
  received 403 in production → chat messages stopped flowing
- Root cause: deploy without probe-before + probe-after ritual. Rule
  changes have zero preview environment — live or dead
- Fix: `git revert abc1234`, then new commit `def5678` restoring
  permissive rules for the specific paths that needed unauth write
- Rule added: Iron-clad B — Probe-Deploy-Probe mandatory on every
  firestore rules deploy. 4 endpoints probed, post-deploy re-probe = revert
  if any 403
- Worst part: took 40 min to diagnose because chat looked superficially
  fine — new messages still appeared from cache. Real-time write was dead

### V2 — 2026-02-08 — Edit tool silent failure

- Bug: commit message claimed "added handler for new case", runtime
  crashed with `handleSyncCoupons is not defined`
- Root cause: Edit tool call had parameter typo (`old_str_DUMMY_NO`
  instead of `old_str`). Tool returned InputValidationError but AI didn't
  surface it — function body never landed in file
- Fix: commit `...` correctly inserted the handler body
- Rule added: Pre-commit checklist step — grep-pair verify every Edit
  to router files. `grep "case '"` count must match `grep "^async function
  handle"` count
- Worst part: AI claimed "committed and pushed" after only reading the
  case-dispatcher diff. The "it worked" response was confidently wrong

### V3 — 2026-03-22 — Shared helper re-invented 3x

- Bug: `parseQty` defined in 3 files (src/utils.js, src/pages/SaleForm.jsx,
  src/lib/stockUtils.js). Each had subtly different whitespace handling.
  Stock deduction used the strictest version; sale form used the loosest;
  bug when stock deducted ≠ sale recorded
- Root cause: Rule of 3 violation — 3+ copies means they'll diverge. New
  feature (sale form) copied from utils.js, then was locally modified
- Fix: extracted canonical `parseQty` in `src/lib/quantityUtils.js`, all
  3 copies replaced with import
- Rule added: Audit invariant AV1 (Rule of 3) — `/audit-rule-of-3` skill
  grep for duplicate function definitions, flag 3+

---

## How to write a good V-entry

**Be specific about the mechanism.** "Bug was confusing" is useless.
"bug: race condition in `updateInventory` when 2 sales hit same second →
both read old stock → both wrote same decremented value → lost 1 unit"
is actionable.

**Include the commit SHAs.** Both the bad commit and the fix. Future
sessions can `git show <sha>` to see exactly what changed.

**Name the rule / skill that resulted.** If no rule resulted, ask why
— was it a one-off with no class? Or did you skip Rule D step 3?

**Don't be defensive about the "worst part" section.** If an AI session
confidently claimed success while crashing production, say so. The
embarrassment is the lesson.

## How V-log interacts with rules

The lifecycle:
1. Bug ships → V-entry created
2. Rule D step 3: update rule file, referencing the V-entry
3. Rule file says "Why: V7 — deploy without probe = silent 403"
4. New AI session reads rule → sees anti-example → understands stakes
5. Audit skill has grep invariant → catches violations at review time
6. V-log never shrinks; rules file grows; audits harden

The interaction is what creates institutional memory. A rule without its
V-entry is paranoid policy; a V-entry without its rule is a story no one
learns from.

## Cleanup (minimal)

Never delete V-entries. If you discover a V-entry is wrong (e.g. root
cause was misdiagnosed), add a correction entry:

```markdown
### V5 — 2026-02-20 — (CORRECTED 2026-05-10)
[original entry]

**Correction (2026-05-10)**: Root cause was X, not Y as originally recorded.
Additional analysis: {...}
```

Don't delete. Don't rewrite history. Just append corrections.

## Visibility

The V-log is team-visible:
- In the repo (checked in)
- Referenced from rule files
- Linked from CLAUDE.md onboarding checklist
- New team members read it as onboarding (lessons paid for in bugs)

## Anti-patterns

### Anti-pattern 1: V-log dormant despite bugs

If you haven't added a V-entry in a month but you've shipped bugs, Rule
D step 3 is being skipped. Ask why at retrospective.

### Anti-pattern 2: Every bug gets a V-entry regardless of severity

If every typo + every formatting issue gets a V-entry, the log becomes
noise. Reserve for things that teach a generalizable lesson or created
real risk.

Rule of thumb: would you want a new team member to read this entry during
onboarding? If yes, it's a V-entry. If it's just a one-off typo, it's a
commit message.

### Anti-pattern 3: V-entries deleted to "clean up"

The cleanup instinct is wrong here. The log GROWING is the point. A
huge V-log is proof the team caught + learned from many issues.

Lose the log = lose the learning.
