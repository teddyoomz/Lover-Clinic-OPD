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

## EXHAUSTIVE TFP FLOW-MATRIX (final gate, same session) — user's last request
User: "ทดสอบมาทุก flow … ที่ TFP เราทำได้ และตรวจสอบความถูกต้องขั้นสุดมาทุกการเปลี่ยนแปลงของข้อมูล
… 100% Perfectly แล้วก็ deploy และ session end ได้เลยถ้าไม่เจอปัญหา" + "จะทำข้ามขั้นตอนไปมายังไง
ข้อมูลก็ต้องถูกต้องทุกครั้ง". = exhaustive verification of EVERY TFP permutation before deploy+end.
- **`scripts/e2e-tfp-full-flow-matrix.mjs` — 26/0 REAL prod, zero orphans.** 15 phases driving the
  SHIPPED mutation fns (deduct/reverse/assign/stock) + SHIPPED helpers through a faithful
  `applyTfpSave()` mirror of TFP.handleSubmit (TFP:2520-3270), asserting course balance + stock
  batch + audit (kind=use/qtyBefore/qtyAfter) at every change:
  - G1 create: P1 std · P2 buy-this-visit · P3 buffet(no-decrement) · P4 fill-later(→0) · P5 meds-only
  - G2 step-skip: P6 vitals→fin · P7 doctor→fin(over-credit guard) · P8 vitals→doctor→fin · P9 +edit-refinalize
    — every multistage deducts EXACTLY ONCE (the user's "ข้ามขั้นตอน" concern)
  - G3 edit-resave: P10 image-only(course holds + stock NOT reversed) · P11 un-check(refund) · P12 stock-change(reverse+re-deduct)
  - G4 adversarial: P13 dup-course preferNewest(exactly 1) · P14 3× multi-edit(no drift) · P15 shortfall(atomic throw)
- **`tests/tfp-flow-matrix-mirror-fidelity.test.js` — 7/0** — Rule Q-honest DRIFT LOCK: source-greps
  that the e2e `applyTfpSave` gates MATCH TFP's actual gates + the e2e imports the SHIPPED fns →
  "the matrix is faithful to TFP" is auditable, not just claimed.
- Full vitest **15379/0** + build clean. **0 problems found** → deploy authorized by the user's message.
- **Honest gap (Rule Q)**: the matrix verifies the DATA-MUTATION logic (where every saga bug lived)
  end-to-end on real prod; the React auth-gated UI wiring is the user's L1 hands-on (the fidelity
  test proves the orchestration matches TFP).

## V142-quinquies (same session) — finalize→doctor→finalize DOUBLE-DEDUCT (NEW BUG, real prod) + ROOT-CAUSE fix
User escalated the matrix into an adversarial /systematic-debugging hunt ("ข้ามขั้นตอนไปมา … ข้อมูล
ก็ต้องถูกต้องทุกครั้ง") + clarified "ปุ่มบันทึกสำหรับแพทย์ ไม่ต้องบันทึกพวกข้อมูลการตัดคอร์ส …
บันทึกตัดคอร์สจะเป็นบันทึกด้านล่างของ TFP". The hunt found a REAL bug where the user pointed.
- **BUG (CONFIRMED real prod, `scripts/diag-finalize-doctor-finalize-double-deduct.mjs` R1/R2 → 3/5)**:
  finalize (deduct 5/5→4/5) → re-open → กดบันทึกสำหรับแพทย์ (doctor, "always shown" Phase 27.2-bis →
  status='doctor-recorded') → re-open → finalize again → the V142-quater `priorSaveDeducted` STATUS
  heuristic reads 'doctor-recorded' → FALSE → reverse SKIPPED → re-deduct → **4/5→3/5 DOUBLE-DEDUCT**
  (customer loses a session never used). The V142-quater comment "finalize→doctor→finalize cannot
  occur" was FALSE. The heuristic can't distinguish "never deducted" from "deducted-then-doctor-rerecorded"
  (both = 'doctor-recorded'). V142-quater traded over-credit for double-deduct.
- **FIX (root cause, per user directive)**: (A) doctor/vitals saves are course-NEUTRAL —
  `courseItems: (doctor|vitals) ? existingCourseItems : buildCourseItemsForSave(...)` (don't write course
  data). (B) persisted `_courseDeducted` flag (in detail) — SET by deducting saves (`willDeductCourses`),
  PRESERVED by doctor/vitals; `priorSaveDeducted = loadedCourseDeducted` (loaded with backward-compat
  fallback to the status heuristic for pre-fix docs). Reverse decision now independent of status flips.
  **AV165** (supersedes AV164 heuristic). 5 TFP edits.
- **Verified (Rule Q L2 real prod)**: matrix `scripts/e2e-tfp-full-flow-matrix.mjs` **30/0** (17 phases;
  NEW G5 P16 finalize→DOCTOR→finalize=4/5 + P17 vitals variant; all V142/quater/buffet/fill-later/dup/
  shortfall preserved) + **110 targeted** (v142-quinquies NEW + v142-quater updated-to-flag + bis/v142/
  v136/v104/v101 + fidelity F1-F9). Repro diag R1/R2=bug, R3/R4=regress-intact. Build clean.
- **Tests**: NEW `tests/v142-quinquies-finalize-doctor-finalize-double-deduct.test.js` (flag state-machine
  F1-F6 + heuristic-repro F3 + SG1-5 + backward-compat) + `scripts/diag-finalize-doctor-finalize-double-deduct.mjs`
  (forensic repro). Updated: matrix mirror + fidelity (F2/F3 + new F8/F9) + v142-quater (→ flag) + v101/v142-bis
  V21 source-grep (Part-A ternary). v136 UNCHANGED (reverse-condition line verbatim).
- **Honest gap (Rule Q)**: data-mutation logic verified end-to-end on real prod; React auth-gated UI wiring
  = user L1 (fidelity F1-F9 proves the orchestration matches TFP).

## Resume Prompt
Resume LoverClinic — V142 family + V142-quinquies COMPLETE. /systematic-debugging found+fixed a REAL
prod DOUBLE-DEDUCT (finalize→doctor→finalize, reproduced 3/5) — root cause: V142-quater status heuristic
→ replaced with persisted `_courseDeducted` flag + course-neutral doctor/vitals (user directive). Verified
matrix 30/0 real prod (17 phases, P16/P17 = the fix) + 110 targeted + full vitest. V142-quater committed;
V142-quinquies HELD. prod LIVE = 8c3a9047 (lacks quater/quinquies). User authorized deploy if no problems —
a problem WAS found+fixed → surface it, then on explicit "deploy": `vercel --prod` (frontend/lib only, no
Probe-Deploy-Probe) → session-end. Post-deploy L1: finalize-using-course → doctor-save → finalize-again →
course stays deducted ONCE (not twice).
