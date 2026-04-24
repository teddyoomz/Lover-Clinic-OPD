# 2026-04-24 · Claude-Guardrails Compounding-Loop Shipment

## Summary

Upgraded `F:/claude-guardrails` from a passive rule catalog into a
self-compounding research-aware system. Two commits in guardrails repo
(`5894b02` + `f780430`). No LoverClinic source changes — this session
was entirely "God Brain" upgrade work. LoverClinic memory file updated
to record the port.

## Current State

- **Branch**: `master`
- **Last LoverClinic commit**: `647e2a1 fix(chat): stop phantom notification when no unread remains` (inherited from prior session, unchanged today)
- **Tests**: 2865 (unchanged — no LoverClinic source touched this session)
- **Build**: clean (not re-run; no changes to verify)
- **Production URL**: https://lover-clinic-app.vercel.app
- **Vercel deploy**: unchanged from 2026-04-21 (`c72fd0e`)
- **firestore.rules**: unchanged
- **F:/claude-guardrails HEAD**: `f780430` (2 commits ahead of prior checkpoint's `d8ea1a5`, still **local only** per user directive "ใช้เองไปเลย")

## What Shipped to Claude-Guardrails

### Commit `5894b02` (early in session) — Port 5 LoverClinic insights

1. **Adapter expansion pattern** → `docs/methodology.md` AP7 (adapter registries canonical)
2. **Full-field sync over minimal scrape** → `docs/triangle-rule.md` "Field-completeness" + AV13
3. **Migration fallback hides state** → `docs/methodology.md` AP6
4. **Triangle Rule re-scan + Universal form** → `docs/triangle-rule.md` "When to re-scan" + "Universal form" (applies to any project, not just replication)
5. **Scope expansion mid-turn** → `.claude/rules/02-workflow.md` new section

Also added:
- `.claude/settings.template.json` — 4 hook types (PostToolUse/PreToolUse/SessionStart/UserPromptSubmit)
- `docs/feedback-loop.md` — bidirectional learning protocol

### Commit `f780430` (main session work) — 10-leverage-point compounding loop

**NEW skills (6):**
- `audit-rules/` (LR1-LR10) — lint rule files themselves (identifier + why + grep + evidence + no-dup + imperative + size + skill-existence + V-entry-existence + conflict)
- `audit-health/` (H1-H10) — methodology dashboard (V-count, skill-count, invariant-count, test-delta, hooks, sessions, freshness, velocity, tier)
- `skill-relevant/` (SR1-SR7) — file path / task → ranked skill recs with confidence score
- `research-gap/` (RG1-RG8) — 5-tier research (local → project docs → official docs → WebSearch → registries) triggered by "I think / probably / usually" phrase
- `skill-autoinstall/` (SA1-SA7) — 4 install paths (Anthropic bundled, deferred ToolSearch, MCP registry, community git clone)
- `capability-scout/` extended CS8 — routes unknowns through research-gap + skill-autoinstall before ad-hoc

**NEW docs (3):**
- `starter-violations.md` — 15 universal V-entries to pre-seed new projects
- `growth-engine.md` — 4-engine compounding diagram (D + G.2 + Feedback + Session Handoff)
- `research-mode.md` — Rule G.3 philosophy + anti-patterns R1-R5

**NEW rule + methodology updates:**
- Iron-clad Rule **G.3 Research Before Guessing** (new)
- Methodology **Principle 6 Every rule cites evidence** (new)
- Methodology **Anti-pattern 8 Guess-over-research** (new)
- `_template/SKILL.md` — evidence citation mandatory per invariant

**Hook expansion 4→6 entries in `settings.template.json`:**
- `PostToolUse` on `Bash` — conventional-commit prefix detection injects type-specific D-cycle reminder
- `UserPromptSubmit` — risk-keyword detection (delete/deploy/drop/secret/rewrite) injects iron-clad crossreference

## Decisions (non-obvious)

1. **Triangle Rule is UNIVERSAL, not replication-only** — user interrupt: "triangle rules มันจะใช้กับโปรเจ็คอื่นที่ไม่ต้องไปเลียนแบบใครได้เหรอ ผมเน้นให้ใช้ได้ทุกการเขีบนโปรเจ็ค". Reframed Triangle as Evidence + Intention + Existing code (applies to any project). Original replication variant kept as sub-case.
2. **Research Mode = G.3 rule + 3 skills** — not just one. The triad (research-gap, skill-autoinstall, capability-scout) forms the discovery protocol. Adding only one would have been decorative.
3. **Evidence requirement applied retroactively via LR4** — every invariant needs V-example OR PRE-SHIP marker. Audit-rules enforces; template requires. Closes the "rules rot silently" failure mode.
4. **MCP registry integration via existing deferred tool** — `mcp__mcp-registry__list_connectors` is already in the deferred-tools list today. skill-autoinstall SA4 leverages it (not a new dependency).
5. **Guardrails stays local** — per prior user directive "ใช้เองไปเลย", no push to GitHub. Feedback loop via bridge file is the sole propagation mechanism.

## Files Touched (guardrails repo)

- `.claude/rules/01-iron-clad.md` (+36) — Rule G.3
- `.claude/settings.template.json` (+31, modified) — 2 new hooks
- `.claude/skills/_template/SKILL.md` (+16, modified) — evidence required
- `.claude/skills/audit-health/SKILL.md` (new, +204)
- `.claude/skills/audit-rules/SKILL.md` (new, +201)
- `.claude/skills/capability-scout/SKILL.md` (+29, modified) — CS8
- `.claude/skills/research-gap/SKILL.md` (new, +305)
- `.claude/skills/skill-autoinstall/SKILL.md` (new, +281)
- `.claude/skills/skill-relevant/SKILL.md` (new, +189)
- `CLAUDE.md` (+27, modified) — skills table + G.3
- `README.md` (+62, modified) — tree + Research Mode + Growth Engine
- `docs/growth-engine.md` (new, +303)
- `docs/methodology.md` (+57, modified) — Principle 6 + AP8
- `docs/research-mode.md` (new, +216)
- `docs/starter-violations.md` (new, +387)

Total: 15 files, +2325/-19 insertions across 2 commits (`5894b02` + `f780430`).

**LoverClinic memory update:**
- `project_claude_guardrails_feedback.md` — moved 2026-04-24 entry from Pending to Ported with commit SHA `f780430`

## Commands Run

```bash
# guardrails repo
cd /f/claude-guardrails && git status
cd /f/claude-guardrails && git log -5 --oneline
cd /f/claude-guardrails && git add [15 files]
cd /f/claude-guardrails && git commit -m "feat(compounding): automate growth loop — 10 leverage points" ...
cd /f/claude-guardrails && git log -1 --stat  # verify

# LoverClinic (no source changes, just memory + session artifacts)
git status --short
git log -5 --oneline
ls .agents/sessions/
```

No tests run this session (no LoverClinic source touched).

## Commit List (guardrails only, this session)

- `5894b02` feat(methodology): port 7 generalizable patterns from LoverClinic
- `f780430` feat(compounding): automate growth loop — 10 leverage points

LoverClinic repo: no commits this session.

## Next Todo (Friday 2026-04-25 or next work session)

Primary (unchanged from prior session):
- **Phase 13.1 Quotations** — validator-first, breakdown in `.agents/sessions/2026-04-24-phase13-prep.md`. +40 tests target.

Secondary (optional):
- Test Phase 11.9 end-to-end via MasterDataTab Sync+Import (carried over from prior session)
- Experiment with Research Mode on a real LoverClinic question — does it prevent a hallucination in practice?
- Copy new guardrails skills into LoverClinic if wanted locally (currently guardrails-only):
  - `/audit-rules`, `/audit-health`, `/skill-relevant`, `/research-gap`, `/skill-autoinstall`
  - Command: `cp -r F:/claude-guardrails/.claude/skills/{audit-rules,audit-health,skill-relevant,research-gap,skill-autoinstall} F:/LoverClinic-app/.claude/skills/`

Tertiary:
- Port more LoverClinic insights to guardrails as they accumulate (bridge file)
- Review guardrails `/audit-rules` invariants against LoverClinic rule files — may surface issues

## Resume Prompt (paste into fresh Friday session)

```
Resume LoverClinic OPD — continue from 2026-04-24 end-of-session.

/session-start

Context snapshot:
- master = 647e2a1, 2865 tests passing (LoverClinic unchanged this session)
- Production = c72fd0e (no deploy needed; HEAD same as prior)
- claude-guardrails at F:/claude-guardrails commit f780430 — compounding-loop
  shipment (6 new skills + 3 new docs + Rule G.3). Still local-only.
- This session shipped to guardrails only. LoverClinic source untouched.

After /session-start, suggested next actions:
A. Phase 13.1 Quotations (validator first — see 2026-04-24-phase13-prep.md)
B. Copy new guardrails skills into LoverClinic (audit-rules/audit-health/
   skill-relevant/research-gap/skill-autoinstall) if you want them locally
C. Test Phase 11.9 end-to-end via MasterDataTab Sync+Import
D. Try Research Mode live on a real question (test G.3 prevents guess)
E. Something else

Rules to remember:
- No deploy without explicit THIS-turn authorization
- Probe-Deploy-Probe 4 endpoints before firestore:rules deploy
- Triangle Rule (universal form) — Evidence + Intention + Existing code
  before writing anything that depends on external reference
- Rule D: every bug → test + rule + audit invariant
- Rule G.3 (NEW in guardrails): "I think / probably / usually" = gap
  signal → research before guessing
- Backend = Firestore ONLY, except MasterDataTab bridge
```

## Lessons for Future Sessions

1. **Jumps to "self-compounding" need multiple simultaneous additions** — rule catalog → growth engine required 4 things at once (meta-audit, health dashboard, research skill, install skill). Any one = decorative. Four together = loop.
2. **User's "ให้ใช้ได้ทุกการเขีบนโปรเจ็ค" is a universality test** — reframed Triangle Rule mid-session. Worth listening for. Universal wins over project-specific when the abstraction holds.
3. **Building a skill vs. installing one is different** — skill-creator exists (Anthropic bundled). skill-autoinstall fills the discovery gap for PUBLIC skills. The two compose.
4. **Memory file as sole propagation mechanism is OK at this scale** — no need to push guardrails to GitHub yet. User's "ใช้เองไปเลย" still governs. Push only if another project enters the orbit.

## Pending Actions (user-triggered only)

- [ ] Git push LoverClinic master (local commits from prior sessions need push)
- [ ] Optional: push guardrails to GitHub (if scope changes; currently local-only)
- [ ] Optional: run `/audit-health` against LoverClinic to get its current tier (Starter/Standard/Advanced/Expert)
- [ ] Optional: run `/audit-rules` against `.claude/rules/*.md` in LoverClinic to catch missing V-entry citations
