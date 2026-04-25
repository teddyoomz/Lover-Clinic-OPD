---
updated_at: "2026-04-25 (mid-session — Phase 14.2.E ProClinic side-by-side Doc 1-9/16 done)"
status: "Phase 14.2 ProClinic doc replication: Docs 1-9/16 done with full Chrome MCP DOM extraction + F12-F16 test banks (256 phase14 tests, 4254 full suite). Theme: black+red applied + locked by F16 invariants. Docs 10-12/16 are our own designs (no ProClinic equivalent). Docs 13-15/16 deferred (chart/consent/treatment graphical → Phase 16)."
current_focus: "Per-doc verification complete for the 9 ProClinic-equivalent docs. Remaining 4 (sale-cancelation Doc 16 + treatment-referral Doc 10 + course-deduction Doc 11 + medicine-label Doc 12) are our own designs — already match clinical conventions, locked by F12 mustContain assertions."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "aed5f0b"
tests: "256/256 phase14-flow-simulate (F1-F16 all green) | 4254/4254 full suite"
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "ec567fd (2026-04-25 early-session) — 7 commits ahead pending user 'deploy' authorization"
firestore_rules_deployed: "v3 schema. v9 needs deploy + new be_vendors / be_vendor_sales rules need P-D-P probe-deploy-probe (4 endpoints)"
---

# Active Context

## Objective

Replicate ALL 16 ProClinic doc templates (8 medical certs + medicine-label +
4 system templates + patient-referral + 3 treatment-record types) with
**100% pixel-close fidelity** per user directive: "ทำ templates เอกสารต่างๆ
ให้เหมือนกัน proclinic เป๊ะๆเลย ... หน้ากระดาษการพิมพ์ทุกแบบของเราต้องเหมือน
เค้า 100%". Each doc must auto-fill from real `be_treatments`/`be_customers`
schema. Cert numbers must auto-increment via runTransaction. Doc dropdowns
must appear per-treatment-row in CustomerDetailView (mirrors ProClinic).

## Current State (commits this session)

- `e6ff4e6` — Phase 12.3 Sale Insurance Claim UI + SaleReport wiring
- `ec567fd` — Phase 14.1 Document Templates System (13 seeds + CRUD + print)
- `e2528b1` — V14 normalizer fix (undefined → setDoc reject) + V15 combined-deploy rule
- `0398171` — Phase 14.2 toggles + bilingual + 13 ProClinic-fidelity rewrites
- `bcf6e3b` — Phase 14.2.B per-treatment dual dropdowns + auto cert# + 3 new docTypes
- `df556f6` — Phase 14.2.C Medical History 100% replication + raw-HTML `{{{key}}}` placeholder + schema mapping fix
- `cb2bdb6` — F12 per-doc test bank (32 tests, 3 caught failures)

## What's working ✅

- **Doc 1/16 — Medical History (treatment-history A4)**: VERIFIED 100% match
  via preview_eval. All sections render: clinic letterhead → Date+Physician
  → Customer info → Emergency contact → Vital signs → Symptoms → Physical
  Examination → Diagnosis (full ICD codes) → Treatment → Treatment Plan →
  Additional note → Treatment record TABLE (Allergan 100 U | 100 U | 0 U)
  → Home medication TABLE (Acetin | 1 amp.) → Physician signature.
  Doctor name de-duplication regex working. Vitals schema mapped (sys/dia
  BP, pulseRate, etc.). Raw-HTML rows use `{{{key}}}` placeholder.
- Auto cert# generator via runTransaction (clinic_settings/cert_counters)
- Per-treatment dual dropdowns ("พิมพ์ใบรับรองแพทย์ ▾" + "พิมพ์การรักษา ▾")
- Schema upgrade mechanism (v1→v2→v3→v4→v5) running automatically
- Chrome MCP browser tools loaded + connected (Browser 1, Windows)

## Failing F12 tests (3) — IMMEDIATE next-action

```
F12.full:chart    — likely raw-HTML placeholder issue
F12.full:consent  — likely raw-HTML placeholder issue
F12.full:<one-more> — see test output
```

These are EXACTLY the verification mechanism user requested: "เขียนเทสขึ้น
มาแล้วทดสอบเองเลย กับทุกหน้านะ". Each failure = doc template that doesn't
fully render with realistic context. Fix → mark Doc N done → next.

## Per-doc verification methodology (per user directive)

