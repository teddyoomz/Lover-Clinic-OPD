---
updated_at: "2026-04-28 EOD (session 26) — V35.1+V35.2 portal/cleanup/partial-commit/null-customer; awaiting V15 #5 auth"
status: "Production = c36888e LIVE (V15 #4). Master = 72bf0ca with 4 commits unpushed-to-prod."
current_focus: "Awaiting user 'deploy' auth for V15 #5 combined deploy"
branch: "master"
last_commit: "72bf0ca"
tests: 2783
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c36888e"
firestore_rules_version: 20
storage_rules_version: 2
---

# Active Context

## State
- master = `72bf0ca` · production = `c36888e` (V15 #4 LIVE) · 4 commits unpushed-to-prod
- **2783/2783** focused vitest pass · build clean · working tree clean
- 64 phantoms cleaned via direct admin SDK earlier (audited in be_admin_audit)

## What this session shipped (2026-04-28 — session 26)
4 commits ([detail](.agents/sessions/2026-04-28-session26-v35-1-v35-2-bundle.md))
- `8ad853c` V35.1+V35.2: Portal dropdowns, BatchSelectField, per-lot expansion, canonical-name display, FK gate, regex extended; +43 tests
- `513da1c` V35.2-tris+V35.1-tris+: ความจุ column = QtyBeforeMaxStock direct; flip-up dropdown when below constrained; HARD_CAP 720; scroll-into-view
- `038b3d5` V35.2-quater: removed "นำเข้าจากข้อมูลพื้นฐาน" button (state + import + 2 button sites); listStockOrders + listCentralStockOrders sort createdAt DESC primary
- `72bf0ca` V35.2-quinquies/sexies: read-side FK gate REVERTED (was hiding new imports); _assertAllProductsExist atomic pre-validation in createStockOrder + receiveCentralStockOrder; customerDoc null-guard; TreatmentFormPage null-customer early-return

## Next action
**Awaiting user "deploy" authorization** for V15 #5 combined deploy (vercel + firestore:rules + Probe-Deploy-Probe). 4 commits will ship.

## Outstanding user-triggered actions
- V15 #5 deploy auth (per V18, doesn't roll over)
- Live QA after deploy: dropdown flip-up + max size; ความจุ column shows QtyBeforeMaxStock; order partial-commit prevention; treatment null-customer error UX
- Carry-over: LineSettings creds · customer ID backfill · TEST-/E2E- prefix discipline
