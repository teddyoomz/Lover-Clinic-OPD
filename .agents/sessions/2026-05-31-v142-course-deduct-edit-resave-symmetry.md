# 2026-05-31 EOD+4 — V142: course-deduct edit-resave SYMMETRY (reverse-without-rededuct)

## Summary
`/systematic-debugging`. User bug (real prod, screenshots): "ซื้อแล้วตัดคอร์สเลย แล้วคอร์สมันไม่ตัดออกจากตัว" + fury that prior tests "passed" while this slipped (V104 was simulate-verified only → the V66/Rule-Q-honest trap). DONE + verified by **REAL-PROD L2 (bug reproduced + fix verified with the SHIPPED functions)**. **UNCOMMITTED/HELD** (stacks on the held V140+V141). prod unchanged = `3342a9f0`.

## Root cause (Phase 1+2 — confirmed from real prod data, not deduced)
- Diag `scripts/diag-course-not-deducted-bt.mjs` + `diag-cc-by-customer.mjs` on customer **LC-26000115** / treatment **BT-1780203508072**:
  - `be_course_changes`: 3× `kind=use`, `qtyBefore "1/1"` → **`qtyAfter "0/1"`** (deduct DID run) — keyed on `linkedTreatmentId` (my first query used the wrong field, hence the apparent "0").
  - `customer.courses[]`: 3 entries all **"1 / 1 ครั้ง" (FULL)** — reverted. `detail.courseItems = []`; `treatmentItems = 3` w/ `productId=undefined`; `updatedAt=06:09` (a 2nd save after the 06:07 deduct).
- **Mechanism — edit-resave reverse/re-deduct ASYMMETRY**: on EDIT, `handleSubmit` reverses prior deductions (`oldPurchased` from `existingCourseItems`, via `reverseCourseDeduction` — refunds reliably by name+product+courseIndex, writes NO audit) then re-deducts the fresh serialization (`backendDetail.courseItems`). The fresh list comes up **EMPTY** for purchased courses because: (a) in-session `purchased-…` rowIds regenerate to deterministic `be-row-N` (`mapRawCoursesToForm:429`) → Pass-1 by-rowId miss; (b) edit-load `courseItems→treatmentItems` restore (TFP ~1158) drops `productId` → V101 Pass-2 by-productId can't run; (c) rem=0 → Pass-2 `rem>0` gate skips. **Refund-without-rededuct → balance reverts to full.** Same V12/V104 family at the EDIT-REVERSE boundary V104 never covered.
- **Stock parallel: NOT affected** — its reverse+rededuct is gated by `hasStockChange` (shape-equal → skip) + falls back to `_resolveProductIdByName`. The course path had no such gate.

## Fix
- NEW pure helper `buildReDeductListWithCarryForward(fresh, oldReversed, selectedRowIds)` in `src/lib/treatmentBuyHelpers.js` — re-deduct list = `fresh ∪ carry-forward(oldReversed still-selected, not covered by fresh)`. Reverse + re-deduct now symmetric; un-checked rows drop (correct un-deduct); no double-deduct (covered entries excluded).
- TFP `handleSubmit` wires it at both sites, gated `isEdit ? helper(...) : freshExisting/freshPurchased` (create-mode unchanged): `existingDeductions` (~2592) + `purchasedDeductions` (~3262); `existingDeductions`/`purchasedDeductions` renamed source to `freshExisting`/`freshPurchased`.
- **AV163** invariant (audit-anti-vibe-code).
- Did NOT touch edit-load 1158 productId-strip (riskier; carry-forward fully+provably fixes course; stock gated) — noted as tech-debt.

