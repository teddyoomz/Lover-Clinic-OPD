---
name: session-start
description: Boot a new Claude session with the full cross-session context. Use this skill at the START of every new session, new chat, or after /clear / /compact. It reads the mandatory context files in strict order (CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md → .claude/rules/00-session-start.md), confirms iron-clad rules are loaded, and reports the current state + next action to the user. If any mandatory file is missing, it STOPS and asks the user rather than inventing context. Triggers: user types "/session-start", pastes a "Resume {project} from …" prompt, or explicitly asks to "load context" / "boot session" / "resume where we left off".
---

# /session-start

Mandatory cold-boot sequence for a new Claude session on a project that uses
claude-guardrails. Run this BEFORE any other tool call.

## When to invoke

- First message of a new chat on an existing project
- After `/clear` or `/compact`
- When user pastes a Resume Prompt from `SESSION_HANDOFF.md` or
  `.agents/sessions/*.md`
- When user explicitly says "load context", "boot session", "resume"

## Execution (strict order — do NOT skip steps)

### Step 1 — Read mandatory files

Read in this exact order. Use the `Read` tool for each:

1. `CLAUDE.md` (project root) — stack, env, rule index, onboarding checklist
2. `SESSION_HANDOFF.md` (project root) — cross-session state of truth,
   current focus, blockers, next action, Resume Prompt
3. `.agents/active.md` — hot state YAML frontmatter + immediate focus
4. `.claude/rules/00-session-start.md` — character + iron-clad rules A-H +
   past violations V1-Vn + pre-commit checklist

If ANY of these files does not exist:
- Stop immediately
- Report which file is missing
- Ask user whether this is a fresh install (instruct them to run
  `install.sh`) or an established project with a different file layout

### Step 2 — Read conditional files

Based on what Step 1 revealed:

- If `.agents/active.md` mentions a specific checkpoint file in
  `.agents/sessions/`, read that too (full context for resuming).
- If the next action touches a specific area (backend, UI, forms, ...),
  read the matching `.claude/rules/0{N}-*.md` specialty file.
- If a memory system exists (e.g. `~/.claude/projects/*/memory/MEMORY.md`),
  note it — Claude Code auto-loads; no manual Read needed.

### Step 3 — Verify iron-clad rule comprehension

After reading, mentally confirm you can state:

- [ ] What iron-clad rules A-H are (at least their titles)
- [ ] The most recent V-entry and its lesson
- [ ] The current commit SHA + test count + deploy state
- [ ] The specific next action (not generic "continue working")
- [ ] What user-triggered actions are outstanding (deploy, migrations, etc.)

If you can't confidently state any of these from the files you read, re-read
the relevant file. Do NOT proceed with tool calls until you can.

### Step 4 — Report to user

Emit a short response (≤ 150 words) with this structure:

```
✅ Session booted.

Status: {branch}={sha}, {N tests}, {deploy state}
Current focus: {from active.md}
Next action: {from SESSION_HANDOFF.md Next Action}

Iron-clad rules loaded: {A-H brief summary — one line per rule}.
Recent V-entries of note: V{N}, V{N-1} ({one-word lesson each}).

Outstanding (user-triggered, not auto):
- {list from SESSION_HANDOFF.md}

Awaiting your go-ahead. If next action still applies → say "proceed".
If priorities changed → specify new task.
No deploy / rules-change this turn without explicit "deploy" / "deploy rules" authorization.
```

### Step 5 — Await user go-ahead

Do NOT start coding. Do NOT run tests. Wait for user to:
- Say "proceed" (continue with Next Action)
- Say "instead, do X" (new direction)
- Ask a question (answer from loaded context)

## Anti-patterns (what NOT to do)

- **Don't summarize rules in your own words** — rules are greppable literal
  text; your paraphrase is lossy.
- **Don't auto-fix anything you notice in the loaded files** — report first,
  fix only with user authorization.
- **Don't skip any step** — skipping Step 3 is the most common drift trigger.
- **Don't invent context** — if a file is missing or ambiguous, STOP and ask.
- **Don't run commands (tests, lint, build) during session-start** — reading
  only. Computation is for after user go-ahead.

## Integration with other tools

- **Hooks**: if `.claude/settings.json` has a SessionStart hook, it may
  auto-inject the "read these files" instruction. This skill is the fallback
  when no hook is configured OR when user manually invokes `/session-start`.
- **Memory**: `~/.claude/projects/<proj>/memory/MEMORY.md` is auto-loaded by
  Claude Code. This skill does not re-read memory — Claude Code handles it.
- **Audit skills**: do NOT run `/audit-all` during session-start. That's
  a pre-release action, not a boot action.

## Success criteria

A fresh Claude session, after running `/session-start`, can:
- Answer "what's the current state?" from loaded context (not guessed)
- Answer "what's the next task?" with specific file paths / line numbers
- Refuse to break iron-clad rules (tested by asking to deploy without auth)
- List the last 2-3 V-entries without re-reading

If any of these fail, the boot was incomplete. Re-run Step 1-3.
