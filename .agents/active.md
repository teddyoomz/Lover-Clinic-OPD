---
updated_at: "2026-05-08 — V43 skip-stock-deduction live-resolve + direct-product flag + Rule M migration (committed-not-deployed-not-applied)"
status: "master=PENDING-COMMIT · prod=c92f924 (V42 + V43 NOT yet deployed) · 67 V43 tests pass · build clean · 7118+/7126 full-suite (8 pre-existing V41 stale fixed in V43 sweep)"
branch: "master"
last_commit: "PENDING (V43 commit drafting)"
tests: 7118
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = `PENDING` (V43 commit drafting; V42 `bf78779` + EOD `ace2487` already in master) · prod = `c92f924` (V42 + V43 NOT deployed)
- V43 dry-run found 1 customer / 3 entries needing backfill (LC-26000006 PRP × 3 from promotion bundle)
- Migration --apply NOT yet run (Rule M two-phase; awaits user "apply" authorization)
- 67/67 V43 + 213/213 related-file regression + build clean
- Full suite: 7118 → 7126 PASS (V43 sweep also fixed 8 PRE-EXISTING V41 stale tests)

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

**1) Apply migration to prod** — `node scripts/v43-backfill-customer-courses-skip-stock.mjs --apply` (Rule M; needs user explicit "apply" auth). Dry-run shows 1 customer / 3 entries (LC-26000006 PRP × 3). Audit doc auto-emitted. Idempotent — re-run = 0 writes.

**2) Deploy V42 + V43** — `vercel --prod` after user "deploy" auth (V18 — auth never rolls over). V43 live-resolve overlay needs deploy to take effect for UI users; V42 promo-qty fix from prior session also pending deploy.

**3) Live e2e e2e against prod** (optional, post-deploy): create TEST-prefixed course + customer + buy + use → verify branch-1 fires. Per V33.10/11/12 prefix discipline + `feedback_no_real_action_in_preview_eval.md`.

## Outstanding (user-triggered, none blocking unless deploy/apply)
- 🚨 V43 migration `--apply` (3 entries fix on LC-26000006 — instant + idempotent)
- 🚨 V42 + V43 `vercel --prod` (V18)
- H-bis ProClinic full strip (deferred)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass
