# 2026-07-04 — DF course-rate 0-baht fix (AV200) + product/procedure rates (Q1=A) — SHIPPED + DEPLOYED

## Summary
User reported (with mobile screenshot): rates entered in กลุ่ม DF ค่ามือ never appear in TFP's
DfEntryModal (0 บาท + "ไม่มีอัตราในกลุ่มนี้") and standalone procedures ("Shock wave") have no
place to configure a rate. Full cycle: `/brainstorming` (Rule R diag pinned root cause on prod)
→ spec → plan → inline TDD → Rule Q L2 → deploy. Plus Rule M cleanup of 2 junk staff-rate docs.

## Current State
- master `49032ef0` (+ EOD docs commit) = prod (`lover-clinic-8mg3xw451`, lover-clinic-app.vercel.app HTTP 200)
- full vitest **17021/17021 · 0 fail** + build clean; firestore.rules UNCHANGED (no Probe-Deploy-Probe)
- AV200 in both audit-anti-vibe-code SKILL.md copies (byte-identical, SY1 green)
- Rule Q L2 `diag-df-rate-verify-fix.mjs` ALL PASS ×2 (post-fix + post-cleanup)
- Honest gap: user L1 on authed TFP (rates auto-fill, not 0)

## Root cause (confirmed on prod — scripts/diag-df-rate-mismatch.mjs)
- be_courses 405/405 docs canonical (`courseName` only, `.name` = 0 docs)
- TFP `masterCourseIdByName` read `mc?.name` → EMPTY map → rows fell back to pseudo-name ids
  → resolver `getRateForStaffCourse` (string id match) never hit `be_df_groups.rates[].courseId`
  (real ids like `COURSES_1778150447655_AE530C40`) → 0 บาท while กลุ่มแพทย์ 120 + ผู้ช่วยแพทย์ 68
  rates existed. V49-class canonical-shape multi-reader-sweep missed site (not a picker;
  broke when BSA/H-quater swapped getAllMasterDataItems → listCourses).
- "Shock wave" = be_products item entering via treatmentItems (name-only) — DF group form had
  course picker ONLY → nothing to configure.

## Fix architecture
- NEW pure `buildMasterIdByName(items, nameKeys, idKeys)` (dfEntryValidation.js) — canonical-first,
  legacy fallback, first-hit-wins; used for BOTH course + product maps in TFP.
- TFP Source 2 chain: courseMap → productMap (NEW) → pseudo-name; deps include product map.
- Product rates ride the SAME `rates[]` with `kind:'product'` (normalizeDfGroup preserves the
  literal only, V14 undefined-free); resolver + DfEntryModal + dfPayout untouched (saved dfEntries
  carry materialized values).
- DfGroupFormModal: section 2 "อัตราค่ามือต่อสินค้า/หัตถการ" — listProductsForPicker search + chips +
  shared renderRateRow; display split keeps REAL rates[] index (updateRate/removeRate untouched);
  rehydrate pool includes products; takenCourseIds shared across kinds (blocks id collision).

## Commits
```
0eed962b docs(filler): add math-explainer HTML + PDF artifacts
1e30e253 docs(spec): DF product rates + course rate 0-baht fix design (Q1=A) + Rule R diag
265e9a9e docs(plan): DF product rates + course rate fix — 6-task inline plan
ca1d03f0 fix(df): course rate 0-baht — name map reads canonical courseName (AV200)
487a6469 feat(df): TFP resolves product/procedure rows to be_products id (AV200)
7b9dc3b0 feat(df): rates[] kind product survives normalizeDfGroup (AV200)
7f02bd07 feat(df): product/procedure rate section in DF group form (Q1=A, AV200)
c61b6549 docs(audit): AV200 canonical-first name maps + Rule Q L2 DF verify (ALL PASS)
49032ef0 chore(df): Rule M cleanup — delete 2 legacy all-zero be_df_staff_rates docs
```

## Files Touched
- src/lib/dfEntryValidation.js (NEW buildMasterIdByName)
- src/lib/dfGroupValidation.js (normalizeDfGroup kind)
- src/components/TreatmentFormPage.jsx (both maps + Source 2 chain)
- src/components/backend/DfGroupFormModal.jsx (product section)
- tests/df-rate-name-map-and-product-rates.test.js (NEW, 26 tests A/B/C/D)
- scripts/diag-df-rate-mismatch.mjs + diag-df-rate-verify-fix.mjs + cleanup-junk-df-staff-rates.mjs (NEW)
- .claude + .agents skills/audit-anti-vibe-code/SKILL.md (AV200, byte-identical)
- docs/superpowers/{specs,plans}/2026-07-04-df-product-rates-and-course-rate-fix*

## Decisions (1-line each)
- Q1=A: product rates live in กลุ่ม DF (section 2); per-staff product override deferred (schema-free later).
- Same rates[] + `kind:'product'` — resolver untouched, zero migration.
- Source 2 order: course-first (Phase 14.4 contract) → product → pseudo-name.
- Double-pay note: course row + its product row can both auto-enable — admin unticks (documented in spec Risks).
- Rule M cleanup approved by user ("ลบทิ้ง"): docs 3841/3842 deleted, signature-guarded, audit `cleanup-junk-df-staff-rates-1783151535457-7b1d6704`, idempotent.
- Extended `dfGroupsUi.test.jsx` fail = PRE-EXISTING baseline (window undefined under node env; verified via stash/pop) — not this session's.

## Next Todo
- User L1: TFP → เพิ่มค่ามือ → rates auto-fill (not 0); add a Shock wave product rate → auto-fills.
- Optional later: per-staff product-rate override picker (same schema).

## Resume Prompt
See SESSION_HANDOFF.md Resume Prompt block.
