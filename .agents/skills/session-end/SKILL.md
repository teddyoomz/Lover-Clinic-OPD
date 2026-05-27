---
name: session-end
description: Wrap up the current session in ≤ 1.5k LLM tokens via the Capsule + Propagate pattern. Use when user says "end session", "wrap up", or before /clear/compact. LLM writes ONE JSON capsule (high-judgment) + optional wiki page bodies; bash + node propagator does ALL mechanical work — checkpoint render, active.md frontmatter, SESSION_HANDOFF surgery, wiki/log.md append, wiki/index.md row insertion, git commit + push, Resume Prompt emit. Skip-conditions auto-detect no-op / docs-only / full-mode sessions.
---

# /session-end — Capsule + Propagate (genius edition, 2026-05-06)

LLM writes ~30 lines of JSON. Script writes ~300 lines of markdown across 5 files. Total: 1 bash + 1 Write + 0-2 wiki page Writes + 1 bash. Done.

> 🚫 **NO TESTS DURING SESSION-END (user directive, 2026-05-27)**: `brief.sh` /
> `apply.mjs` here pre-compute "git+tests" and the apply step "runs vitest
> internally" — that is FORBIDDEN. session-end must NEVER run `vitest` / `npm
> test` / the full suite. Reuse the session's last-known test count. If this
> Capsule+Propagate variant is ever activated, its brief.sh + apply.mjs MUST be
> changed to SKIP the test run (git/SHA pre-compute only). The session already
> ran what it needed; re-running wastes 90s+ and the user explicitly forbade it.

## The pattern

```
LLM:    [brief.sh] → [judge mode] → [.next.json + optional wiki bodies] → [apply.mjs]
Script: [pre-compute git+tests+SHAs] → [propagate to checkpoint/active/handoff/log/index] → [commit+push] → [print Resume Prompt]
```

## Hard caps (BLOCKING — exceed = redo)

- `.agents/sessions/.next.json` capsule ≤ 50 lines (LLM's only structured output)
- Each new wiki concept/entity page body ≤ 60 lines (LLM writes only when shipping a NEW named pattern or NEW lib module)
- `.agents/active.md` (script-generated) ≤ 30 lines — capped by template
- Checkpoint (script-generated) ≤ 100 lines — capped by template
- SESSION_HANDOFF entry (script-generated) ≤ 12 lines — capped by template
- wiki/log.md entry (script-generated) ≤ 4 lines — capped by template
- **`SESSION_HANDOFF.md` total file size ≤ 200 KB (HARD CAP, 2026-05-17 EOD+2)**

### SESSION_HANDOFF.md 200 KB hard cap (NEW 2026-05-17 EOD+2)

**Rule**: `SESSION_HANDOFF.md` MUST stay under 200 KB at all times. If `/session-end`
surgery would push it over the cap, the maintainer MUST first archive the oldest
session blocks BEFORE running `session-apply.mjs`.

**Warning threshold**: > 180 KB → archive on this turn (don't wait for next turn).

**Archive procedure** (run BEFORE `session-apply.mjs`):

1. Inspect: `powershell "(Get-Item SESSION_HANDOFF.md).Length / 1024"` → if > 180,
   trigger archive.
2. Identify the oldest 5–10 `### Session ...` blocks (the tail of the file).
3. Use PowerShell to split: extract those blocks to a temp string, append to
   `.agents/sessions/session-handoff-archive.md` (prepend at TOP — newest
   archived first; existing archived blocks shift down).
4. Rewrite `SESSION_HANDOFF.md` without the moved blocks; preserve the 200 KB
   banner + Rule Q V66 banner + Current State + remaining session blocks + the
   "📂 Older session blocks → archive" pointer at the end.
5. Verify: new size < 150 KB (leaves headroom for the new session block that
   `session-apply.mjs` will insert).
6. THEN run `session-apply.mjs` as normal.

**Why**: the file grew to 317.5 KB (150+ session blocks since 2026-04-26) and broke
the `Read` tool's 256 KB limit during session boot. User directive 2026-05-17 EOD+2:
"ทำ SESSION_HANDOFF.md ให้ไม่มีวันเกิน 200 KB". The first archive split everything
older than V70/V71 saga (2026-05-16 EOD) to `.agents/sessions/session-handoff-archive.md`.
This rule prevents the file from growing back.