## Verification (Rule Q)
- **TRUE-L2 real-prod e2e `scripts/e2e-v142-edit-resave-course-deduct.mjs` 10/0** — calls SHIPPED `assignCourseToCustomer`/`deductCourseItems`/`reverseCourseDeduction` + the SHIPPED helper on real Firestore (TEST fixtures, zero-orphan): **O.2 ★BUG REPRODUCED★** (pre-V142 reverse+deduct([]) → rem 1,1,1) + **N.3 ★FIX VERIFIED★** (V142 carry-forward → rem 0,0,0) + N.4 multi-edit no drift + U.2 un-check un-deducts + A.1 audit emitted.
- `tests/v142-course-deduct-edit-resave-symmetry.test.js` **20/0** — pure helper (incl. THE BUG A2, covered-dedup A3/A4, un-check A5, adversarial A7) + Rule I full-flow simulate using REAL `courseUtils` arithmetic (C1 OLD-reverts/NEW-holds, C2 buy-no-deduct, C3 create-then-edit, C4 multi-edit, C5 un-check, C6 reordered-existing) + D1/D2 rowId-regen premise + B1-B5 source-grep.
- Targeted regression **543/0** (v104, course-skip, v36, octies, v42-48, v136, phase16.5/16.7, phase-26-0, v96, v103). **Full vitest 15336→15356/0.** Build clean.
- **Heal dry-run** (`scripts/heal-course-reverted-by-edit-resave.mjs`, READ-ONLY): 35 customers scanned, 5 candidates → **3 healable = LC-26000115** (the reported one; `1/1→0/1` ×3) + **2 ambiguous = LC-26000009** (Shock-Wave promo bought ×N, same name+product key → manual review, NOT auto-healed) + 0 legit-refund false-positives.

## Honest gap (Rule Q)
Helper + the assign/deduct/reverse MUTATION sequence proven on real prod with the SHIPPED functions; the carry-forward list is the SHIPPED helper's output. The injected `freshPurchased=[]` is the documented real-data fact (live doc `courseItems=[]`). The **assembled real-browser** flow (buy course in TFP → use → save → re-open → save again → balance stays 0) on the auth-gated AdminDashboard = **USER L1** (harness can't drive the auth-gated multi-save UI).

## Files (all UNCOMMITTED/HELD)
- `src/lib/treatmentBuyHelpers.js` (NEW helper) · `src/components/TreatmentFormPage.jsx` (import + 2 sites)
- `tests/v142-course-deduct-edit-resave-symmetry.test.js` (NEW)
- `scripts/e2e-v142-edit-resave-course-deduct.mjs` (NEW, TRUE-L2) · `scripts/diag-course-not-deducted-bt.mjs` · `scripts/diag-cc-by-customer.mjs` (NEW, Rule R) · `scripts/heal-course-reverted-by-edit-resave.mjs` (NEW, Rule M)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV163)

## Next (user-triggered — all gated)
1. Commit + push (V140 + V141 + V142 held together — ask user if they want them split).
2. `vercel --prod` (frontend/lib only → no Probe-Deploy-Probe; V18 needs "deploy").
3. Heal `--apply` (Rule M — restores LC-26000115 3 courses to 0/1; review LC-26000009 manually). NOTE: heal makes sense AFTER deploy so the fix prevents re-occurrence; pre-deploy heal would be re-reverted on the next buggy save.
4. L1 hands-on: buy course in TFP → use → save → re-open → save again → course stays deducted.

