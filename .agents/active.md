---
updated_at: "2026-04-29 EOD (session 32) — Phase 16.2 LIVE-data-fix"
status: "Production = f4e6127 (V15 #9 LIVE). master = fdf3d41, 4 commits unpushed-to-prod."
current_focus: "Phase 16.2 Clinic Report functional with real data. 2 user-requested follow-ups queued: DF report wiring + clinic-report inline explanations."
branch: "master"
last_commit: "fdf3d41"
tests: 3894
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "f4e6127"
firestore_rules_version: 21
storage_rules_version: 2
---

# Active Context

## State
- master = `fdf3d41` · production = `f4e6127` (V15 #9 LIVE) · **4 commits unpushed-to-prod** (`ced094d` 16.3-bis + `0aa8cb6` 16.2 ship + `9642bda` black-screen + `fdf3d41` real-schema)
- **3894/3894** tests pass · build clean · firestore.rules version 21
- Phase 16.2 Clinic Report renders with real data: revenue ฿2.26M, avg ticket ฿39.5k, course util 23.46%, top services deduped, top products from real sales

## What session 32 shipped (2026-04-29 EOD)
2 user-reported bug fixes after Phase 16.2 ship — see `.agents/sessions/2026-04-29-session32-phase16-2-fixes.md`.

- `9642bda` black-screen fix — V11 mock-shadowed `canAccessTab` (real export is `canAccess`) + Rules of Hooks violation (early-return before useState)
- `fdf3d41` real-schema field mapping — 5 distinct mismatches: `s.total → s.billing.netTotal` · `e.expenseDate → e.date` · `course.qty` is parsed STRING not numeric · topServices dedup by courseName · topProducts from `sales.items.products[]` (not stockReport inventory) · topDoctors via `staffSales.doctorRows` (not `.rows`)
- Tests +31 new (P4.8 / P5.1-8 / P6.1-5 / P7.1-7 / P8.1-3 / A4.1-A4.6 + A4.3b)
- Browser verified live: shell + 6 tiles + 3 charts + 2 tables now populated; 6 remaining 0/empty cells are legitimate "future-tracking" per user directive

## Next action
**Phase 16.2 functional.** 2 new user-requested follow-ups (queued for session 33):
1. **DF report wiring (รายงานจ่าย DF / ค่ามือแพทย์)** — currently empty. User notes แพทย์ & ผู้ช่วย page DOES record doctor-vs-assistant; data is there. Reference: ProClinic's รายจ่าย page. Replicate using OUR `be_*` data. Multi-branch aware.
2. **Clinic-report inline UI explanations** — add description/tooltip per tile + chart on `tab=clinic-report` (each metric needs context for non-experts). Then trace back through entire wiring/logic flow per-metric to verify correctness. Multi-branch aware.

## Outstanding user-triggered actions
- V15 #10 deploy auth — 4 commits unpushed (per V18, deploy auth doesn't roll forward; needs explicit "deploy" THIS turn)
- Phase 16.5 RemainingCourse + 16.1 SmartAudience still pending per master Phase 16 plan
- 16.4 Order tab parity audit deferred (intel captured at `docs/proclinic-scan/admin-order-*.json`)
- Pre-launch H-bis cleanup LOCKED OFF (memory)
