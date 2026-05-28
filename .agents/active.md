---
updated_at: "2026-05-28 EOD+4 — 4-feature batch (V128 + V129) DONE + verified, UNCOMMITTED + held (no deploy)."
status: "WORKING TREE held — 17 modified + 7 new files (feature code NOT committed). Docs committed this EOD. Awaiting user commit+deploy word."
branch: "master"
last_commit: "EOD+4 docs commit (this). Code HEAD still 10e28ed4 (V127 docs). Feature batch = uncommitted working tree."
tests: "NO full re-run at session-end (per rule). Last FULL suite 15039/0 (pre-lightbox+reports-sale). Targeted since, all GREEN: lightbox-family 104/0 · v128 7/0 · v129 12/0. build clean. Full re-run pending at deploy."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "26fb5789 (V127) LIVE — none of this session's 4 features deployed yet."
firestore_rules_version: "UNCHANGED — all 4 fixes are frontend/lib only (no rules/storage/data/cron → no Probe-Deploy-Probe)."
---

# Active Context — 4-feature batch (V128 + V129) — UNCOMMITTED + HELD (2026-05-28 EOD+4)

## State
- **Feature code UNCOMMITTED** in working tree (17 M + 7 ??). Held per user "ยัง deploy ไม่ได้ มีงานถัดไป". Only agent-docs committed this EOD.
- 4 fixes, each per-feature-verified (Rule Q L1/L2). Full vitest re-run + commit + deploy = ONE batch when user says.
- All frontend/lib only → no Probe-Deploy-Probe; combined `vercel --prod` covers all 4.

## What this session shipped (all uncommitted — see checkpoint)
- **V128 appt phone** — hover-peek + detail-modal show the LINKED customer's phone. Write-chokepoint (`_resolveAppointmentCustomerPhone`, backendClient create+update) + render live-resolve (`useResolvedApptPhone` hook + `apptPhoneValue||resolvedPhone`). L2 real-prod: 78 linked + 45 temp = 0 blank. AV145.
- **V128 calendar auto-height** — `AppointmentCalendarView` fixed `SLOT_H=22` → dynamic `slotH` (computeApptSlotHeight, fills viewport, clamp 22–46). Grid fills any desktop. AV in v128 test.
- **V128.lb staff-chat lightbox** — full-screen (`width/height:100%` of `w-full h-full` wrapper, object-contain UPSCALES small imgs; was max-w-4xl 896px) + zoom + **drag-to-pan** (clamped) + wheel-zoom. Real-browser (Chrome MCP) verified: fill + zoom + pan. AV146.
- **V129 reports-sale** — `tab=reports-sale` พนักงานขาย + ผู้ทำรายการ resolve via `resolveSellerName(listAllSellers)` (aggregator + SaleReportTab + SaleDetailModal). L2 real-prod: `-` count 38→0. createdBy never written → ผู้ทำรายการ = resolved first seller. AV147.
- Diag/verify scripts kept (Rule R): diag-appt-phone, verify-v128-appt-phone, diag-sale-report-seller-creator, verify-v129-…
- Detail: `.agents/sessions/2026-05-28-v128-v129-batch.md`.

## Next action
Idle / await user. When user says "commit"/"deploy": run FULL `npm test -- --run` → commit feature batch → `vercel --prod` (frontend-only, no Probe-Deploy-Probe).

## Outstanding user-triggered actions
- **Commit + deploy the 4-feature batch** (held; full suite first).
- L1 hands-on on real admin (auth-gated): appt hover-peek phone · calendar fill on 2K · staff-chat lightbox · reports-sale columns.
- (optional) V129: capture a TRUE `createdBy` at sale-write time if ผู้ทำรายการ should differ from the seller.
