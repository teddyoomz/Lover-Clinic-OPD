---
updated_at: "2026-05-31 EOD+5 — Implemented plan (①reorder+green card, ②course-step muted, ③CDV course step) + /systematic-debugging (confirm-btn-follows-status + confirmed sky→green). Pushed, NOT deployed."
status: "13 commits ahead of prod, pushed to origin/master. NOT deployed (await 'deploy'). Frontend/lib only → no Probe-Deploy-Probe."
branch: "master"
last_commit: "15cde92e (confirmed color sky→green). prod = 0c607f68 LIVE."
tests: "15440/0 full suite (ran this session after debug fixes; NOT re-run at session-end per rule)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0c607f68 LIVE (V142 course double-deduct + V143 stock). UNCHANGED this session."
firestore_rules_version: "UNCHANGED. No rules/storage/index/cron touched."
---

# Active Context — confirmed-card + course-step impl + confirm-btn debug (2026-05-31 EOD+5)

## State
- Plan `2026-05-31-appt-confirmed-card-and-course-step.html` IMPLEMENTED (Tasks 1-7). Then `/systematic-debugging` on 2 user-reported issues fixed on top.
- Net: confirmed "วันนี้" card = **GREEN** (Task 3 shipped sky, debug task recolored sky→green per user) + reorder confirmed-to-top; OPD course step muted "ไม่ตัดคอร์ส"; CDV history has the 4th course step; confirm button now follows real status (reappears when pending even if a treatment record exists).
- 9 code/test commits this session, all pushed. Prod UNCHANGED.

## What this session shipped (detail → checkpoint 2026-05-31-confirmed-card-coursestep-confirmbtn.md)
- Tasks 1-3 (① reorder `sortApptsConfirmedFirst` + today-tab wire + card tint) · Task 4 (②A course warn→not-deducted, 1 SSOT) · Task 5 (③B CDV course step) · Task 6 (7 V139 V21-fixups) · diag `scripts/diag-course-deducted-check.mjs` (Rule R: 15/10 split real prod, trap-check 0)
- Debug Issue 1: `showConfirmBtn` separate status gate (mirrors mark-complete/un-mark) — V73-BS1 class; `tests/appt-confirm-button-follows-status.test.jsx` 6/0
- Debug Issue 2: confirmed sky→green at 3 sites (`_apptHubStyles` bar+chip + RowCard tint); distinct from done=emerald

## Next action
- User-gated: **deploy** (frontend/lib only, no Probe-Deploy-Probe) → then USER L1 (confirm-btn reappears on pending+treated card; green both themes; ① reorder+realtime; ② muted course; ③ CDV 4-step). OR continue.

## Outstanding user-triggered actions
- Deploy the 13-commit batch + USER L1 hands-on (above).
- Ship artifacts at deploy: V-entry + AVxx (V73-BS1 class: status-action gates must be status-driven, not hasTreatmentForDay; + course-step consumers need courseDeducted from a source with detail) + delete dev mockups `public/brainstorm-*.html`.
- (carryover) L1 V142/V143 (2-device balance + NK shows 0); cron stock-lot-cleanup active 03:45 BKK.
