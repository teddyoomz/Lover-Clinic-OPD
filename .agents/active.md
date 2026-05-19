---
updated_at: "2026-05-19 — V96 LIVE: TFP create-mode + deleteField() fix deployed + 54/54 comprehensive e2e GREEN"
status: "🚀 V96 LIVE. master = prod = `2c1b1d44` (or similar — V96 commit). Combined deploy complete (Vercel + Firebase rules/storage). Pre+post probes 4/4 IDENTICAL."
branch: "master"
last_commit: "fix(V96): TFP create-mode + deleteField() Firestore API misuse — 3 bugs, 1 root cause"
tests: "V93 35 + V94 41 + V95 21 + V96 15 = 112 audit batch GREEN · V8x 158/158 GREEN · V96 e2e 54/54 GREEN on real prod (CORE TFP wiring verified: course/stock/sale/deposit/wallet/points/DF + concurrent + adversarial)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "V96 LIVE — lover-clinic-5873tvvvf-... aliased 2026-05-19"
firestore_rules_version: "unchanged (idempotent — V82-Phone baseline; V96 fix has zero rule changes)"
storage_rules_version: "unchanged"
---

# Active Context

## 🚀 V96 LIVE — TFP CORE save chain fixed + verified

User reported 2026-05-19 (screenshot of error banner):
> "Function setDoc() called with invalid data. deleteField() cannot be used with set() unless you pass {merge:true} (found in field status in document be_treatments/BT-1779181253570)"

Plus: "ตอนนี้เมื่อซื้อคอร์สใน TFP แล้ว มันไม่ไปสร้างรายการขายโดยอัตโนมัติ ให้แก้ให้เหมือนเดิมด้วย" + "ฝากเช็คให้แน่ใจด้วยว่าการใช้คอร์สใน TFP แล้วมันตัดคอร์สคงเหลือของลูกค้าคนนั้นจริงๆ" + "มันต้องตัดมัดจำด้วยนะ และอื่นๆๆ"

## Root cause = 1, symptoms = 3

TFP `v26StatusPatch` set `status: deleteField()` for staff/admin save in ALL modes. CREATE mode passes payload to `createBackendTreatment.setDoc()` (no `{merge:true}`) → Firestore client SDK throws → upstream throw blocks **everything**:
- ❌ Bug A: auto-sale chain (line 2567) skipped
- ❌ Bug B: visible database error
- ❌ Bug C: course deduction (line 2484) skipped

Phase 27.2-bis (2026-05-14) removed save-button gates → exposed the latent deleteField() bug.

## V96 FIX (2 layers, defense-in-depth)

1. **TFP source** (`TreatmentFormPage.jsx:2451-2462`) — gate `status: deleteField()` on `isEdit` only. CREATE mode omits the field entirely.
2. **backendClient defense-in-depth** (`backendClient.js:1025-1033`) — `createBackendTreatment.setDoc(..., { merge: true })`.

**AV86** invariant added — Firestore sentinel `deleteField()` requires `updateDoc()` OR `setDoc({merge:true})`. Closed sanctioned exception list: 1 (TFP isEdit-gated).

## V96 verification (per Rule Q V66 + user "ขอแบบเข้มข้นมากๆ")

### Tier 2 source-grep + flow
- `tests/v96-tfp-create-treatment-deletefield-fix.test.js` 15 assertions in 6 groups (A-F): TFP isEdit gate + backendClient merge:true + updateBackendTreatment intact + post-fix shape simulation + AV86 SKILL.md presence + cross-file deleteField count = 1

### Tier 3 REAL-PROD admin-SDK e2e (NEW)
- `scripts/e2e-v96-tfp-full-save-chain.mjs` 54/54 PASS on real prod (TEST-V96-* fixtures, 0 orphan post-cleanup, audit doc emitted)
- 7 stages covered:
  - **A. Setup**: branch + product + stock batch + course master + customer + 2 deposits
  - **B. Buy course**: customer.courses[] assignment + expiry = thaiDateNDaysFromNow(30) Bangkok-anchored
  - **C. handleSubmit chain** (26 assertions): treatment doc + DF entries + course-deduct (5→4) + course-change audit + stock-deduct + movement type 6 + auto-sale create + movement type 2 + 2× applyDepositToSale (500→350 + 300→250) + treatment↔sale bidirectional links
  - **D. Conservation** (14 invariants): customer.courses delta + stock total/remaining + sale↔treatment backlinks + movement count + deposits applied + DF preserved + course-change audit
  - **E. Stress**: 3× concurrent customer-treatment writes
  - **F. Adversarial**: empty courses + NaN qty + missing status (V96 CREATE-mode shape)
  - **G. Cleanup**: 21 fixtures deleted + 0 orphans verified

## Deploy

- **Vercel** `lover-clinic-5873tvvvf-teddyoomz-4523s-projects.vercel.app` → aliased `https://lover-clinic-app.vercel.app` HTTP 200 ✓
- **Firebase** `firebase deploy --only firestore:rules,storage` ✓ (idempotent — V96 has zero rule changes)
- **Probe-Deploy-Probe** 4/4 IDENTICAL pre+post (chat_conv 200 / be_line_reminder_log 403 / be_fb_configs 403 / be_staff_chat_messages 403)
- **Build clean** 3.26s (BackendDashboard 952 KB unchanged)

## Stack live

V84+V85+AV82+V86 v1+V86-followup-2+V87+V88+V89+V90+V91+V92 + V93/V94/V95 audit batch + **V96 (TFP create-mode fix)**

## Next action

**Idle until user direction.** Rule Q L1 user hands-on can confirm in browser:
- นางวันเพ็ญเดือนสิบสอง TFP save with purchased course → no error + sale auto-created + course remaining deducted in CDV

## Outstanding (user-triggered)

- **Neuramis-ครั้ง cleanup** (separate Rule M data op from earlier session):
  - Delete from นางวันเพ็ญ's customer.courses[] (Neuramis with unit "ครั้ง")
  - Delete from นครราชสีมา's stock (Neuramis-ครั้ง batches)
  - Audit other filler products with unit="ครั้ง" → convert to "CC"
- Rule Q L1 multi-device hands-on across V96 surface (TFP save → CDV update)
- 17× backend-menu-d V90 test-debt (pre-existing)
- v81 emulator Java-gated skip (intentional)
