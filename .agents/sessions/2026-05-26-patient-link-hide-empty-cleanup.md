# 2026-05-26 EOD+5 — Patient-link hide-empty boxes + auto-delete stale links (AV135)

## Summary
Customer patient-link page (`?patient=<token>`, `__customerMode`) now shows ONLY boxes with data (the ugly "ไม่มีคอร์สคงเหลือ" empty box is hidden in customer-mode; subtle line when nothing at all), and a new daily cron auto-deletes a link empty (no upcoming appt + no remaining course) for ≥30 days. Shipped LOCAL, NOT deployed. Wiki + graphify ingested.

## Current State
- master = `eaa5204f` (feat `269010c9` + EOD docs `7a207f5c` + wiki `eaa5204f`); prod UNCHANGED `459a4ea3` (awaits "deploy", V18).
- Tests: focused 80/0; full suite **14803 pass** — residual reds rotate each run (global.fetch-leak/perf load-flakes, all pass isolated; NOT mine). Build clean.
- L2 real prod (cron dry-run, READ-ONLY): scanned 2 / skipped 2 / **0 deleted**. Diag screenshot customer LC-26000023 (0 courses + 1 appt) → coursesBox HIDDEN, link kept.
- NO firestore.rules / index change → no Probe-Deploy-Probe.
- GAP (disclosed): visual pixel render = user L1 post-deploy (vite dev doesn't serve the serverless endpoint).

## Commits
```
eaa5204f docs(wiki): ingest patient-link hide-empty + auto-cleanup (AV135)
7a207f5c docs(agents): EOD 2026-05-26 EOD+5 — patient-link ... SHIPPED LOCAL
269010c9 feat(patient-link): hide empty boxes in customer-mode + auto-delete stale links (AV135)
```

## Files Touched (feat 269010c9 — 13 files, +1279/-45)
- NEW `src/lib/customerLinkPayloadCore.js` (pure core)
- `api/patient-view.js` (refactor → core, behavior-preserving)
- NEW `api/cron/patient-link-cleanup-sweep.js` + `scripts/patient-link-cleanup-sweep.mjs` (Rule M) + `scripts/diag-patient-link-empty-state.mjs` (Rule R)
- `vercel.json` (daily cron `30 21 * * *`)
- `src/pages/PatientDashboard.jsx` (isCustomerMode gate + subtle line + tx)
- NEW `tests/patient-link-cleanup-and-hide-empty.test.js` (40/0) + V21 fixups in `tests/customer-patient-link-flow-simulate.test.js` (F6.6/F7.3) + `tests/customer-patient-link-helpers.test.js` (E10)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV135)
- spec/plan `docs/superpowers/{specs,plans}/2026-05-26-patient-link-hide-empty-boxes-auto-cleanup*`
- Wiki (eaa5204f): `wiki/sources/patient-link-hide-empty-cleanup-design.md` + `wiki/entities/{customer-link-payload-core,patient-link-cleanup-cron}.md` + `wiki/concepts/patient-link-lifecycle.md` + index/log

## Decisions (1-line each)
- Q1=A — hide empty boxes in customer-mode ONLY (admin/sync view keeps them as feedback).
- Q2=B — subtle line "ยังไม่มีนัดหมายหรือคอร์สในขณะนี้" when nothing at all (not bare).
- Q3=A — empty-since state machine: stamp first-empty → delete after 30d → clear on data-return.
- Q4=A — delete = clear token (true delete); staff regenerate; customer sees existing "ไม่พบข้อมูล".
- Expired courses ≠ "คอร์สคงเหลือ" → do NOT block deletion (flagged in spec; reverse = require expired.length===0).
- AV135 — single-source isEmpty (endpoint + cron) · clear-token (never deleteDoc customer) · customer-mode-only hide.
- Inline execution (subagents thrash this baseline, per V81/Tablet-Chart).

## Next Todo
- USER: "deploy" → `vercel --prod` (frontend + cron registers from vercel.json; no rules change).
- USER L1 post-deploy: screenshot link `?patient=3cc66f7e…` → no empty box, appt only; all-empty customer → subtle line.
- Cron `--apply` runs daily once deployed (currently 0 would-delete, safe).
- (Optional, separate maintenance) the global.fetch-leak load-flakes (phase15.5b / subtab-perf / customer-link) — AV41 afterAll-restore sweep, documented in Phase 17.1 V-entry.

## Resume Prompt
See SESSION_HANDOFF.md Current State (EOD+5) + this checkpoint. master=eaa5204f, prod=459a4ea3 LIVE. Next = USER deploy + visual L1. No deploy without "deploy" THIS turn (V18).