**Script enforcement**: `.agents/scripts/session-apply.mjs` aborts with
`SESSION_HANDOFF_TOO_LARGE` error when the file would exceed 200 KB post-surgery.
On abort, the LLM follows the manual archive procedure above, then re-runs apply.

## Steps

### 1. Brief — one bash, full state in 30 lines

```
bash .agents/scripts/session-brief.sh
```

Returns greppable sections: `===BASE===` `===HEAD===` `===PROD===` `===TESTS===` `===COMMITS===` `===FILES===` `===SHORTSTAT===` `===SUBJECTS===` `===WIKI===` `===NEW_LIB===` `===NEW_RULES===` `===NEXT_TODO===` `===MODE===` `===SLUG_SUGGESTION===` `===END===`.

`===MODE===` is the script's recommendation: `skip` (0 commits) / `minimal` (only `docs(...)` commits) / `full` (≥ 1 source commit). LLM trusts this unless context overrides.

### 2. Judge — read brief, decide

- Mode `skip` → exit. Don't even write a capsule. Tell user "no-op session, nothing to wrap".
- Mode `minimal` → write capsule with `mode: "minimal"`, `new_wiki: { concepts: [], entities: [] }`. Skip page-body writes.
- Mode `full` → write full capsule + (if a NEW pattern was named OR a NEW `src/lib/*.js` shipped OR a NEW iron-clad rule landed) write the wiki page bodies directly via `Write` tool BEFORE running apply.

Heuristic for "deserves a new wiki page":
- **Concept** — new iron-clad rule (Rule M) / new V-entry class / new architectural pattern named in commit messages or a spec file.
- **Entity** — new `src/lib/*.js` (lib module) / new `scripts/*.mjs` (one-shot tool) / new collection (`be_*`) / new top-level UI surface (Tab/Modal/Page).
- Otherwise: skip page bodies; the wiki/log.md entry alone captures the session.

### 3. Write the capsule — `.agents/sessions/.next.json`

```json
{
  "slug": "phase-19-0-and-rule-m",
  "summary": "Phase 19.0 LIVE V15 #22 + Rule M + session-end wiki auto-update",
  "mode": "full",
  "decisions": [
    "Q1 = Option B uniform",
    "Rule B probe URLs need artifacts/{APP_ID}/public/data/ prefix",
    "Migration: PEM + path bugs caught live (Rule M lesson lock)"
  ],
  "lessons": [
    "Local-first wins on iteration speed",
    "Subagent-driven 14-task cycle: 0 source-correction loops"
  ],
  "new_wiki": {
    "concepts": [
      { "slug": "data-ops-via-local-sdk", "title": "Data ops via local + admin SDK + pull env (Rule M)", "summary": "Codified 2026-05-06. Any data manipulation on prod = vercel env pull + admin-SDK + canonical artifacts path + dry-run/apply + audit doc + idempotency + forensic-trail. Never deploy-coupled." }
    ],
    "entities": [
      { "slug": "appointment-types-ssot", "title": "appointmentTypes.js — 4-type taxonomy SSOT", "summary": "Phase 19.0 4-type taxonomy SSOT. APPOINTMENT_TYPES + DEFAULT_APPOINTMENT_TYPE + 4 helpers." }
    ]
  },
  "next": "idle",
  "outstanding_added": [],
  "deploy_note": "V15 #22 LIVE — Phase 19.0 + migration --apply 27/27"
}
```

Constraints:
- `slug` — kebab-case, ≤ 5 words. The `===SLUG_SUGGESTION===` from brief is usually right.
- `summary` — one line, used in commit message + log entry + Resume Prompt. Be specific.
- `decisions` — 3-6 entries, one-line each. Skip "deployed Phase X" — that's the summary's job.
- `lessons` — 0-3 entries. Only entries that change FUTURE behavior.
- `new_wiki.concepts/entities` — only fill when actually shipping new pages this session. Each has `slug` (kebab-case), `title` (display), `summary` (used in wiki/index.md row).
- `outstanding_added` — only NEW entries to prepend to the carried-over list. Don't restate existing ones.
- `deploy_note` — only when a deploy happened this session.

### 4. Write wiki page bodies (only if `new_wiki` is non-empty)

For each `concepts[]`: `Write` to `wiki/concepts/<slug>.md` with frontmatter + body (≤ 60 lines).
For each `entities[]`: `Write` to `wiki/entities/<slug>.md` with frontmatter + body (≤ 60 lines).

