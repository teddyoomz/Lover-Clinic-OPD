# AGENTS.md — LoverClinic OPD

## Purpose
`.agents/` is a structured context workspace for humans + AI agents, **complementing** (not replacing) the iron-clad rules in `CLAUDE.md` + `.claude/rules/`.

Keep this file short. Policy + pointers only — task history goes to `.agents/sessions/`.

## Reading Order & Trust Priority
Before any non-trivial work, read in this order. Higher items win on conflict.

1. **Latest explicit user instruction** (this turn)
2. **Verified codebase state** (`git log`, actual file contents)
3. **`CLAUDE.md` + `.claude/rules/00-04`** — iron-clad rules A-H + H-bis (never override)
4. **`.agents/AGENTS.md`** (this file)
5. **`.agents/active.md`** — current task focus + next action
6. **Memory files** at `C:\Users\oomzp\.claude\projects\F--LoverClinic-app\memory\` (start with `MEMORY.md` + `SESSION_HANDOFF.md`)
7. **Most relevant file in `.agents/topics/`** (durable notes)
8. **Most recent file in `.agents/sessions/`** (latest checkpoint)
9. **`.agents/index/repo-tree.md`** (auto-generated)

**If notes conflict with the codebase, trust the codebase.** If `.agents/` conflicts with `.claude/rules/`, trust `.claude/rules/` (iron-clad beats advisory).

## Context System

| Path | Purpose |
|------|---------|
| `.agents/active.md` | Hot working state — current focus, blockers, next action (update every focus change) |
| `.agents/topics/` | Durable knowledge surviving across sessions (architecture, subsystem overviews) |
| `.agents/sessions/` | Per-task checkpoints — format `YYYY-MM-DD-short-topic.md` |
| `.agents/private/` | Local-only notes (gitignored, never shared) |
| `.agents/index/repo-tree.md` | Auto-generated directory tree (regen via `python scripts/update_repo_context.py`) |

## How This Fits With Existing Context

LoverClinic already has three context layers — `.agents/` is the fourth:

| Layer | Where | When to update |
|-------|-------|----------------|
| **Iron-clad rules** | `.claude/rules/00-04-*.md` | Only when a new rule or violation pattern is locked in (rare) |
| **Codebase map** | `CODEBASE_MAP.md` | Every file added / removed / renamed / restructured |
| **Cross-session memory** | `C:\Users\oomzp\.claude\projects\F--LoverClinic-app\memory\` | When user context, feedback, or project facts persist across sessions |
| **`.agents/`** (this) | Here | Current task state + resumable session checkpoints + durable topic notes |

Don't duplicate. Pointers are fine.

## Rules
- Read `.agents/active.md` before meaningful work.
- Update `.agents/active.md` when focus / blocker / next action changes.
- Create a session note at resumable checkpoints (use format `YYYY-MM-DD-short-topic.md`).
- Promote only **durable, evidenced** knowledge into `.agents/topics/`. Speculation stays in `active.md`.
- Record evidence: file paths, commands, outputs, decisions — not chain-of-thought.
- Mark uncertainty explicitly (e.g. "unverified:", "assumption:").
- Remove stale notes when they stop matching the codebase.

**Never store**: secrets, raw transcripts, chain-of-thought, speculative notes, duplicate summaries. For iron-clad rule violations, update `.claude/rules/00-session-start.md` anti-example catalog instead.

## Session Notes Format
At a checkpoint, write `.agents/sessions/YYYY-MM-DD-topic.md` with:
- **Summary** — what was accomplished in 1-2 lines
- **Current State** — commit SHA, test count, build status
- **Decisions** — architectural choices made (with rationale)
- **Blockers** — what's blocking progress + what unblocks it
- **Files Touched** — list with 1-line purpose each
- **Commands Run** — repro commands (git, npm, firebase, opd.js)
- **Next Todo** — next atomic action on resume
- **Resume Prompt** — verbatim prompt to paste into a fresh session

## Minimum Update Contract
After meaningful work:
- **`.agents/active.md`** — when focus, blockers, or next steps change
- **`.agents/sessions/`** — when a task reaches a checkpoint (phase done, long debug resolved, handoff)
- **`.agents/topics/`** — only when knowledge is durable beyond the current task
- **Memory system** — when a fact persists across sessions (user preference, project state)
- **`CODEBASE_MAP.md`** — when files added / removed / renamed

## Maintenance
```bash
bash agents.sh                          # scaffold or refresh missing files
bash agents.sh --force                  # overwrite all scaffold files
bash agents.sh --clean                  # remove scaffold entirely
python scripts/update_repo_context.py   # regenerate repo tree (Windows: `python`; macOS/Linux: `python3`)
```
