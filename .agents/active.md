---
updated_at: "2026-05-26 EOD+5 — Patient-link hide-empty-boxes + auto-delete stale links (AV135) SHIPPED LOCAL + wiki/graphify ingested"
status: "LOCAL — committed + pushed; NOT deployed (awaits explicit 'deploy', V18). prod UNCHANGED 459a4ea3."
branch: "master"
last_commit: "eaa5204f docs(wiki): ingest patient-link hide-empty + auto-cleanup (AV135) [feat = 269010c9]"
tests: "full suite 14803 pass (at 269010c9) + rotating pre-existing global.fetch-leak/perf load-flakes (all pass isolated; my files 80/0) · build clean · docs/wiki-only since → unchanged"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "459a4ea3 LIVE (staff-chat + carryover) — patient-link feature NOT yet deployed"
firestore_rules_version: "UNCHANGED — no rules/index change this feature (admin-SDK cron; be_appointments where customerId== already used by the endpoint) → no Probe-Deploy-Probe"
---

# Active Context

## State
- Customer patient-link page (`?patient=<token>`, `__customerMode`) shows ONLY boxes with data: courses empty box ("ไม่มีคอร์สคงเหลือ") HIDDEN in customer-mode (admin/sync view keeps it as feedback); appt box already hid when empty; subtle line "ยังไม่มีนัดหมายหรือคอร์สในขณะนี้" when nothing at all (Q2=B).
- NEW daily cron `patient-link-cleanup-sweep` (`30 21 * * *`) auto-deletes a link empty (no upcoming appt + no remaining course) for ≥30d — empty-since state machine; true-delete = clear token (Q3=A/Q4=A). Staff regenerate from CustomerDetailView.
- "What does this link show" single-sourced in NEW pure `src/lib/customerLinkPayloadCore.js` (endpoint + cron agree). AV135.

## What this session shipped
- Full `/session-start → brainstorming (AskUserQuestion previews, Rule S) → spec → writing-plans → executing-plans INLINE` (subagents thrash this baseline).
- 13 files (+1279/-45): core + endpoint refactor + cron + script + diag + vercel.json + UI + test bank (40/0) + AV135 + 3 V21 fixups (F6.6/F7.3/E10 follow the core extraction). Commit `269010c9`.
- Decisions: Q1=A customer-mode-only · Q2=B subtle line · Q3=A empty-since 30d · Q4=A clear-token.
- Wiki ingest (`eaa5204f`): 1 source + 2 entities + 1 concept + index/log. Graphify update ran (`python -m graphify`; bare not on PATH): 8087 nodes / 14648 edges / 859 communities (graphify-out gitignored).
- Detail → checkpoint `.agents/sessions/2026-05-26-patient-link-hide-empty-cleanup.md` + spec/plan `docs/superpowers/{specs,plans}/2026-05-26-patient-link-hide-empty-boxes-auto-cleanup*`.

## Verification (Rule Q-honest)
- Code: focused 80/0; full suite 14803 pass — residual reds = rotating pre-existing global.fetch-leak/perf load-flakes (different file each run; all pass isolated; NOT mine). Build clean.
- **L2 real prod** (cron dry-run, READ-ONLY): scanned 2 / skipped 2 / 0 deleted. Diag of screenshot customer LC-26000023 (0 courses + 1 appt) → coursesBox HIDDEN, apptBox SHOW, cron isEmpty=false → kept (ไพบูลย์ LC-26000106 same).
- **GAP (disclosed):** visual pixel render not driven in a real browser by me — local vite dev doesn't serve the serverless endpoint (customer-mode needs vercel dev/deploy). Render is source-grep + build locked + data-contract L2-proven. Full visual L1 = user post-deploy.

## Next action
- USER: say "deploy" → `vercel --prod` (frontend + new cron registers from vercel.json; NO rules change → no Probe-Deploy-Probe).
- USER L1 post-deploy: open the screenshot link `?patient=3cc66f7e…` → no "ไม่มีคอร์สคงเหลือ" box, just the appointment; an all-empty customer → subtle line only.

## Outstanding user-triggered actions
- Deploy (above). Cron `--apply` runs daily once deployed (currently 0 would-delete, safe). Bug → /systematic-debugging + Rule P.
