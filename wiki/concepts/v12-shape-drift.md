---
title: V12 shape-drift bug class
type: concept
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [v-entry, bug-class, schema, lessons]
source-count: 0
---

# V12 shape-drift bug class

> When a shape changes (a writer migrates fields, or a new schema lands), every reader of that shape becomes a bug-magnet until swept. The V12 lesson — "grep ALL readers BEFORE touching the writer; update every reader in the SAME commit; add per-reader regression test exercising both old + new shape" — recurs across the project.

## The original V12 (2026-04-24)

`6bda5d2` fixed the quotation→sale converter (writer) by switching from flat `items: [...]` to grouped `items: {promotions, courses, products, medications}` — to match the SaleTab readers. Shipped without surveying ALL readers. 8 minutes later: SalePrintView.jsx:54 crashed on `(s.items || []).map(...)` — `.map` on an object. Bug.

Recovery: `git revert 6bda5d2` → fixed the writer + ALL readers + `tests/salePrintView.test.jsx` SPV1-8 in ONE commit. Plus discovered Phase 13.4 DF Payout Report had been silently broken since shipping for the same reason.

Lesson locked: any shape-change commit must include a grep line in the message listing the readers surveyed, and every reader file referenced must appear in the diff.

## Recurrence pattern

The class recurs whenever the writer/reader symmetry is broken — not just within a session, but across phase boundaries:

### Phase 17.2-quinquies (2026-05-05) — TFP cache leaks across branches
Phase 17.0 BS-9 cache-reset effect cleared 4 of 5 modal caches on branch switch but missed `buyItems` + `buyCategories`. Same shape-mismatch class — Phase 17.0 author thought they covered all caches; missed two related state variables.

Fix: extend BS-9 effect to include both missed slots + drop `length>0` short-circuits in modal openers as defense-in-depth + add `SELECTED_BRANCH_ID` to form-data useEffect deps. Tests Q1-Q5 lock the new cache list at the source-grep level so future cache slots can't be missed.

### Phase 17.2-septies (2026-05-05) — TFP reader field-name fix
Phase BS V2 (2026-05-04) wrote canonical `be_products` / `be_courses` schema (`productType` / `productName` / `categoryName` / `mainUnitName` / `courseName` / `salePrice` / `courseCategory` / `courseProducts`). TFP filter+map sites kept reading legacy ProClinic-mirror names (`type` / `name` / `category` / `unit` / `price`). Phase 17.2-quinquies removed the cache short-circuit that was hiding the empty-modal symptom.

Live preview_eval against PROD: 178 ยา + 17 OTC + 12 สิ้นเปลือง products at นครราชสีมา. ALL had `productType` populated, ZERO had `type` field. TFP filter `p.type === 'ยา'` returned 0 of 178. Shape drift unswept since Phase BS V2.

Fix: every modal opener filter + map uses canonical-first fallback — `(p.productType || p.type)`, `p.productName || p.name`, `p.mainUnitName || p.unit`, `p.categoryName || p.category`. Same shape for course: `c.courseName || c.name`, `c.salePrice ?? c.price`, `c.courseCategory || c.category`, `c.courseProducts || c.products`. Audit S1.x source-grep tests forbid bare-legacy reads.

### Phase 17.2-octies (2026-05-05) — `isCourseUsableInTreatment` shape-aware
Phase 16.7-quinquies-ter (2026-04-29) introduced `isCourseUsableInTreatment` filter assuming flat-shape `c.qty` parsing. Call site at TFP:1982 passes the GROUPED-shape output from `mapRawCoursesToForm` (`c.products[]`). Standard qty-tracked grouped courses got rejected (`if (!qtyStr) return false`). asdas dasd at นครราชสีมา had 3 IV Drip courses with remaining 8/89/26 — all rejected by the filter → courses panel empty.

Fix: helper accepts both shapes. When `Array.isArray(c.products) && c.products.length > 0`, returns true iff any product has remaining > 0 (with total > 0 parity guard for zero-total data corruption). Flat-shape parse preserved as fallback.

## The pattern: how to NOT introduce another V12

When making a shape change:

1. **Pre-grep all readers** — `grep -n '<field-name>' src/ tests/` BEFORE touching the writer. If 5+ readers, the change is a multi-commit job, not a single-line edit.
2. **Update ALL readers in the SAME commit** — partial fixes are worse than no fix (asymmetric crash).
3. **Add per-reader regression test exercising BOTH shapes** during the transition — then drop the legacy assertion ONCE all writers + readers stabilize.
4. **Source-grep regression bank locks the post-fix shape** — the V21 lesson reminds us source-grep tests can encode broken behavior, but they can also lock-in CORRECT behavior. Use grep to forbid legacy patterns from reappearing.
5. **Fallback chain is a transition tool, not a forever pattern** — `(canonical || legacy)` reads are V12 mitigations during migration; remove them after the next shape audit confirms the legacy data is gone.

## Cross-references

- Concept: [Iron-clad rules A-L](iron-clad-rules.md) — Rule I (full-flow simulate) catches V12 instances at sub-phase end; Rule K (work-first-test-last) prevents premature lock-in
- Source: `.claude/rules/v-log-archive.md` — V12, V11, V13, V14, V21, V32 all relate to the same class

## History

- 2026-05-05 — Created. Distilled from V12 (orig) + Phase 17.2-quinquies/septies/octies (recurrence). V-entries themselves live in `.claude/rules/v-log-archive.md` per Karpathy schema rule "V-entries are NOT sources".