Page body conventions (see `wiki/CLAUDE.md` for full schema):
- Frontmatter: `title` / `type` / `date-created` / `date-updated` / `tags[]` / `source-count`
- Body: H1 title + 1-paragraph TL;DR + Overview + Cross-references + History
- Cite file:line for code claims. Cross-link to related concept/entity pages.

### 5. Apply — one node, propagator does the rest

```
node .agents/scripts/session-apply.mjs
```

Script auto-runs:
1. Reads `.agents/sessions/.next.json`
2. If `mode: "skip"` → exits silently
3. Computes mechanical state (commits, files, tests, SHAs) via git
4. Renders + writes `.agents/sessions/<today>-<slug>.md` (checkpoint)
5. Writes `.agents/active.md` (frontmatter + 4-section body)
6. Surgically edits `SESSION_HANDOFF.md`:
   - Updates `## Current State` block
   - Inserts new `### Session <today> ...` entry above the previous one
   - Replaces the `## Resume Prompt` ``` ``` block
7. If `wiki/log.md` exists: appends `## [<today> EOD] session | <summary>` entry
8. If `wiki/index.md` exists AND `new_wiki` has entries: inserts rows under Entities + Concepts categories + bumps `date-updated` frontmatter
9. `git add` all touched files (script knows the list); commits with `docs(agents): EOD <today> — <summary>` + Co-Authored-By trailer (via temp file to avoid quoting hell)
10. `git push origin master`
11. Removes `.next.json` capsule (one-shot)
12. Prints the Resume Prompt to stdout

### 6. Relay the Resume Prompt

Take the script's stdout (the final block after `[session-apply] done.`) and emit as the LLM's final message. Verbatim — do not paraphrase or re-template. The script already produced the canonical form. Emit it INSIDE a fenced code block (top-level triple-backtick fence, language `text`) so the chat UI shows a one-click **copy button** — do NOT flatten it to plain prose.

## Success criteria

- LLM token budget for session-end: ~600 tokens (capsule only) to ~2000 tokens (full mode with 2 new wiki pages).
- Total wall time: ~5-15 seconds (1 bash brief + 1 Write capsule + 0-2 wiki Writes + 1 bash apply that runs vitest internally + git push).
- Tomorrow's `/session-start` can boot from `.agents/active.md` + checkpoint in ≤ 50 lines.
- Resume Prompt fits one message, emitted inside a fenced ```text code block (one-click copy button); pasting it into a new chat fully restores context.

## Anti-patterns (BLOCKING)

- NEVER read SESSION_HANDOFF.md to find the Resume Prompt — script handles surgery.
- NEVER restate commits / files / SHAs in the capsule — script computes from git.
- NEVER write a checkpoint markdown file directly — script renders it from capsule + git.
- NEVER skip the brief script — it's the only way to know the right base SHA.
- NEVER auto-create `wiki/sources/*` from session-end — sources are user-driven `/llm-wiki ingest`.
- NEVER rewrite existing wiki concept/entity pages from session-end — append-only at section level (use `/llm-wiki ingest` for revisions).
- NEVER commit if `git diff --cached` is empty after writes — script aborts in that case; LLM must not retry blindly.
- NEVER duplicate decisions across capsule + wiki page — capsule decisions show in checkpoint + Resume Prompt; wiki page describes the PATTERN, not this session's decisions.
- NEVER let `SESSION_HANDOFF.md` exceed 200 KB — archive oldest blocks first (see "Hard caps" § above). Breaking the 256 KB `Read` tool limit at session boot = session can't bootstrap.

## Migration from old skill (2026-05-06)

The previous version had 6 manual steps each requiring multiple Edit calls and re-reads of SESSION_HANDOFF.md (huge file). The Capsule + Propagate pattern eliminates ~70% of LLM tokens by:

- Pre-computing git/test state in one bash call (was 3 calls + reads)
- Writing ONE capsule instead of 5 redundant prose blocks (was active.md + handoff entry + handoff Resume Prompt + checkpoint + wiki/log.md + wiki concept/entity restating same info)
- Letting a deterministic script render templated downstream files
- Skip-conditions auto-detect when there's nothing to wrap (was always-full pipeline)

If anything is unclear: read `.agents/scripts/session-apply.mjs` (the script is the canonical reference for the capsule shape + downstream file format).
