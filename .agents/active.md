---
updated_at: "2026-06-15 — appt-hub past-tab DESC DEPLOYED + ponytail GLOBAL install + 🧭 Master Flow / 📊 graphify lifecycle (LoverClinic + guardrails GitHub). 16398/0."
status: "Idle. master=c48c4897 (docs/rules), prod frontend=f302216c LIVE. 1 frontend fix deployed; rest = global tooling + methodology."
branch: "master"
last_commit: "c48c4897 — docs(flow): Master Flow pointer + graphify lifecycle bookend (boot read / session-end update)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = f302216c LIVE (HTTP 200; appt-hub past-tab DESC); firestore.rules = e5418722 (unchanged)."
firestore_rules_version: "WS1 + C2-bis (unchanged)."
tests: "16398 / 0 (full vitest, exit-0 — from the past-tab fix; all later changes docs/rules, no source → reused per no-tests rule)."
---

# Active — 2026-06-15 — appt-hub fix + ponytail + Master Flow/graphify lifecycle

## State
- prod LIVE: vercel `f302216c` (appt-hub past-tab DESC) + firebase rules `e5418722` (unchanged). master HEAD `c48c4897` (docs/rules). Tree clean.
- Full vitest **16398/0** (from the past-tab fix). graphify graph refreshed (9443 nodes) via the new session-end step.
- Session = 1 frontend fix (deployed) + global tooling install + methodology rules; no other app source touched.

## What this session shipped (detail → checkpoint 2026-06-15-masterflow-graphify-ponytail.md)
- **appt-hub "ย้อนหลัง 30 วัน" past tab** → `sortApptsByDateTimeDesc` (yesterday at top, DESC; upcoming tabs stay ASC; print inherits). `f302216c` DEPLOYED frontend-only. +12 tests (F10 helper / F11 source-grep).
- **ponytail** installed GLOBAL (every project): 5 skills `~/.claude/skills/ponytail*` + always-on rule in `~/.claude/CLAUDE.md` + hooks wired by USER into `~/.claude/settings.json` (auto-classifier HARD-blocked me; user did it via `/hooks` or Notepad — verified valid).
- **🧭 Master Flow + 📊 graphify lifecycle** (global core + project overlay): boot reads `graphify-out/GRAPH_REPORT.md`; session-end runs `graphify update .`; tier model T0–T3. Global `~/.claude/CLAUDE.md` + LoverClinic rules/skills (`c48c4897`) + ported to **guardrails GitHub** (`2ea158a`, teddyoomz/claude-guardrails).
- Caught + reverted an unexpected project `.claude/settings.json` strip (hooks restored to HEAD).

## Next action
- IDLE / await direction.

## Outstanding user-triggered actions
- ⚠ ROTATE LINE/FB secrets (chat_config held OLD — AV195, carried).
- Verify next boot: ponytail `[PONYTAIL]` activation + mode-switch fire · Master Flow reads graphify + classifies tiers.
- Carried: SESSION_HANDOFF ~207KB > cap → archive · ภูดิท LC-26000151 re-assessment · LC-26000082 ambiguous backfill · deferred audit tail.
