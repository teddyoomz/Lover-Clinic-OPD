---
updated_at: "2026-05-08 — V45 dedup-shadow OR-merge fix (3rd round skip-stock class) + 166/166 professor-grade comprehensive e2e + AV23 invariant"
status: "master=PENDING (V45 commit drafting) · prod=c92f924 (V42-V45 ALL pending deploy) · 17 V45 + 200 cumulative V42-V45 unit tests + 166/166 comprehensive e2e + 70/70 V44 e2e + 39/39 V43 e2e · build clean"
branch: "master"
last_commit: "PENDING (V45 commit drafting); V44 chain at 9d0b73a"
tests: 200
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = PENDING (V45 commit drafting); V44 chain at 9d0b73a already pushed
- prod = c92f924 — V42 + V43 + V44 + V45 ALL pending deploy
- V45 fix: `beCourseToMasterShape:3193` dedup-shadow OR-merge — single-source canonical mapper edit fixes 3 consumers (TFP buy + SaleTab + QuotationFormModal)
- Diag (`scripts/v45-diag-dedup-shadow.mjs`) found 14 affected courses on prod (PRP + ขลิบ + ปรึกษา clusters); single-edit fix benefits ALL
- 200/200 cumulative V42-V45 unit tests + build clean
- 166/166 professor-grade comprehensive e2e (`scripts/e2e-comprehensive-skip-stock-deduct.mjs`) PASS across 26 categories × 13 phases × (2 current + 1 future) branches × 7 course shapes
- 70/70 V44 e2e + 39/39 V43 e2e — both still PASS post V45 (no regression)

## What this session shipped (V45)
- **Diag** (`scripts/v45-diag-dedup-shadow.mjs`): read-only Rule M; identified 14 prod courses with dup-of-main sub-row pattern + per-row skip flag silently dropped
- **Source fix** at `src/lib/backendClient.js:3193` (beCourseToMasterShape): OR-merge per-row flags from dup-of-main sub into already-pushed main entry BEFORE dedup `continue;`. Skip + isHidden flags OR-merged.
- **Tests**: 17 V45.A-G groups in `tests/v45-dedup-shadow-or-merge.test.js` (USER REPORT REPRO + reverse direction + mixed dup+distinct + isHidden + source-grep regression locks + Rule I full-flow + 4 user-fixture cluster)
- **Professor-grade e2e**: `scripts/e2e-comprehensive-skip-stock-deduct.mjs` 166/166 PASS — 13 phases covering V42+V43+V44+V45 stack:
  - Phase 1-3: Branch discovery + future-branch creation + per-branch fixtures (84 courses + 9 products)
  - Phase 4: Canonical mapper × 7 shapes × 3 branches (V44 invariant + V45 OR-merge + V45 reverse)
  - Phase 5: Buy-flow chain (V44 + V45 propagation through buildPurchasedCourseEntry + resolvePurchasedCourseForAssign)
  - Phase 6: V43 direct-product master flag verification
  - Phase 7: V43 frozen-flag overlay rescue (saved customer.courses[] + form-shape)
  - Phase 8: 5-branch decision-tree simulation (course-skip / product-skip / FIFO+negative / trackStock-false / not-tracked)
  - Phase 9: V42 promotion bundle 3-level qty multiplier + flag propagation
  - Phase 10: Cross-branch helper consistency (every helper produces IDENTICAL output on every branch)
  - Phase 11: Negative direction (master un-flip → overlay un-rescues)
  - Phase 12: Adversarial inputs + idempotency
  - Phase 13: mapRawCoursesToForm + overlay end-to-end
- **AV23 audit invariant**: "Dedup logic in canonical mappers MUST OR-merge per-row flags into the kept entry before skipping; silent dedup-skip = drop user intent."
- **V45 V-entry** in `.claude/rules/00-session-start.md` § 2

## Next action
**1) Deploy V42 + V43 + V44 + V45** — `vercel --prod` after user "deploy" auth (V18). All 4 fixes committed-not-deployed. Migration data ops already applied where needed (V43 only — V44 + V45 are forward-defense).

**2) Live e2e against prod** (optional, post-deploy): admin re-creates the user's "ขลิบไร้เลือด (เบอร์26)" scenario via TFP buy + treatment → verify movement log shows SKIP (note "ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคในคอร์ส") not -1 negativeOverage.

## Outstanding (user-triggered, none blocking unless deploy)
- 🚨 V42 + V43 + V44 + V45 `vercel --prod` (V18)
- H-bis ProClinic full strip (deferred)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass

## Class-of-bug closed: skip-stock-deduction (3-round saga)
- Round 1 (V43): `customer.courses[i].skipStockDeduction` denormalized at buy time → master edits don't propagate. Fix: hybrid backfill migration + live-resolve overlay at TFP load. Single-source contract: lib helper + migration + diag use SAME `resolveCustomerCourseSkipFlag` logic.
- Round 2 (V44): TFP buy fetcher bypassed canonical `beCourseToMasterShape` → product names lost (course-name leak). Fix: TFP adopts canonical mapper + defensive dual-read at `buildPurchasedCourseEntry` + `assignCourseToCustomer`.
- Round 3 (V45): Canonical mapper's silent dedup at `:3193` dropped per-row flags from dup-of-main sub-row → user intent lost at the SOURCE. Fix: OR-merge before continue.
- Class is now closed by 4 audit invariants (AV20 + AV21 + AV22 + AV23) — every drift vector locked at source-grep regression layer.
