---
updated_at: "2026-05-18 EOD+3 LATE — V82-Phone tap-to-dial shipped (local)"
status: "11409/0 PASS full vitest (+40 new V82-Phone); build clean; awaiting deploy auth"
branch: "master"
last_commit: "ef4bd5c3 (Menu V2-bis); V82-Phone pending commit"
tests: "11409/11409 PASS full vitest (+40 net from 11369 Menu V2 baseline)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef4bd5c3 LIVE (Menu V2 + V82-fix7-bis + V2-bis)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- master = `ef4bd5c3` + uncommitted V82-Phone (10 files modified + 3 new) ready to commit
- 11409/0 PASS full vitest · build clean (2.82s) · NO deploy this turn (V18 lock — awaiting explicit "deploy")
- V82-Phone: every customer phone display across Frontend + Backend is now `<a href="tel:...">` tappable

## What this session shipped (post-Menu-V2)
- NEW `src/lib/phoneLink.js` — `formatPhoneForTel(value)` helper (Thai mobile/landline/intl + leading + preserved + ≥9 digits required; null for "-"/empty/short)
- NEW `src/components/PhoneLink.jsx` — wraps phone string in `<a href="tel:...">` when valid, falls back to `<span>` for "-"/empty (preserves display text exactly); aria-label "โทรหา {value}"; `e.stopPropagation()` so picker rows don't accidentally pick
- 17 customer-phone display sites migrated across 10 files: AdminDashboard.jsx (×5), PatientDashboard.jsx (×1), CustomerCard.jsx (×1), CustomerDetailView.jsx (×2 incl. emergency phone), RecallCreateModal.jsx (×2), RecallEditModal.jsx (×1), CustomerReportTab.jsx (×2 mobile+table), AppointmentCalendarView.jsx (×1 temp phone), DepositPanel.jsx (×1 temp phone), AppointmentHubRowCard.jsx (×1)
- SKIP: Print PDFs (PrintTemplates / SalePrintView / QuotationPrintView — non-interactive), vendor/branch/clinic phones (out of scope — user said customer phones)
- NEW `tests/phone-link-tappable-customer-phone.test.jsx` — 40 assertions (17 helper unit + 11 RTL + 12 source-grep regression locks at every site + 2 anti-regression for legacy bare-text patterns)
- Phase B + Phase C state cleanup (earlier this turn): dropped from active.md + checkpoint per user "ตัดทิ้ง ไม่ทำแล้ว"

## Next action
IDLE. AWAIT user authorization to deploy V82-Phone. Then user L1 mobile hands-on (tap a customer phone → dialer opens).

## Outstanding (user-triggered, not auto)
- User authorization for `vercel --prod` (V18 lock — no rules change so vercel-only acceptable)
- User L1 mobile hands-on for V82-Phone tap-to-dial (post-deploy)
- User L1 mobile re-test (pre-existing): ⋯ drawer items uncovered + light theme dock white
