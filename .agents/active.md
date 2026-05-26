---
updated_at: "2026-05-26 EOD+5 — Patient-link hide-empty-boxes + auto-delete stale links (AV135) SHIPPED LOCAL"
status: "LOCAL — committed + pushed; NOT deployed (awaits explicit 'deploy', V18). prod UNCHANGED 459a4ea3."
branch: "master"
last_commit: "269010c9 feat(patient-link): hide empty boxes in customer-mode + auto-delete stale links (AV135)"
tests: "full suite 14803 pass + rotating pre-existing load-flakes (global.fetch-leak/perf — all pass isolated; my files 80/0) · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "459a4ea3 LIVE (staff-chat + carryover) — patient-link feature NOT yet deployed"
firestore_rules_version: "UNCHANGED — no rules/index change this feature (admin-SDK cron; be_appointments where customerId== already used by the endpoint) → no Probe-Deploy-Probe"
---

# Active Context

## State
- Customer patient-link page (`?patient=<token>`, `__customerMode`) now shows ONLY boxes with data:
  - courses empty box ("ไม่มีคอร์สคงเหลือ") HIDDEN in customer-mode (admin/sync view keeps it as feedback)
  - appointments box already hides when empty (existing); subtle line "ยังไม่มีนัดหมายหรือคอร์สในขณะนี้" when nothing at all (Q2=B)
- NEW daily cron `patient-link-cleanup-sweep` auto-deletes a link empty (no upcoming appt + no remaining course) for ≥30 days — empty-since state machine; true-delete = clear token (Q3=A/Q4=A). Staff regenerate from CustomerDetailView.
- "What does this link show" single-sourced in NEW `src/lib/customerLinkPayloadCore.js` (endpoint + cron agree). AV135.

## What this session shipped
- /session-start → brainstorming (AskUserQuestion previews, Rule S no live browser at ask/plan) → spec → writing-plans → executing-plans INLINE (subagents thrash this baseline).
- 13 files (+1279/-45): core + endpoint refactor + cron + script + diag + vercel.json + UI + test bank + AV135 + 3 V21 fixups (F6.6/F7.3/E10 follow the core extraction).
- Decisions: Q1=A customer-mode-only · Q2=B subtle line · Q3=A empty-since 30d · Q4=A clear-token true-delete.
- Detail → spec/plan `docs/superpowers/{specs,plans}/2026-05-26-patient-link-hide-empty-boxes-auto-cleanup*`.

## Verification (Rule Q-honest)
- Code: focused 80/0 (real-core unit + flow-simulate + source-grep); full suite 14803 pass — residual reds = rotating pre-existing global.fetch-leak/perf load-flakes (each run a different file; all pass isolated; NOT mine). Build clean.
- **L2 real prod** (cron dry-run, READ-ONLY): scanned 2 / skipped 2 / 0 deleted. Diag of the screenshot customer LC-26000023 (0 courses + 1 appt) → coursesBox HIDDEN, apptBox SHOW, subtleLine no, cron isEmpty=false → kept. ไพบูลย์ LC-26000106 same.
- **GAP (disclosed):** visual pixel render not driven in a real browser by me — local vite dev doesn't serve the serverless endpoint (customer-mode needs vercel dev/deploy). Render is source-grep + build locked + data-contract L2-proven. Full visual L1 = user post-deploy.

## Next action
- USER: say "deploy" → `vercel --prod` (frontend + new cron; NO rules change → no Probe-Deploy-Probe). Vercel registers the new daily cron from vercel.json.
- USER L1 post-deploy: open the screenshot link `?patient=3cc66f7e…` → no "ไม่มีคอร์สคงเหลือ" box, just the appointment; an all-empty customer → subtle line only.
- Rule M: cron `--apply` runs automatically daily once deployed; first manual confirm via `node scripts/patient-link-cleanup-sweep.mjs --apply` is user-authorized (currently 0 would-delete, safe).

## Outstanding user-triggered actions
- Deploy (above). No pending migration (cron is recurring, not a one-shot). If a bug surfaces → /systematic-debugging + Rule P.