1. Pull ProClinic DOM via Chrome MCP `javascript_tool` on
   `https://trial.proclinicth.com/admin/<route>` (Browser 1 already
   connected, deviceId `8bdc85cc-b6e5-47d9-b3cd-56957264819d`)
2. Compare to our SEED_TEMPLATE
3. Update template HTML + CustomerDetailView prefill mapping
4. Bump SCHEMA_VERSION (currently 5, bump to 6 on next batch)
5. Run `npm test -- --run tests/phase14-documents-flow-simulate.test.js`
   — F12.full:<docType> + F12.empty:<docType> must pass
6. preview_eval verify in browser (open template, check all sections)
7. Mark doc done in active.md, move to next

## Doc verification queue (16 total)

- [x] **Doc 1/16** — treatment-history (Medical History A4) ✅ DONE df556f6
- [x] **Doc 2/16** — medical-certificate (5 โรค) ✅ b186971 — vitals+body+4-disease+summary all replicated from ProClinic .print-area
- [x] **Doc 3/16** — medical-certificate-for-driver-license ✅ aed5f0b — same as Doc 2 + 3 footnotes + แพทยสภา 2/2564 stamp
- [x] **Doc 4/16** — medical-opinion (ลาป่วย) ✅ aed5f0b — 3-section + 3 conclusion checkboxes
- [x] **Doc 5/16** — physical-therapy-certificate ✅ aed5f0b — same shape as Doc 4 with PT-specific labels (กภ., นักกายภาพบำบัด)
- [x] **Doc 6/16** — thai-traditional-medicine-cert ✅ aed5f0b — already matched, polished theme
- [x] **Doc 7/16** — chinese-traditional-medicine-cert ✅ aed5f0b — switched to ProClinic single-freeform format
- [x] **Doc 8/16** — fit-to-fly ✅ aed5f0b — full rewrite: Medical Cert for Air Travel + 3 Yes/No history + 2 signatures
- [x] **Doc 9/16** — patient-referral ✅ aed5f0b — 7-section clinical history + 4 referral checkboxes (จาก/ถึง split)
- [ ] **Doc 10/16** — treatment-referral A5 — our own design (no ProClinic equivalent), already ProClinic-style
- [ ] **Doc 11/16** — course-deduction — our own design (no ProClinic equivalent), already ProClinic-style
- [ ] **Doc 12/16** — medicine-label — our own design (label printer 57x32mm), red theme applied
- [ ] **Doc 13/16** — chart — DEFER to Phase 16 (graphical face/body chart drawing, not template)
- [ ] **Doc 14/16** — consent — done in commit 5846e05
- [ ] **Doc 15/16** — treatment template — DEFER to Phase 16 (graphical/dental chart)
- [ ] **Doc 16/16** — sale-cancelation — done in earlier commits (ProClinic /admin/document/sale-cancelation is editor not template — using our default)

DEFER for graphical docs (chart drawings, dental charts, PDF library):
canvas drawing tool + PDF storage are entirely new feature surfaces beyond
template seeds. Plan as Phase 16 polish.

## Phase 14.3 G6 vendor-sale (separate work-in-progress)

- ✅ src/lib/vendorValidation.js (committed bcf6e3b)
- ✅ src/lib/vendorSaleValidation.js (committed bcf6e3b)
- ✅ src/components/backend/VendorSalesTab.jsx (committed bcf6e3b)
- ✅ backendClient.js CRUD helpers (committed bcf6e3b)
- ✅ firestore.rules be_vendors + be_vendor_sales (committed cb2bdb6)
- ⏳ Nav entry already added but BackendDashboard.jsx may not route yet
- ⏳ Need preview_eval verification + tests
- ⏳ Need firestore.rules deploy via Probe-Deploy-Probe
- ⏳ Awaits Doc 2-16 first

## Phase 14 G5 customer-product-change — NOT STARTED

Big feature (course exchange + refund). Defer until G6 ships + ProClinic
docs all green.

## Outstanding user actions (NOT auto-run)

1. Deploy `cb2bdb6` to prod via `vercel --prod` (current prod still on
   `ec567fd` — missing all Phase 14.2.B/C work + Doc 1 fix)
2. Deploy firestore.rules (be_vendors + be_vendor_sales rules added) via
   `firebase deploy --only firestore:rules` with full Probe-Deploy-Probe
   per Rule B iron-clad (4 endpoints curl-probe pre + post)

Next session continues with: fix the 3 failing F12 tests + verify each
remaining doc via Chrome MCP DOM + preview_eval, ONE doc at a time per
user directive "ทำแบบนี้ทีละหน้าจนครบ".
