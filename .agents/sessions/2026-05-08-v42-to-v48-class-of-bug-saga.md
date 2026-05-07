# Session 2026-05-08 EOD — V42-V48 class-of-bug 7-round saga ARCHITECTURALLY CLOSED

## Summary

User-driven 7-round mega-session resolving the entire skip-stock-deduction + display-layer-multi-reader-sweep + canonical-mapper-drift class-of-bug. Each round triggered by user repro of remaining symptom. Phase 4.5 architectural review (3+ fixes failed = question architecture) twice unlocked deeper root causes (V46 batch-name poisoning, V48 universal Rule O extension). Saga closed with NEW iron-clad Rule O + AV20-AV26 invariant set + 59-test prof-grade explorative bank.

## Current State

- master = `1442301` · prod = `c92f924` (V42-V48 ALL pending deploy)
- 366/366 V34-V48 unit + 166/166 comprehensive e2e + 70/70 V44 e2e + 39/39 V43 e2e + 29/29 V46 e2e + 28/28 V47 e2e = **698 verification points GREEN**
- Build clean; full suite TBD
- Migrations applied: V43 (3 LC-26000006 PRP entries restamped) + V46 (2 poisoned batches restamped) + audit docs in `be_admin_audit`
- AV20-AV26 invariant set COMPLETE — class-of-bug architecturally closed

## Commits this session

```
1442301 fix+test(V48): Rule O universal extension + prof-grade explorative test bank
b574b3e fix(V47): CustomerDetailView course grouping — display parity with TFP
ebe2d2a fix(V46): Rule O — productName live-resolve at movement write
22ac0a9 fix(V45): dedup-shadow OR-merge — 3rd round skip-stock-deduction class CLOSED
9d0b73a fix(V44): course-buy product-name source fix — V12 multi-reader-sweep at TFP
2bd2456 test(V43-e2e): live admin-SDK cross-branch verification (39/39 PASS)
d3969cb fix(V43-apply): in-array FieldValue.serverTimestamp() → ISO string + applied on prod
f0effba fix(V43): skipStockDeduction live-resolve + direct-product flag + Rule M migration
```

## Files Touched (no diffs — see V-entries in v-log-archive.md if needed)

**Source**:
- `src/lib/backendClient.js` — _resolveProductNameLive helper (V46) + Rule O at 10+ stock-write sites (V46 + V48) + beCourseToMasterShape OR-merge (V45) + dedup-shadow fix
- `src/lib/treatmentBuyHelpers.js` — overlayCustomerCoursesWithMaster + resolveCustomerCourseSkipFlag (V43) + buildPromotionSubCourseProducts (V42) + groupCustomerCoursesForDetailView (V47) + dual-read defensive (V44)
- `src/components/TreatmentFormPage.jsx` — overlay wired in load path (V43) + canonical mapper adoption (V44)
- `src/components/backend/CustomerDetailView.jsx` — group-driven render (V47)
- `src/components/backend/ProductFormModal.jsx` — skipStockDeduction UI checkbox (V43)
- `src/lib/productValidation.js` — skipStockDeduction field validation (V43)

**Migration scripts (Rule M)**:
- `scripts/v43-diag-customer-courses-skip-stock.mjs` + `v43-backfill-customer-courses-skip-stock.mjs` (applied)
- `scripts/v44-diag-customer-courses-product-name-drift.mjs` + `v44-backfill-customer-courses-product-name.mjs` (no drift on prod)
- `scripts/v45-diag-dedup-shadow.mjs` (read-only, 14 affected courses)
- `scripts/v46-diag-treatment-trace.mjs` + `v46-backfill-stock-batch-product-name.mjs` (applied — 2 batches)
- `scripts/v48-...` (none — V48 is purely fix + test)

**E2E scripts**:
- `scripts/e2e-skip-stock-deduction.mjs` (V43 — 39/39)
- `scripts/e2e-v44-course-buy-product-name.mjs` (70/70)
- `scripts/e2e-comprehensive-skip-stock-deduct.mjs` (V42-V46 stack — 166/166)
- `scripts/e2e-v46-rule-o-batch-name-resolution.mjs` (29/29)
- `scripts/e2e-v47-customer-detail-grouping.mjs` (28/28)

