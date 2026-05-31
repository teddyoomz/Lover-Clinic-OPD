---
updated_at: "2026-05-31 EOD+4 LATE+1 — V142-quinquies: finalize→doctor→finalize DOUBLE-DEDUCT found on real prod + FIXED (persisted _courseDeducted flag) + matrix 30/0."
status: "V142 family + V142-quinquies COMPLETE. /systematic-debugging found a REAL double-deduct (finalize→doctor→finalize, reproduced on prod 3/5) → root-cause fix (status heuristic → persisted flag + course-neutral doctor/vitals per user directive). Matrix 30/0 real prod + 110 targeted. Awaiting full-suite + deploy."
branch: "master"
last_commit: "V142-quater committed (058849c0 = V142-bis; V142-quater after). V142-quinquies HELD uncommitted. prod LIVE = 8c3a9047 (does NOT have V142-quater/quinquies)."
tests: "Matrix e2e 30/0 real prod (17 phases incl. P16/P17 double-deduct fix) + repro diag R1/R2 (bug) R3/R4 (regress) + 110 targeted (v142-quinquies/quater/bis/v142/v136/v104/v101/fidelity). Full suite running."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "8c3a9047 LIVE. PENDING DEPLOY: V142-bis + V142-quater + V142-quinquies (the double-deduct fix = REAL prod-correctness bug, should go live)."
firestore_rules_version: "UNCHANGED — V142 family frontend/lib only (no rules/storage/index/cron → no Probe-Deploy-Probe)."
---

# Active Context — V142-quinquies (2026-05-31 EOD+4 LATE+1)

## /systematic-debugging — found + fixed a REAL prod double-deduct
User escalated: "ทดสอบมาทุก flow … ข้ามขั้นตอนไปมา … ข้อมูลก็ต้องถูกต้องทุกครั้ง" + clarified
"ปุ่มบันทึกสำหรับแพทย์ ไม่ต้องบันทึกพวกข้อมูลการตัดคอร์ส … บันทึกตัดคอร์สจะเป็นบันทึกด้านล่าง".
The adversarial hunt found a real bug exactly where the user pointed (go-backward flows).

## The bug (CONFIRMED real prod — `scripts/diag-finalize-doctor-finalize-double-deduct.mjs`)
- **finalize → บันทึกสำหรับแพทย์ (doctor) → finalize again = DOUBLE-DEDUCT** (R1: 5/5→4/5→**3/5**; R2 same via vitals).
- The doctor-save button is "always shown" (Phase 27.2-bis) — contradicting the V142-quater comment's
  "finalize→doctor→finalize cannot occur". A completed (already-deducted) treatment re-saved as doctor
  flips `loadedTreatmentStatus`→'doctor-recorded' → the V142-quater `priorSaveDeducted` status heuristic
  reads false → reverse SKIPPED → re-deduct → the course is deducted TWICE for one use.
- The status heuristic can't distinguish "never deducted" (vitals→doctor→finalize) from "deducted then
  doctor-rerecorded" (finalize→doctor→finalize) — both show 'doctor-recorded'. V142-quater traded
  over-credit for double-deduct.

## The fix (V142-quinquies — root cause, aligned with the user directive)
- **Part A**: doctor/vitals saves are course-NEUTRAL — `courseItems: (doctor|vitals) ? existingCourseItems
  : buildCourseItemsForSave(...)` (don't write course-deduction data; the bottom save owns it).
- **Part B**: persisted `_courseDeducted` flag (in detail) — SET by the deducting save (`willDeductCourses`),
  PRESERVED by doctor/vitals; `priorSaveDeducted = loadedCourseDeducted` (loaded with backward-compat
  fallback to the status heuristic for pre-fix docs). The reverse decision is now independent of status flips.
- **AV165** (supersedes AV164's heuristic). 5 TFP edits (state + load + serialize-ternary + gate + flag-write).

## Verification (Rule Q L2 — real prod, MULTIPLE DIFFERENT methods per user "เทสที่ไม่เหมือนกัน")
- **`scripts/e2e-tfp-full-flow-matrix.mjs` 30/0** (17 phases, MIRROR threads the flag): G1 create · G2
  step-skip · G3 edit-resave · G4 adversarial · **G5 P16 finalize→DOCTOR→finalize = 4/5 + P17 vitals**.
- **`scripts/e2e-tfp-flag-roundtrip-fuzz-stock.mjs` 30/0** (DIFFERENT methods — the gap the mirror missed):
  A flag persistence ROUND-TRIP through REAL createBackendTreatment→getTreatment→update · **B3 ★★★
  go-backward driving the flag through REAL Firestore (read-back, NOT threaded) = 4/5 — proves the flag
  survives persistence** · C stock go-backward (hasStockChange gate) · D backward-compat derivation ·
  **E 14/14 randomized fuzz vs an INDEPENDENT conservation reference**.
- **`scripts/diag-finalize-doctor-finalize-double-deduct.mjs`** repro (R1/R2=3/5 bug, R3/R4=4/5 regress).
- **`scripts/diag-double-deduct-victims.mjs`** (Rule R): 0 clean prod victims (1 known-ambiguous LC-26000009).
- **113 targeted** (v142-quinquies incl. FZ1 200-seq fuzz + FZ2 go-backward stress + v142-quater→flag + bis
  + v142 + v136 + v104 + v101 + fidelity F1-F9). Full suite + build: running.
- **No new product bug found this round** (the round-trip COULD have exposed a persistence break — it didn't).

## Honest gap (Rule Q)
Matrix verifies the DATA-MUTATION logic end-to-end on real prod (where every saga bug lived); the React
auth-gated UI wiring is the user's L1 (the mirror-fidelity test F1-F9 proves the orchestration matches TFP).

## Next action
Full-suite green → commit V142-quinquies → DEPLOY (user authorized "deploy ถ้าไม่เจอปัญหา"; a real bug WAS
found + fixed → surface it, then deploy on confirm) → session-end.

## Outstanding user-triggered actions
- **L1 hands-on** (post-deploy): finalize a treatment that uses a course → re-open → กดบันทึกสำหรับแพทย์ →
  re-open → finalize again → course must stay deducted ONCE (not deducted twice).
- Pre-existing (NOT deploy-gating): extended-suite ~280 stale tests.
