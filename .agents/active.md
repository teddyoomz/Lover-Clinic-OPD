---
updated_at: "2026-05-05 EOD+ — V15 #14 LIVE; H-bis aborted; graphify claude integration installed"
status: "master=fdd7efc · prod=1d15db5 LIVE (V15 #14) · 4612 tests pass · 2 docs/config commits ahead-of-prod"
current_focus: "V15 #14 LIVE. graphify auto-read now wired (CLAUDE.md ## graphify section + PreToolUse grep nudge). Branch-selector brainstorm queued."
branch: "master"
last_commit: "fdd7efc"
tests: 4612
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "1d15db5"
firestore_rules_version: 24
storage_rules_version: 2
---

# Active Context

## State
- master = `1d15db5` · production = `1d15db5` (V15 #14 LIVE 2026-05-05) · **in-sync** (no commits ahead)
- 4612/4612 tests pass · build clean · firestore.rules v24 (unchanged from V15 #13 — idempotent re-publish)
- Phase 16 ALL LIVE. AP1-bis multi-slot reservation shipped to prod.

## What this session shipped
- **V15 #14 combined deploy** (2026-05-05) — vercel + firebase rules; Probe-Deploy-Probe Rule B 6/6 pre + 6/6 post + cleanup 4/4 + HTTP smoke (/ 200, /admin 200, line webhook 401-LINE-sig). Vercel build 3.12s, aliased `lover-clinic-app.vercel.app`. Rules idempotent.
- **H-bis ProClinic strip migration** — planned + executed Phase A-F-lite (52 tests) → user halted "เอาทุกอย่างที่มึงเปลี่ยนใน frontend กุคืนมาให้หมด" → full revert via `git checkout HEAD -- ...` + `cookie-relay/` restored. **Zero source commits made**; working tree clean.
- Plan file `database-vast-dahl.md` updated to ABORTED status with carry-forward lessons.
- **`fdd7efc` graphify claude integration installed** — `## graphify` section appended to CLAUDE.md (auto-loaded every session) + PreToolUse hook in `.claude/settings.json` nudges Claude to read `graphify-out/GRAPH_REPORT.md` when grep/rg/find/fd/ack/ag fires. Graph state: 3247 nodes / 5852 edges / 262 communities (top 25 hand-labeled). graphify-out/ stays gitignored.

## Decisions (1-line each)
- H-bis abort root cause: scope of "backend" overlapped with files user considers frontend (cookie-relay powers PatientDashboard.broker.getCourses; ClinicSettingsPanel sync UI is user-active).
- Big-bang multi-file ProClinic strip too risky in this codebase — tier-by-tier or single-file-per-deploy preferred next attempt.
- V15 #14 deploy ran AFTER full revert — AP1-bis was independent of the strip work, shipped clean on the original 1d15db5 commit.
- AdminDashboard, TreatmentFormPage, TreatmentTimeline, cookie-relay/ all classified as frontend-touching → leave alone in any future strip.

## Next action
**Brainstorm backend branch-selector via `superpowers:brainstorming` skill** — user queued a major feature: top-right Tab to switch active branch (mirror ProClinic UX). Shared collections: customers / staff (filtered by per-staff branch access) / permission-groups / branches / system-settings. Pre-req: tag every existing customer with `branchId='นครราชสีมา'`.

## Outstanding user-triggered actions
- **Branch-selector design brainstorm** (next session — invoke `Skill(brainstorming)` per Rule J before any plan/code)
- Customer-tag bootstrap to baseline `branchId` before new branches
- 16.8 `/audit-all` orchestrator-only readiness check
- Phase 17 plan TBD

## Rules in force
- V18 deploy auth (per-turn explicit "deploy"; no roll-over)
- V15 combined deploy (vercel + firestore:rules + Probe-Deploy-Probe Rule B)
- Rule J brainstorming HARD-GATE + ORTHOGONAL plan-mode
- Rule K work-first, test-last for multi-stream cycles
- Rule H-quater no master_data reads in feature code
- NO real-action clicks in preview_eval
- V31 silent-swallow lock
