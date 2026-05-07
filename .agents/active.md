---
updated_at: "2026-05-08 — V43 skip-stock-deduction live-resolve APPLIED on prod (3 entries fixed) + helpers + direct-product flag committed"
status: "master=f0effba (V43 code) + PENDING (in-array timestamp fix) · prod=c92f924 (V42 + V43 NOT yet deployed) · migration APPLIED ✅ · 67 V43 tests pass · build clean"
branch: "master"
last_commit: "f0effba (V43 ship) + script-fix pending"
tests: 67
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = `f0effba` (V43 ship) + 1 pending fix (FieldValue.serverTimestamp inside-array → ISO string) · prod = `c92f924`
- V43 migration **APPLIED on prod** ✅ — 3 entries on LC-26000006 restamped (false→true). Diag re-confirmed 0 master-true-customer-false drift. 1355 orphans preserved (legacy ProClinic-imported, overlay no-ops safely).
- Audit doc: `be_admin_audit/v43-backfill-customer-courses-skip-stock-1778166208462-7e87927e`
- Idempotency verified: re-run dry-run = 0 writes
- 67/67 V43 tests pass post-fix; build clean; full-suite 7118+ (8 V41 stale fixed in V43 sweep)

## What this session shipped (V43)
- **Diag** (Rule M read-only): `scripts/v43-diag-customer-courses-skip-stock.mjs` confirmed root cause = denormalization-at-buy-time freeze (customer.courses[i].skipStockDeduction lags master edits)
- **Live-resolve overlay** (Q1=C hybrid): `overlayCustomerCoursesWithMaster` + `resolveCustomerCourseSkipFlag` in `src/lib/treatmentBuyHelpers.js`; wired in TFP load AFTER `mapRawCoursesToForm` so master edits propagate without re-running migration
- **Backfill migration** (Q4=A Rule M): `scripts/v43-backfill-customer-courses-skip-stock.mjs` two-phase + audit doc to `be_admin_audit/v43-backfill-customer-courses-skip-stock-{ts}-{rand}` + idempotent + forensic-trail `_v43BackfilledAt` + `_v43BackfilledFrom`
- **Direct-product master flag** (Q2=A): NEW top-level `skipStockDeduction` on be_products + ProductFormModal UI checkbox + `_getProductStockConfig` surfaces field + `_deductOneItem` branch 2 (NEW) emits `reason:'product-skip'` distinct from branch 1 `course-skip`
- **Promotion fallback gap close** (Q3=A): `buildPromotionSubCourseProducts` no-products fallback + per-product map both carry `skipStockDeduction` defensively
- **Tests** (67 in `tests/v43-skip-stock-deduction.test.js`): V43.A-M covering helper / migration / source-grep / Rule I full-flow / single-source contract
- **AV21 audit invariant** added to `audit-anti-vibe-code` (lock: denormalized-flag from editable master = require live-resolve OR migration tracking)
- **Sweep fix**: `tests/phase-17-1-cross-branch-import-flow-simulate.test.js` F1.1 count 7→10 + `tests/phase-17-0-marketing-tabs-rtl.test.jsx` mock useTabAccess (V41 marketing-extension stale tests; not V43 regression but fixed for clean full suite)

## Next action

**1) Deploy V42 + V43** — `vercel --prod` after user "deploy" auth (V18 — auth never rolls over). V43 live-resolve overlay needs deploy to take effect for UI users; V42 promo-qty fix from prior session also pending. Migration is already applied — deploy completes the rollout for UI surface (course-edit modal "ไม่ตัด" checkbox honored at treatment time + ProductFormModal new "ไม่ตัดสต็อค" flag visible to admin).

**2) Live e2e against prod** (optional, post-deploy): create TEST-prefixed course + customer + buy + use → verify branch-1 fires. Per V33.10/11/12 prefix discipline + `feedback_no_real_action_in_preview_eval.md`.

## Outstanding (user-triggered, none blocking unless deploy)
- 🚨 V42 + V43 `vercel --prod` (V18)
- H-bis ProClinic full strip (deferred)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass
