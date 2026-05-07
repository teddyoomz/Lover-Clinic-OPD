---
updated_at: "2026-05-08 — V44 course-buy product-name source fix (V12 multi-reader-sweep) + 70/70 cross-branch e2e + AV22 invariant"
status: "master=PENDING (V44 commit drafting) · prod=c92f924 (V42 + V43 + V44 NOT yet deployed) · 27 V44 tests + 70/70 e2e + 0-write migration · build clean"
branch: "master"
last_commit: "PENDING (V44 commit drafting); V43 chain at d3969cb"
tests: 27
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = PENDING (V44 commit drafting; V43 chain at d3969cb already pushed)
- prod = c92f924 (V42 + V43 + V44 ALL pending deploy)
- V44 migration dry-run = 0 entries (prod data is clean — V44 is forward-defense)
- V44 e2e = 70/70 PASS (2 current + 1 future branches × 4 course shapes × 5 phases)
- 27/27 V44 unit tests + 213+/213+ V42/V43/related-file regression + build clean

## What this session shipped (V44)
- **Diag** (Rule M read-only): `scripts/v44-diag-customer-courses-product-name-drift.mjs` — confirmed 0 product-mismatch-master in current prod data
- **Source fix**: TFP buy fetcher (`TreatmentFormPage.jsx:1558+`) now uses canonical `beCourseToMasterShape` with productLookup Map (replaces inline mapping that bypassed main product + dropped name field)
- **Defensive dual-reads**: `buildPurchasedCourseEntry` + `assignCourseToCustomer` accept `p.name || p.productName || (mainName fallback) || ''` — empty-string final fallback prevents course-name fingerprint from being written silently
- **Migration**: `scripts/v44-backfill-customer-courses-product-name.mjs` (Rule M two-phase) — dry-run = 0 writes (prod clean)
- **Tests**: 27 V44.A-F groups in `tests/v44-course-buy-product-name-source-fix.test.js` (canonical mapper contract + dual-read + Rule I full-flow Image 5/Image 1 reproductions + V12 multi-reader-sweep audit)
- **e2e**: `scripts/e2e-v44-course-buy-product-name.mjs` 70/70 PASS — TEST-prefixed fixtures across 2 real branches + 1 future branch + 4 course shapes
- **AV22 audit invariant**: "Every buy-item fetcher MUST use beCourseToMasterShape (single-source canonical mapper)"
- **V44 V-entry** in `.claude/rules/00-session-start.md` § 2

## Next action

**1) Deploy V42 + V43 + V44** — `vercel --prod` after user "deploy" auth (V18). All 3 are committed-not-deployed:
   - V42: promotion bundle qty multiplier (4 writer sites)
   - V43: skipStockDeduction live-resolve + direct-product flag + migration applied
   - V44: course-buy product-name source fix (forward-defense; 0 backfill needed)

**2) Live e2e against prod** (optional, post-deploy): create TEST-prefixed course w/ main+sub + buy via TFP UI + use → verify customer panel shows main + sub names correctly. V33.10/11 prefix discipline; never touch real customer per `feedback_no_real_action_in_preview_eval.md`.

## Outstanding (user-triggered, none blocking unless deploy)
- 🚨 V42 + V43 + V44 `vercel --prod` (V18)
- H-bis ProClinic full strip (deferred)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass
