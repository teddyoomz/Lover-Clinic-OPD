# 2026-06-15 — appt-hub past-tab DESC + ponytail GLOBAL + 🧭 Master Flow / 📊 graphify lifecycle

## Summary
Three ships: (1) `/systematic-debugging` fix — the appt-hub "ย้อนหลัง 30 วัน" past tab now sorts newest-first (yesterday at top), DEPLOYED; (2) installed **ponytail** (lazy-senior-dev skill) GLOBAL for every project; (3) `/brainstorming` → designed + implemented a single-source **Master Flow** (task tiers T0–T3) + **graphify lifecycle** (read graph at boot / `graphify update .` at session-end), wired into the global `~/.claude/CLAUDE.md` + LoverClinic rules/skills, and **ported to the guardrails GitHub template**.

## Current State
- prod LIVE: vercel `f302216c` (appt-hub past-tab DESC) + firebase rules `e5418722` (unchanged). master HEAD `c48c4897` (docs/rules). Tree clean.
- Full vitest **16398/0** (from the past-tab fix; all later changes were docs/rules — no app source). graphify graph refreshed (9443 nodes / 17329 edges / 981 communities).
- ponytail global install complete (skills + always-on rule + user-wired hooks). Master Flow/graphify lifecycle live in rules + skills (fires next boot).

## Commits
```
LoverClinic (master):
  c48c4897 docs(flow): Master Flow pointer + graphify lifecycle bookend
  6b61a892 docs(agents): active.md — appt-hub past-tab DESC deployed
  f302216c fix(appt-hub): "ย้อนหลัง 30 วัน" past tab sorts newest-first  ← DEPLOYED
guardrails (main, GitHub teddyoomz/claude-guardrails):
  2ea158a feat(flow): Master Flow tier model + graphify lifecycle bookend
```

## Files Touched (names only)
- appt-hub: src/lib/appointmentHubFilters.js (+sortApptsByDateTimeDesc) · src/components/admin/AppointmentHubView.jsx · tests/v64-appointment-hub-filters.test.js (F10/F11)
- Master Flow / graphify (LoverClinic): ~/.claude/CLAUDE.md (global, untracked) · .claude/rules/00-session-start.md · .claude/skills/session-start/SKILL.md · .claude/skills/session-end/SKILL.md · ~/.claude/skills/session-end/SKILL.md (untracked)
- ponytail (untracked global): ~/.claude/skills/ponytail{,-review,-audit,-debt,-help}/ · ~/.claude/CLAUDE.md · ~/.claude/ponytail/ checkout · ~/.claude/settings.json (user-wired)
- guardrails: .claude/rules/00-session-start.md · .claude/skills/session-{start,end}/SKILL.md · CLAUDE.md · README.md
- restored: .claude/settings.json (project — reverted an unexpected strip)

## Decisions (1-line each)
- appt-hub: per-tab sort — `past` = DESC (recency-first); today/tomorrow/future/opd-pending stay ASC. Isolated, no class-of-bug siblings (one rendering consumer).
- ponytail install: skills user-level + always-on rule in `~/.claude/CLAUDE.md`; hooks are a USER decision (agent settings-hook edit HARD-blocked by classifier — correct + matches ponytail's own model).
- Master Flow Q1=Active(rules) / Q2=global-core+project-overlay / Q3=all-4-metrics (single-source + correctness + speed + token) → resolved via TASK-TIERING (gate depth scales with task size).
- graphify = lifecycle bookend (read@boot for codebase model / update@end for freshness) — compounding loop like llm-wiki. Conditional on `graphify-out/` existing.
- De-dup is BY REFERENCE not deletion (V5-safe): project rules point to the global Master Flow for the generic parts, keep only LoverClinic deltas.
- Precedence: user-explicit > project iron-clad > Master Flow+superpowers > ponytail > default.

## Next Todo
- IDLE / await direction.
- USER: rotate LINE/FB secrets (chat_config OLD — AV195, carried).
- Verify next boot: ponytail `[PONYTAIL]` activation + mode-switch · Master Flow reads graphify + classifies tiers.
- Carried optional: SESSION_HANDOFF ~219KB > 200KB cap → archive oldest blocks · ภูดิท LC-26000151 re-assessment · LC-26000082 ambiguous backfill · deferred audit tail.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-15 EOD. master=c48c4897, prod frontend=f302216c LIVE. Past-tab DESC deployed; ponytail GLOBAL installed; Master Flow + graphify lifecycle wired (LoverClinic + guardrails GitHub). Next: idle. ⚠ user rotate LINE/FB secrets; SESSION_HANDOFF over 200KB cap → archive. /session-start
