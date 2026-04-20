# Cross-Session Continuity Protocol

The single most common failure mode of AI-assisted development is:
**rules from session 1 don't make it into session 2.**

This document is the protocol that prevents drift across sessions, new
chats, context resets, and team member handoffs.

---

## The problem

Symptoms of cross-session drift:
- "We discussed this yesterday" — AI doesn't remember
- A rule that was followed in morning session is violated in afternoon session
- Senior dev's feedback from 2 weeks ago gets reinvented as a new mistake
- New team member runs Claude without loading context, breaks established pattern

Root cause: Claude has no persistent memory of your project. Each session
is stateless. Every session must re-load context from files.

If those files are:
- Missing → Claude invents context
- Incomplete → Claude fills gaps with plausible guesses
- Summarized → Claude has a low-fidelity version of your rules

→ drift.

## The protocol (strict mode)

Four layers of defense, each reinforcing the others.

### Layer 1: Mandatory read-first files

At the start of every session, before ANY tool call except reading, the AI
must read these files in order:

1. **`CLAUDE.md`** — stack, env, rule index
2. **`SESSION_HANDOFF.md`** — cross-session state of truth
3. **`.agents/active.md`** — hot state
4. **`.claude/rules/00-session-start.md`** — iron-clad summary

These files are checked into the repo. Every Claude session in every team
member's machine reads the same content. No drift possible across users.

### Layer 2: Resume prompt

At the end of every session, the AI generates a **Resume Prompt** in
`SESSION_HANDOFF.md` and/or `.agents/sessions/YYYY-MM-DD-<slug>.md`.

The Resume Prompt is paste-ready. Format:

```
Resume {project-name} — continue from commit {SHA}.

Read in order:
1. CLAUDE.md
2. SESSION_HANDOFF.md
3. .agents/active.md
4. .claude/rules/00-session-start.md
5. .agents/sessions/YYYY-MM-DD-{slug}.md (last checkpoint)

Status: {branch} = {sha}, {N tests passing}, {deploy state}.

Next: {concrete next action}.

Outstanding user actions (NOT auto-run):
- {list}

No deploy this turn unless user explicitly says "deploy".
```

The user copies this block into a new Claude chat. New session reads the
same files. Context resumes deterministically.

### Layer 3: Trust priority on conflict

When user's THIS-TURN instruction conflicts with an iron-clad rule, the
rule wins. This is the single hardest discipline to maintain.

Example conflict:
- User says "just use Math.random, we don't have crypto here"
- Iron-clad rule C2 says "never use Math.random for tokens"

Wrong response: "OK, using Math.random".
Right response: "Rule C2 forbids Math.random for tokens. crypto.getRandomValues
is available in all runtimes (Node 15+, all browsers, Bun, Deno). If you
need an exception, let's add it to the rule with a documented reason."

This discipline is encoded in `.agents/AGENTS.md` trust priority list.
New AI sessions read it; team members see it; reviewers can cite it.

### Layer 4: Violation log + audit skills

If drift DOES happen (some rule gets violated), don't just fix the bug.
Log the violation:

1. Add V-entry to `.claude/rules/00-session-start.md`
2. Fix code + add adversarial test
3. If rule was ambiguous, clarify with the anti-example
4. If no rule covered this class, add one
5. Add audit invariant (grep pattern) to catch future violations

The V-log becomes your institutional memory. New sessions read it and
avoid repeating the same mistakes.

## How to handoff between team members

When dev A leaves session and dev B picks it up:

1. Dev A's session ends with an updated `SESSION_HANDOFF.md` + session
   checkpoint + `active.md`
2. Dev A commits + pushes
3. Dev B pulls, opens a new Claude session
4. Dev B pastes the Resume Prompt from `SESSION_HANDOFF.md`
5. New Claude reads the 4 mandatory files + latest checkpoint
6. Dev B's session starts with full context

If dev A didn't write a handoff (went home in a hurry), dev B's first task
is to reconstruct handoff from `git log` + current branch state, THEN start
the work. **Don't start work without a handoff — the cost of drift is higher
than the cost of 15 min writing the handoff.**

## How to handoff between chats (same user, new context)

Same pattern, but simpler: user copies Resume Prompt into new chat. The
`SESSION_HANDOFF.md` is the "state" — the chat is just a view into it.

For long sessions that risk context compaction, use `/clear` or start a new
chat proactively rather than letting Claude compact. Compaction is lossy;
your SESSION_HANDOFF.md is not.

## How to maintain strict adherence

Check at the end of every session:

- [ ] `SESSION_HANDOFF.md` updated with current state + next action + resume prompt
- [ ] `.agents/active.md` updated with hot state
- [ ] If major milestone: new `.agents/sessions/YYYY-MM-DD-<slug>.md` checkpoint
- [ ] If any rule was violated: V-entry added to `00-session-start.md`
- [ ] All iron-clad rules read fresh at session start (recent session had
      explicit "read X before any tool call" execution)

If any of these are skipped, drift is beginning.

## How to recover from drift

If you notice that a recent session violated an iron-clad rule:

1. Acknowledge the violation openly (don't hide)
2. Fix the code + add test + log V-entry
3. Strengthen the rule if it was ambiguous
4. Audit other recent sessions for similar violations
5. Update team (if shared project) — "V{N} happened because X; here's the stronger rule"

Drift recovered early = one V-entry + one rule strengthened. Drift that
runs for weeks = re-architecture.

---

## Tooling that helps (but isn't required)

- **SessionStart hooks** in your harness — auto-inject "read CLAUDE.md
  first" before any tool call
- **PostToolUse hooks** — grep-pair verification after every Edit
- **PreCommit hooks** — run `/audit-all` before allowing commit
- **CI** — run adversarial tests + audit skills on every PR

All optional. The protocol works with just the files + discipline.

## Tooling that hurts

- **AI auto-summarization** (claude-mem, GenericAgent L1-L4) — summarizes
  rules → loses literal text → grep breaks → audits fail silently
- **Vector DB for project memory** — same problem
- **Auto-generated skill from session transcript** — AI-compressed SOPs
  drift from the rule file they were derived from

Keep rules human-authored, plain markdown, grep-auditable forever.
