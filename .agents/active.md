---
updated_at: "2026-07-04 EOD — DF course-rate 0-baht fix (AV200) + product/procedure rate section (Q1=A) SHIPPED + DEPLOYED; Rule M junk cleanup applied."
status: "DF fix + product rates LIVE on prod (lover-clinic-app.vercel.app). master 49032ef0 deployed. Idle."
branch: "master"
last_commit: "49032ef0 — chore(df): Rule M cleanup — delete 2 legacy all-zero be_df_staff_rates docs"
tests: "full vitest 17021/17021 · 0 fail (this session, post-Task-6). Build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "49032ef0 DEPLOYED 2026-07-04 (vercel lover-clinic-8mg3xw451, frontend-only; HTTP 200)"
firestore_rules_version: "UNCHANGED all session (frontend-only → no Probe-Deploy-Probe)"
---

# Active — 2026-07-04 EOD — DF rates fix + product rates (AV200)

## State
- DF ค่ามือ 0-บาท bug FIXED + ค่ามือสินค้า/หัตถการ section NEW — both DEPLOYED LIVE.
- Rule M cleanup applied on prod: 2 legacy all-zero be_df_staff_rates docs deleted (audit doc emitted).
- master 49032ef0 = prod bundle; firestore.rules untouched; idle.

## What this session shipped (detail → checkpoint 2026-07-04-df-product-rates-and-rate-fix.md)
- **AV200 bugfix**: TFP masterCourseIdByName read `mc.name` but all 405 be_courses are canonical (`courseName`) → empty map → every DfEntryModal row 0 บาท while 188 entered rates existed. NEW shared `buildMasterIdByName` (canonical-first) in dfEntryValidation.js. V49-class missed site.
- **Product rates (Q1=A)**: DfGroupFormModal section 2 "อัตราค่ามือต่อสินค้า/หัตถการ" (listProductsForPicker, rows `kind:'product'` in same rates[]); TFP resolves treatmentItems name → courseMap → productMap → pseudo-name; resolver getRateForStaffCourse UNTOUCHED.
- normalizeDfGroup preserves `kind:'product'` (undefined-free per V14); AV200 appended byte-identical to both SKILL.md copies (SY1 green).
- **Rule Q L2 ALL PASS ×2 on real prod** (`scripts/diag-df-rate-verify-fix.mjs`): pre-fix repro (map empty → 0) + post-fix returns the REAL entered 10 บาท source=group + product chain resolves; re-run post-cleanup still green.
- **Rule M cleanup**: `scripts/cleanup-junk-df-staff-rates.mjs` two-phase + signature guard → deleted docs 3841/3842 (174 all-zero ProClinic-era rates, no branchId); audit `cleanup-junk-df-staff-rates-1783151535457-7b1d6704`; idempotent 0.
- Spec + plan HTML committed; 26 new tests (A helper / B Rule I flow-simulate incl. user-screenshot repro / C kind / D source-grep); full vitest 17021/0; also committed 2 stray filler-math-explainer docs from prior session.

## Next action
- Idle / await. **User L1 (auth-gated)**: open TFP → เพิ่มค่ามือ → course rows show entered rates (not 0); enter a "Shock wave" product rate in กลุ่ม DF → row auto-fills.

## Outstanding user-triggered actions
- None blocking.
