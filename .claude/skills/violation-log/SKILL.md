---
name: violation-log
description: Add a new V-entry to the violation log after a bug or near-miss shipped. Use this skill when the user says "add violation", "log V", "V-entry", or after fixing a bug that taught a generalizable lesson. Enforces the V-entry format (bug / root-cause / fix / rule-added / worst-part) and appends to .claude/rules/00-session-start.md section 2 "PAST VIOLATIONS". Also reminds the user to update the relevant rule file + audit skill per Rule D (Continuous Improvement).
---

# /violation-log

Format-enforced V-entry creator. Prevents the drift where "we'll catalog
that later" becomes "we never cataloged it, now it recurred".

## When to invoke

- After a production bug fix that taught a class-of-bugs lesson
- After a near-miss caught in code review
- When user says "log V", "add violation", "V-entry"
- After Rule D step 3 (rule updated) — the V-entry anchors the rule

## When NOT to invoke

- Trivial typos / formatting issues with no generalizable lesson
- Bugs in abandoned / throwaway code that's about to be deleted
- Style preferences without a failure mode

Rule of thumb: would a new team member reading this V-entry during
onboarding benefit? If yes, log it. If it's just a one-line fix, it's a
commit message, not a V-entry.

## Execution

### Step 1 — Gather facts

Ask user (or infer from conversation):

- **When** — date the bug hit production (not date discovered if different)
- **One-line title** — short verb-phrase summary
- **Bug** — what specifically went wrong, visible symptom
- **Root cause** — the actual mechanism (not "bug in X" — the WHY)
- **Fix** — commit SHA + one-line of what changed
- **Rule added** — which iron-clad rule or audit invariant resulted
- **Worst part / lesson** (optional) — embarrassing aspect worth preserving

If any of these are unclear, ask. Don't invent.

### Step 2 — Find current V-log

Read `.claude/rules/00-session-start.md`. Find section 2 "PAST VIOLATIONS".
Find the highest V-number currently used. New entry = `V{N+1}`.

If section 2 doesn't exist (fresh claude-guardrails install), create it
with the heading from the template.

### Step 3 — Format the entry

Strict format:

```markdown
### V{N+1} — YYYY-MM-DD — {One-line title}

- Bug: {specific, visible symptom}
- Root cause: {actual mechanism — why it happened}
- Fix: commit `{sha}` — {one-line description of change}
- Rule added: {iron-clad letter or audit skill invariant — e.g.
  "Iron-clad B extended (probe list +2 endpoints)" or
  "/audit-anti-vibe-code AV13 added"}
- Worst part / lesson: {optional — embarrassing moment, best quote from
  the debugging session, or unexpected ripple effect}
```

### Step 4 — Append to V-log

Use `Edit` tool to add the new entry at the END of section 2 (preserve
V1..Vn order — newest at bottom for chronological reading).

Do NOT renumber existing entries. Do NOT delete obsolete ones.

### Step 5 — Verify Rule D compliance

After the V-entry lands, remind the user of the Rule D checklist:

- [ ] V-entry in `00-session-start.md` ✅ (just done)
- [ ] Code fix + commit + push (already done if V-entry reflects shipped fix)
- [ ] Adversarial test added (5+ nasty inputs — not just the one that bit)
- [ ] Rule file updated (if no existing rule covered this class)
- [ ] Audit invariant added (greppable pattern in relevant audit skill)

If any of these are missing, point out the gap. The V-entry alone is
documentation; the full Rule D loop is prevention.

### Step 6 — Commit

Ask user: "Shall I commit + push this V-entry alone, or wait until you
also update the rule / audit skill?"

If solo: `git add .claude/rules/00-session-start.md && git commit -m
"docs(rules): log V{N+1} — {title}"`.

If batched: remind user to include all Rule D artifacts in one commit.

## Anti-patterns

- **Invented root cause** — if user says "I'm not sure why", do NOT fill
  in a plausible-sounding reason. Ask them to investigate first. A wrong
  root cause in V-log is worse than no entry.
- **Skipping Step 5** — "I'll add the test later" = it doesn't happen.
  Enforce the checklist.
- **Renumbering** — never. V-numbers are references in rule files and
  commits; reassigning breaks them.
- **Deleting deprecated V-entries** — mark with `(DEPRECATED: reason)` at
  the top but keep the text.
- **Over-formal tone** — V-entries are institutional memory for your team,
  not a legal document. The "worst part / lesson" section is where human
  texture lives ("took 40 min because chat superficially looked fine").

## Example

User: "add V-entry: yesterday deploy broke chat"

You (after asking for details):

```markdown
### V8 — 2026-04-20 — Deploy tightened firestore rules, chat went to 403

- Bug: commit `abc1234` deployed new firestore rules → chat_conversations
  webhook POST returned 403 → no new FB/LINE messages stored → staff
  thought chat was down
- Root cause: Probe-Deploy-Probe list (rule B) only had 2 endpoints. A
  3rd endpoint (chat webhook REST) wasn't probed → rules tightened past
  what that endpoint needed → silent regression
- Fix: commit `def5678` restored permissive rules for
  /chat_conversations/{doc}/events/*. Probe list (rule B) extended to 3
  endpoints.
- Rule added: Iron-clad B — probe list updated to 3 endpoints. Also
  "/audit-firestore-rules" skill AV14 invariant: grep for every
  unauthenticated write path in api/ and require corresponding rule + probe.
- Worst part: took 40 min to diagnose because chat superficially looked
  fine — old messages still displayed from Firestore cache. Real-time
  write was dead.
```

## Success criteria

A well-logged V-entry, read by a future team member or Claude session,
conveys:

- Specifically what happened (not vague)
- Why it happened (mechanism, not symptom)
- What changed to fix it (commit reference)
- What rule prevents recurrence (specific invariant)
- (Optionally) human context that makes the lesson memorable

If any of these are missing from your entry, circle back and fill them in
before committing.
