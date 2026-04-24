---
updated_at: "2026-04-24 (end-of-session — Phase 12.2b marathon CLOSED)"
status: "Phase 12.2b ProClinic parity COMPLETE for all 4 course types (ระบุสินค้าฯ / บุฟเฟต์ / เหมาตามจริง / เลือกสินค้าตามจริง). 24 commits awaiting Vercel deploy."
current_focus: "Phase 12.2b closed. Next: deploy OR late-visit pick-at-treatment wiring OR Phase 15."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "84f5b0d"
tests: "3555/3555 PASS"
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "148fe0b (2026-04-24) via vercel --prod — 24 commits AHEAD (entire Phase 12.2b marathon pending)"
firestore_rules_deployed: "no change this session"
---

# Active Context

## Objective

Either deploy the 24-commit Phase 12.2b marathon OR wire late-visit
support for `เลือกสินค้าตามจริง` pick-at-treatment flow OR start
Phase 15 Central Stock Conditional per `project_execution_order.md`.

## Current State

- **master = `84f5b0d`**, 3555/3555 tests PASS, build clean.
- Phase 12.2b ProClinic parity COMPLETE for all 4 course types:
  - `ระบุสินค้าและจำนวนสินค้า` — standard (auto-populate qty on tick)
  - `บุฟเฟต์` — standard (uses same code path; no distinct branch needed)
  - `เหมาตามจริง` — one-shot, consumed in single treatment, moves to history
  - `เลือกสินค้าตามจริง` — two-step pick-at-purchase via PickProductsModal
- Net session delta: +249 tests, 19 net commits, zero deploys (user
  reverted one design iteration before approving; entire marathon
  awaits a single explicit deploy authorization).
- Preview Vite dev server still running at localhost:5173, HMR green.

## Blockers

None.

## Next Action

Pick one:

**A. Vercel deploy** — 24 commits are ready. All pass tests + build.
Command: `vercel --prod --yes`. Requires explicit user "deploy" THIS
turn.

**B. Late-visit pick-at-treatment wiring** — currently bought-but-
unpicked pick-at-treatment courses don't survive a treatment-page
close because `availableProducts` isn't persisted to `be_customers`.
Files + line-level plan in
`.agents/sessions/2026-04-24-phase12.2b-marathon-pick-at-treatment.md`
(section "Next action · B").

**C. Phase 15 Central Stock Conditional** per
`memory/project_execution_order.md`.

## Recent Decisions (this session)

1. **`เหมาตามจริง` = one-shot**. Customer course assigned with "1/1 unit"
   sentinel + courseType tag. `deductCourseItems` short-circuits (zero
   regardless of deductQty). Stock deducts from be_products via
   `productId` preserved on treatment items. Course → history after 1
   treatment.

2. **`เลือกสินค้าตามจริง` = two-step pick-at-purchase** (NOT limit-gated
   — that design shipped then reverted in-session). Buy → placeholder
   entry with `availableProducts` list. User clicks "เลือกสินค้า" →
   `PickProductsModal` → picks 1+ products + qtys → `resolvePickedCourseEntry`
   fills products[]. Course then behaves standardly (normal tick +
   remaining + stock).

3. **DF Payout Report was showing ฿0 across prod** — `it.courseId` vs
   `it.id` mismatch in aggregator. Fix: key courseIndex by BOTH,
   inference path accepts both, `itemType === 'course'` filter to avoid
   product leakage.

4. **DF % = rate × full course price × usage weight**. Weighted sum
   across treatments consuming the course = full DF (invariant).
   Baht rate ignores weight. Aggregator refactored to multi-treatment-
   per-sale array (was last-wins Map → silently dropped subsequent
   treatments).

5. **Used-up courses ≠ expired courses**. CustomerDetailView filters
   strict: active = remaining > 0; expired = date-expired only.
   Used-up courses traced via Purchase History tab. Treatment-form
   course column also filters consumed entries (was silently re-ticking
   for fill-later).

## Session commit list (19 net)

See checkpoint for full list. Key commits:
- `1744eee` syncCourses mapper
- `6a7b6d0` CourseFormModal datalist
- `8d810f4` stockConfig be_products path
- `93bcf7c` / `c84c2e1` เหมาตามจริง consume-on-use
- `c245e14` partial-usage DF weighting + 41-test scenario file
- `6e6dd00` DF Payout Report id fallback (฿0 bug)
- `f7cb8a8` (reverted) limit-gated pick-at-treatment attempt
- `967d7b2` revert of above
- `84f5b0d` two-step pick-at-purchase (CORRECT design)

## V-log status

No new V-entries this session. Rule A (bug-blast revert) exercised
successfully — limit-gated design reverted before user acceptance, no
production pollution.

## Notes

- `.claude/rules/` untouched this session.
- `MEMORY.md` index untouched — no new long-lived rules added.
- Full test suite runs clean in ~38s (99 test files, 3555 tests).
