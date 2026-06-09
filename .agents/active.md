---
updated_at: "2026-06-09 EOD — 4 fixes shipped (แก้คงเหลือ ลด/เพิ่ม + Issue-4 wrong-course index · treatment-count · stock customer-link · course-use editor). Committed + pushed, NOT deployed."
status: "All 4 user-reported issues fixed end-to-end + regression-tested. master 1 commit ahead of prod; awaiting explicit 'deploy' (frontend-only, vercel-only)."
branch: "master"
last_commit: "b8351546 (fix: 4 issues — course adjust/index/treatment-count/stock-link/course-use-editor)."
tests: "full vitest 16277/0 + build clean + new bank course-adjust-and-fixes-2026-06-09 22/0 (incl. real index-fix unit test) + 7 V21 fixups. (this session's runs; not re-run at EOD)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "Vercel prod = e56d2ac7 (doctor-name). NOT deployed this session — master b8351546 is 1 ahead. frontend-only, no firestore.rules → vercel-only, no Probe-Deploy-Probe."
firestore_rules_version: "UNCHANGED."
---

# Active — 2026-06-09 EOD — 4 fixes (course adjust + index + treatment-count + stock-link + editor)

## State
- master `b8351546` = 1 commit ahead of prod `e56d2ac7`. Tree clean. NOT deployed.
- #2 prod data self-healed (user re-created the treatment); heal script idempotent (0 drift).
- Real-prod L2: stock-movement customerId 43/43 sale + 152/152 treatment (C3 works for both).

## What this session shipped (checkpoint: .agents/sessions/2026-06-09-four-fixes-course-stock-treatment.md)
- **#1 แก้คงเหลือ (ลด/เพิ่ม) + Issue-4 wrong-course**: ROOT = `entry.originalIndex` was a FILTERED-array position used against full `customer.courses` (a 0/1 sub-item filtered → index shift → wrong course + "Nebido" sale). Fix: carry `rawIndex` through grouping (also fixes exchange/share, Rule P). Modal toggle เพิ่ม/ลด + preview; sale/audit from authoritative result (product+staff+bundle).
- **#2 ประวัติการรักษา count ค้าง**: BackendDashboard:497 bare `viewingCustomer.proClinicId` (undefined for LC-*) → fix `id||proClinicId`. AV189 + tests + extended PAR1.4 (V66 guard gap).
- **#3 stock movement → customer link**: useCustomerMap + MovementLogPanel sky link → `window.open('?backend=1&customer=<id>','_blank')`.
- **#4 course-use "โดย ..."**: OPD editor (editorContext.name) not doctor; CourseHistoryTab live-resolves existing from treatment.editedByName (V113).

## Next action
- IDLE / await direction. If user says "deploy" → `vercel --prod` (no rules) → then L1 hands-on.

## Outstanding user-triggered actions
- **deploy** (vercel-only) to ship the 4 fixes — then L1: open แก้คงเหลือ modal (ลด/เพิ่ม + preview), click a stock-movement customer name (→ new tab), confirm ประวัติการใช้คอร์ส shows the editor not the doctor.
- adversarial-review workflow got rate-limited this session → self-reviewed inline (full suite + prod L2 + real index-fix unit test). Optional re-run later.
