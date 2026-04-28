---
updated_at: "2026-04-28 EOD (session 27) — V35.3-ter + V33-customer-id + UX polish bundle; awaiting V15 #7 deploy auth"
status: "Production = c36888e LIVE (V15 #4). Master = eae90c9 with 12 commits unpushed-to-prod."
current_focus: "Awaiting user 'deploy' auth for V15 #7 combined deploy"
branch: "master"
last_commit: "eae90c9"
tests: 2927
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c36888e"
firestore_rules_version: 20
storage_rules_version: 2
---

# Active Context

## State
- master = `eae90c9` · production = `c36888e` (V15 #4 LIVE) · 12 commits unpushed-to-prod
- **2927/2927** focused vitest pass · build clean · working tree clean
- Session arc: course skip-stock flag → V35.3 stock multi-reader-sweep × 3 → SaleTab buy modal → branch-aware PDF → UI polish → V33-customer-id-resolution

## What this session shipped (2026-04-28 — session 27)
12 commits (`2149eae` → `eae90c9`) — see [`.agents/sessions/2026-04-28-session27-eod-bundle.md`](.agents/sessions/2026-04-28-session27-eod-bundle.md)
- Course-row "ไม่ตัดสต็อค" flag + auto-init + treatment-context silent-skip (V15 #5/#6)
- V35.3 + bis + ter — `_deductOneItem` includeLegacyMain + drop branchId in batchFifoAllocate + sale-context parity (3 same-day iterations)
- TFP grouping ("ข้อมูลการใช้คอร์ส") + BCC addon-key discriminator
- SaleTab buy-modal field-name fix (be_courses/be_products → master shape)
- Receipt heading rename + clinic header polish + badge alignment
- Branch-aware PDFs (useEffectiveClinicSettings hook) + concat clinicName "Lover Clinic นครราชสีมา" + remove En subtitle
- SaleTab redesign: รายการขาย column with category-color dots + amount+badge inline + "จาก OPD Card" label
- V33-customer-id-resolution (5th V12 occurrence) — BackendDashboard + CustomerDetailView + AppointmentFormModal assistants filter

## Next action
**Awaiting user "deploy" authorization** for V15 #7 combined deploy. 12 commits will ship.

## Outstanding user-triggered actions
- V15 #7 deploy auth (per V18, doesn't roll over)
- Live QA after deploy: V33 customer treatment-save · sale-side stock deduct · branch-aware receipt header · assistants picker · "จาก OPD Card" label · รายการขาย column visual
- Carry-over: LineSettings creds · customer ID backfill · TEST-/E2E- prefix discipline
