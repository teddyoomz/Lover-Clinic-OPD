---
name: session-end
description: Wrap up the current Claude session by updating cross-session state files and generating a paste-ready Resume Prompt for the next session. Use this skill when the user says "end session", "wrap up", "save state for next time", or before `/clear` / `/compact`. It updates .agents/active.md with the latest hot state, optionally creates a new .agents/sessions/YYYY-MM-DD-<slug>.md checkpoint for major milestones, updates SESSION_HANDOFF.md with next-action clarity, and emits the Resume Prompt block the user copies into the next chat.
---

# /session-end

Capture session state into durable files so the next Claude session can
resume with zero drift.

## When to invoke

- User says "end session", "wrap up", "close out"
- User says "I'm going offline", "bbl", "ttyl"
- Before the user plans to `/clear` or `/compact`
- At a natural milestone (feature shipped, deploy done, phase closed)
- Token budget getting tight and user wants to preserve state

## Execution

### Step 1 — Gather current state

From git + filesystem + memory:

- Current branch + last commit SHA + one-line commit msg
- Test count (run `npm test -- --run 2>&1 | tail -3` or stack equivalent)
- Build state (clean / failing)
- Deploy state (deployed commit SHA vs HEAD; any pending deploy)
- Uncommitted changes (`git status --short`) — flag if anything not committed

### Step 2 — Update `.agents/active.md`

Rewrite the YAML frontmatter:

```yaml
---
updated_at: "{today YYYY-MM-DD, end-of-session}"
status: "{one-line state — e.g. 'Phase 13.1 in progress — validator done, CRUD next'}"
current_focus: "{what you were working on}"
branch: "{branch}"
last_commit: "{sha}"
tests: {N}
production_url: "{if applicable}"
---
```

Rewrite the body:
- **Current State** — bullet list of what was accomplished this session
- **Blockers** — anything preventing next action
- **Next Action** — specific file path + line + task (not generic "continue")
- **Recent Decisions** — 3-5 non-obvious decisions from this session with reasoning

Keep `.agents/active.md` short (≤ 100 lines). Move detail to checkpoint.

### Step 3 — Create checkpoint (if milestone)

If this session shipped a significant milestone (feature complete, phase
closed, major refactor, pre-release audit), create:

`.agents/sessions/YYYY-MM-DD-<kebab-slug>.md`

Use the template at `.agents/sessions/_template.md`. Fill in:
- Summary (1-3 sentences)
- Current State (branch, commit, tests, build, deploy)
- Decisions (non-obvious ones with reasoning)
- Blockers
- Files Touched (brief list — not full diff)
- Commands Run (copy-pasteable record)
- Commit List (this session's commits)
- Next Todo (ranked by risk vs value)
- Resume Prompt (paste-ready — see Step 5)

### Step 4 — Update `SESSION_HANDOFF.md`

Refresh:
- Current State section
- What's Done (append new milestones)
- What's Next (rewrite to reflect new priority)
- Outstanding User Actions (update / clear completed ones)
- Blockers
- Violations This Session (log any V-entries added)
- Resume Prompt (Step 5 output goes here)

### Step 5 — Generate Resume Prompt

Emit this block (user copies + pastes into new Claude chat):

```
Resume {project-name} — continue from 2026-MM-DD end-of-session.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (cross-session state of truth)
3. .agents/active.md (hot state — {branch}={sha}, {N} tests)
4. .claude/rules/00-session-start.md (iron-clad A-H + V-log)
5. (if applicable) .agents/sessions/YYYY-MM-DD-<slug>.md (detail checkpoint)

Status summary:
- master = {sha}, {N} tests passing
- Production: {deploy state}
- {anything unusual user should know}

Next action (most recent Next Action from SESSION_HANDOFF.md):
{specific task — file + line + what to do}

Outstanding user-triggered actions (NOT auto-run):
- {list}

Rules:
- No deploy unless user explicitly says "deploy" THIS turn
- {other stack-specific reminders from iron-clad B}
- Every bug → test + rule + audit invariant (Rule D)

Invoke /session-start to boot context.
```

### Step 6 — Summary to user

Tell the user:
- What was updated (active.md, SESSION_HANDOFF.md, checkpoint file if any)
- Where the Resume Prompt is (quote it in full for immediate copy)
- Any pending commits (remind user to commit + push BEFORE closing if needed)
- Token-budget note if relevant

## Anti-patterns

- **Don't AI-summarize iron-clad rules** in active.md or SESSION_HANDOFF.md.
  Link to rule files instead.
- **Don't delete old V-entries** "to clean up" — they grow forever.
- **Don't forget to commit + push** — active.md / SESSION_HANDOFF.md updates
  are worthless if they stay local.
- **Don't skip the checkpoint** for a milestone — future sessions need the
  detail, active.md alone is too compressed.
- **Don't rewrite history in checkpoints** — each checkpoint is immutable
  once committed. Add corrections as new entries, don't edit old ones.

## Integration with git

The minimal git dance at the end of /session-end:

```bash
git add .agents/active.md SESSION_HANDOFF.md .agents/sessions/*.md
git commit -m "docs(agents): end-of-session YYYY-MM-DD state"
git push origin {branch}
```

This MUST happen before the user closes the session. Unpushed state updates
= invisible to tomorrow's session.

## Success criteria

Tomorrow's fresh Claude session, pasted the Resume Prompt you generated,
running /session-start, should:

- Know exact commit SHA + test count + deploy state
- Know specific next file + line + task
- List outstanding user actions
- Not invent any context
- Not deploy / edit rules without explicit authorization

If you test this today (new chat → paste Resume Prompt → /session-start)
and it fails any of those, your /session-end output was incomplete. Fix and
re-emit.
