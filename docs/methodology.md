# Methodology — How to Write Rules That Don't Drift

This is the core document. Every other file in claude-guardrails is an
instance of one of these patterns.

---

## The 5 principles

### 1. Rules as code, not guidance

Bad: `CLAUDE.md` says "be careful with secrets".

Good: `.claude/rules/01-iron-clad.md` section C2:
> No `Math.random()` for tokens → use `crypto.getRandomValues(new Uint8Array(16))`
> No secrets in `src/` or `api/` → env vars only
> No user IDs in world-readable docs

Why: the good version is **greppable**. Claude reads it verbatim. An audit
skill greps `Math\.random.*toString\(36\)` to catch violations. CI fails.

**Rules should be numbered, specific, and have a grep target.**

### 2. Every rule has an anti-example

A rule without a story of pain is a rule that'll be broken.

Bad: "Always test before deploying."

Good:
> **B. Probe-Deploy-Probe for rules changes.**
> V1 (2026-04-19) commit `8fc2ed9` tightened firestore rules → webhook
> + calendar dropped to 403 in production. Fix: `git revert`. Rule: every
> `firebase deploy --only firestore:rules` = curl-probe endpoints 1-4
> before + after. If any 403 post-deploy → revert immediately.

Why: the anti-example explains WHY the rule exists. New team members +
new AI sessions understand the cost of violating it. Without the story,
the rule looks like paranoid policy.

### 3. Violations grow the rule set, never shrink it

Every production bug = new V-entry + new rule / audit invariant.

- V1, V2, V3, ... accumulate over years
- Never delete old entries — even obsolete ones are documentation
- If a rule becomes obsolete, mark DEPRECATED but keep the number

Why: the V-log is institutional memory. Rule drift happens when the
"why" gets forgotten. The V-log is the "why" preserved forever.

### 4. No AI summarization of rules

Other tools (claude-mem, GenericAgent, evolver) summarize project memory
with AI. This breaks grep-auditability.

Rule: **a rule file is only edited by humans** (optionally with AI drafting
the edit). Auto-compress tools are banned on `.claude/rules/*`.

Why: summarization is lossy. "No Math.random for tokens" becomes "use
good randomness" which becomes "handle tokens carefully" which becomes
nothing. Humans preserve literal text; AI erodes it.

### 5. Continuous Improvement (Rule D)

Every bug triggers a 4-step response:

1. **Fix the code** — make the failing test pass
2. **Add adversarial test** — 5+ nasty inputs, not just the one that bit
3. **Update rule file** — if the bug class wasn't already covered
4. **Add audit invariant** — numbered grep pattern in the relevant skill

The 4th step is what makes the team smarter over time. Without it,
you fix the same class of bug 10x.

---

## How to write a new rule

Template:

```markdown
### {Letter}. {Rule name in imperative}

{One-paragraph description of what the rule requires.}

**Why**: {1-2 sentences of motivation. Reference V-entry if from real bug.}

**How to follow**: {Specific action — "grep for X before writing Y", "run
tool Z before deploying", etc.}

**Enforcement**: {Which audit skill catches violations. If none yet,
write the audit skill at the same time as the rule.}

**Anti-example** (if from real incident):
- **V{N} YYYY-MM-DD**: {short title}
- Bug: {what went wrong}
- Root cause: {why it happened}
- Fix: {commit SHA + what changed}
```

## How to write a new audit skill

Template at `.claude/skills/_template/SKILL.md`.

Key points:
- Skill name in frontmatter triggers discovery
- Each invariant has: number, name, grep pattern, fix suggestion
- Grep patterns should have < 10% false-positive rate
- Skills are "report-only" — humans decide on fixes, don't auto-modify

## How to handle cross-session drift

The risk: Claude session 1 follows the rules. Session 2 (new chat) starts
cold. Without strict mechanism, session 2 might:
- Skip reading rule files
- Summarize them into its own understanding (drift)
- Violate a rule because it doesn't know V3 existed

Mitigation:
1. **`CLAUDE.md`** lists the mandatory read-first files with explicit
   "blocks any tool calls until read" language
2. **`.agents/AGENTS.md`** defines trust priority — rules win on conflict
3. **`SESSION_HANDOFF.md`** includes a paste-ready Resume Prompt
4. **Session checkpoint** files accumulate context the new session can load

See `docs/cross-session.md` for the full protocol.

---

## Anti-patterns (how rules DON'T work)

### Anti-pattern 1: "Best practices" list

A document listing 30 "best practices" without numbers, grep targets,
or anti-examples is decoration. AI reads it, nods, ignores it when
instructions conflict.

Symptom: rule file grows but bugs still ship.

Fix: every line must be either a numbered invariant with a grep target,
or anti-example story. Delete decorative text.

### Anti-pattern 2: Rules that only exist in one person's head

If the senior dev enforces "no Math.random for tokens" in code review but
it's not written anywhere, AI doesn't know, and the rule dies when the
senior dev is on vacation.

Fix: every spoken rule gets written into `.claude/rules/*`.

### Anti-pattern 3: Rules that conflict without resolution

Rule X says "optimize for speed", Rule Y says "optimize for readability".
When both apply, AI picks whichever fits its current instruction.

Fix: when rules conflict, add a priority section. Example:
> **When X conflicts with Y**: Y wins if the code is user-facing, X wins
> if internal. Document which case applied in the commit message.

### Anti-pattern 4: Summarized rules

"Rules updated to simplified version" = rules erased.

Symptom: V5 in LoverClinic — consolidated 8 rule files → 4, lost context,
next session violated removed rule.

Fix: never summarize. Split / expand / reorganize, but keep every rule's
text intact. Deprecation is the only way to remove text — and even
deprecated rules stay in file as historical reference.

### Anti-pattern 5: Auto-compressed memory

Using vector DB / AI summary to store project context = drift built-in.

Symptom: after 10 sessions, the "compressed insights" contradict each
other because no single human reviewed the compression pass.

Fix: plain files, human-curated. If you need search, use grep.

---

## How to grow this methodology

This file itself should grow. When you discover a new anti-pattern or a
new rule-writing technique, add it here with an example.

The methodology is **not** a finished product. It's a living document
shaped by the bugs your team ships and the rules you write to prevent
them recurring.