## V142-bis (same session) — single-save create buy→deduct→charge→meds (user follow-up)
User: "ทดสอบแบบซื้อคอร์สใน TFP ที่เพิ่งสร้างแล้วตัดคอร์สเลย คิดเงิน เอายากลับบ้าน ภายในการกดบันทึกครั้งเดียว … ดูจำนวนที่เหลือของทุกอย่าง". The create-mode (single-save) path is distinct from the edit-resave I fixed. To test the REAL serialization (not a mock — user is skeptical post-V104), I **extracted the V101 two-pass courseItems IIFE VERBATIM** from TFP `handleSubmit` → `buildCourseItemsForSave(selectedCourseItems, customerCourses, treatmentItems)` (treatmentBuyHelpers.js); TFP now calls it (behavior-identical). 1 V21 fixup (v104 SG3 → assert the call-site + helper, not the inline IIFE).
- **Empirical**: real-prod BT-1780203508072 shows the CREATE save DID deduct ("0/1"); the revert was the 2nd/edit save (= V142).
- **`tests/v142-bis-create-buy-deduct-serialization.test.js` 8/0** — B1 ★ buy+use in one save → deduct list NON-empty (the user's worry disproven at the serialization layer) + B2 (3 courses) + B3 (Pass-2 productId) + B4 (edit-reload empty = V142 premise) + B5 adversarial + SG source-grep.
- **TRUE-L2 `scripts/e2e-v142bis-single-save-buy-deduct-charge-meds.mjs` 7/0** on real prod — drives createBackendSale + deductStockForSale + assignCourseToCustomer + the REAL buildCourseItemsForSave + deductCourseItems. Output: **คอร์ส Testoviron 1/1→0/1 (ตัดจริง) · Talafil สต็อก 10→9 · ใบขาย 2,140 · audit kind=use 1**. Zero-orphan.
- Behavior-preserving (deployed 8c3a9047 has the inline IIFE = the extracted helper logically) → NOT urgent to re-deploy; committed for testability + master-current.

## V142-quater (same session) — doctor→finalize course OVER-CREDIT (NEW BUG FOUND + FIXED)
User asked to test a DISTINCT multi-stage flow: admin vitals-save → doctor-save → admin finalize that deducts a course (existing OR buy-then-deduct). I had NOT tested it. `/systematic-debugging` Phase 1 (code read) spotted + Phase 3 (e2e `scripts/e2e-v142ter-doctor-finalize-course-deduct.mjs`) CONFIRMED a real **OVER-CREDIT** bug:
- A doctor/vitals save PERSISTS courseItems (V101 serialization runs) but SKIPS the deduct (gate). When the admin finalizes a treatment whose LAST save was doctor/vitals, `reverseCourseDeduction(oldExisting)` refunds a deduction that NEVER happened → finalize re-deducts → NET balance does NOT drop. PHASE C: course 4/5 → **4/5** (should be 3/5).
- Live since doctor-save flow (Phase 26.0b, 2026-05-13).
- **Fix (V142-quater)**: gate the reverse on `priorSaveDeducted = loadedTreatmentStatus !== 'doctor-recorded' && loadedTreatmentStatus !== 'vitalsigns-recorded'`. A completed treatment has status cleared (deleteField → undefined) → reverse RUNS (V142 preserved). The doctor-save UI is gated on status==='doctor-recorded', so finalize→doctor→finalize (the only case where skipping would be wrong) cannot occur. **AV164**.
- **Verified**: `scripts/e2e-v142ter-*` **7/0** real prod (A typical 5/5→4/5+stock · B buy 0/1 · C over-credit FIXED 4/5→3/5 · D V142 preserved 0/1) + `tests/v142-quater-*` 8/0 (incl. B2 pre-fix repro = over-credit proven + B5 V142 preserved + SG source-grep). 1 V21 fixup (v136 L2 reverse-gate source-grep). Build clean.
- **Historical heal**: `scripts/diag-course-over-credit.mjs` (READ-ONLY) — flagged candidates are DOMINATED by duplicate-course (Shock Wave promo) name+product double-counting + already-handled V142 cases; NO clean over-credit victim (balance genuinely too-high, expected≥0) confirmable. Over-credit favors the customer (free use) → revenue-review, not data-corruption. NOT auto-healed.

## Resume Prompt
Resume LoverClinic — V142 (course-deduct edit-resave symmetry) DONE+verified (real-prod L2 10/0 + unit 20/0 + full vitest 15356/0), UNCOMMITTED/HELD on top of V140+V141. prod=3342a9f0. When authorized: commit V140+V141+V142 → vercel --prod → heal `--apply` (LC-26000115). No commit/deploy/heal without explicit word THIS turn (V18 + Rule M).