**Tests**:
- `tests/v43-skip-stock-deduction.test.js` (67)
- `tests/v44-course-buy-product-name-source-fix.test.js` (27)
- `tests/v45-dedup-shadow-or-merge.test.js` (17)
- `tests/v46-rule-o-live-product-name.test.js` (20)
- `tests/v47-customer-detail-view-grouping.test.js` (26)
- `tests/v48-prof-grade-class-of-bug-coverage.test.js` (59 — 10 categories)
- Minor regression updates in tests/v42-promotion-bundle-qty-multiplier.test.js + tests/phase-17-1-cross-branch-import-flow-simulate.test.js + tests/phase-17-0-marketing-tabs-rtl.test.jsx

**Iron-clad rules + audit**:
- `.claude/rules/00-session-start.md` — V42-V48 entries + NEW iron-clad Rule O
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV20-AV26 invariants documented

## Decisions (one-line each — full reasoning in v-log-archive.md)

- V43 hybrid Q1=C: backfill migration + live-resolve overlay (defense-in-depth)
- V43 Q2=A: top-level skipStockDeduction on be_products (NOT inside stockConfig — separate semantic from trackStock)
- V44: TFP buy fetcher adopts beCourseToMasterShape canonical mapper (single-source for 3 consumers)
- V45: OR-merge per-row sub-flag into kept main entry BEFORE dedup `continue;` — preserves user intent
- V46: NEW `_resolveProductNameLive(productId)` helper with per-call cache; productName at movement-write live-resolves
- V46 fallback chain: `liveName || item.productName || batch.productName || ''` — empty FINAL (NEVER course-name)
- V47: NEW `groupCustomerCoursesForDetailView` helper — raw-shape sibling of buildCustomerCourseGroups, group-key parity
- V48: Rule O extends UNIVERSALLY to ALL stock writers (10+ sites); POISON GATE pattern fixes downstream propagation
- V48 prof-grade testing patterns codified: property-based mulberry32 deterministic seed + cross-branch toString.grep + adversarial Thai/Unicode + class-of-bug universal sweep classifier

## Next Todo

1. **Deploy** — `vercel --prod` after user "deploy" auth (V18). All 7 V-entries committed-not-deployed.
2. **Outstanding from prior sessions**: H-bis ProClinic strip, hard-gate Firebase claim, /audit-all pre-release.

## V-entry index (locked in `.claude/rules/00-session-start.md` § 2)

| V# | Pattern | AV |
|---|---|---|
| V42 | Multi-writer-sweep at 3-level qty multiplier | — |
| V43 | Denormalized-flag freeze → overlay + migration | AV21 |
| V44 | Canonical-mapper bypass → adopt + dual-read | AV22 |
| V45 | Silent-dedup drops user intent → OR-merge | AV23 |
| V46 | Denormalized-cache poisons new writes → live-resolve | AV24 |
| V47 | Display-layer multi-reader-sweep → grouping helper | AV25 |
| V48 | Rule O UNIVERSAL extension to all stock writers | AV26 |

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-08 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=1442301, prod=c92f924 — 7 commits ahead)
3. .agents/active.md (366 V34-V48 unit + 698 e2e GREEN)
4. .claude/rules/00-session-start.md (iron-clad A-O + V-summary; NEW Rule O)
5. .agents/sessions/2026-05-08-v42-to-v48-class-of-bug-saga.md

Status: master=1442301, prod=c92f924, V42-V48 LOCAL only (NOT deployed)
Next: deploy combined V42-V48 if user says "deploy" (V18)
Outstanding:
- V42-V48 vercel --prod (V18)
- H-bis ProClinic strip · hard-gate Firebase claim · /audit-all
Rules: NEW Rule O (stock productId-only-identity + live-resolve productName); V18 deploy auth never rolls over; AV20-AV26 invariant set COMPLETE
/session-start
```
