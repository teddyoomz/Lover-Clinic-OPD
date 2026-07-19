# Checkpoint 2026-07-19 EOD+1 — Tail sweep + /audit-all final + VIP sort + wheel guard — SHIPPED + DEPLOYED LIVE

> User: "ทำที่เหลือให้หมด" + "sort ลูกค้า vip" → "/audit-all รอบสุดท้าย แก้ 100%" → "ช่องเงินห้าม scroll, ช่องจำนวน ±1 (รวม TFP ทุกช่องราคา)" → "deploy".
> master `2610a1a6` = prod (vercel `lover-clinic-kbqgmhp8h` aliased lover-clinic-app.vercel.app 200; **rules UNCHANGED → vercel-only, no Probe-Deploy-Probe**; post-deploy ping 200 + backfill straggler re-run 0).
> FINAL: full vitest **17,777/17,777 · 0 fail** + build clean + Playwright wheel-guard 2/2 + AV209 L2 17/0.

## Summary
Closed every remaining backlog item, ran the final /audit-all (238 invariants — clean), shipped 2 user-requested
features (VIP-first sort + app-wide number-input wheel guard), deployed, and healed prod data (courseId backfill).

## Current State
- **AV209 irreducible tail CLOSED**: all course-row writers stamp per-row `crs-<ts>-<i>-<rand>` courseId
  (assignCourseToCustomer ×2 branches + resolvePickedCourseInCustomer + addPicksToResolvedGroup which now
  STRIPS the template sibling id from its spread — a copied id = ambiguous byId). Rule M backfill `crsbf-`
  stamped ALL 523 identity-less prod rows / 123 customers (per-doc runTransaction vs live writers; idempotent
  re-run 0 both before AND after deploy; audit `av209-courseid-backfill-*`). Real-prod rows resolve byId to
  their own index (diag 15/15 + 12/12); AV209 L2 e2e 17/0 re-run. AV209 SKILL.md follow-up (both copies, SY1).
- **/audit-all final**: full vitest (deterministic layer) + 2 Explore agents (Tier 1-2 / Tier 3-7 grep,
  ≤2-agent cap per memory lock) → **0 CRITICAL/HIGH/MEDIUM**. Fixed: fb webhook verify_token now masked (A4).
  Refreshed 6 stale audit-skill docs: C3 (treatment-delete-no-stock-reverse = SANCTIONED design per user
  directive in BackendDashboard:~556) · C5 (`_clearLinkedTreatmentsHasSale` EXISTS, 2 call sites) · F3
  (be_stock_batches V144 remaining==0 narrow delete) · UC2 (gold superseded 2026-07-04) · AN4 (V78 admin-SDK
  plain-object regex) · clone-sync RETIRED + api-layer RESCOPED (V50). Agent findings adjudicated first-hand
  (V162): refuted FF9 (billDiscount input = type=number), UC1 phone-red (call-button design), TZ2 (allowance).
- **Wheel guard** (`src/lib/wheelGuard.js` + App.jsx): ONE global capture non-passive listener, SAFE-BY-DEFAULT
  (V54) — untagged `<input type=number>` = blur-on-wheel (typed value untouched; LocalInput blur also COMMITS;
  covers every money field incl. ALL TFP price/discount/deposit/wallet/pay/% via {...rest} spread, zero per-site
  edits, future inputs born safe); `data-wheelable` (22 qty inputs / 12 files) = wheel steps EXACTLY ±1
  (clamped min/max; step attr untouched so typed decimals stay valid). TFP = ZERO wheelable (usage-qty locked too).
- **VIP sort**: "👑 VIP ก่อน" chip in CustomerListTab meta row + NEW `useVipIds()` (stable EMPTY set outside
  provider — AV202-inert). Stable VIP-first sort from the SAME real-time VipProvider set as the gold badges
  (id = proClinicId || id, mirrors CustomerCard). L1 real Chrome: 9/9 VIP ids first + amber chip + Q-vis.
- BranchesTab card + search dual-read `settings.phone/address` (V51 canonical).
- Cron first night: retention audit doc correctly absent (first run tonight 03:20 BKK); warmup ping ttfb
  0.66-1.24s (cold floor killed). `scripts/diag-cron-first-night.mjs` = the recurring checker.

## Commits (all deployed at `2610a1a6`)
```
915e79f4 fix(av209-tail): per-row courseId stamps + Rule M backfill 523 prod rows
191a56ee fix(branches): settings.phone/address dual-read (V51)
6e29dcbf feat(customers): VIP-first sort toggle
a3328c10 fix(audit-all): fb verify_token mask + 6 stale audit-skill docs
2610a1a6 feat(inputs): global wheel guard (money block / qty ±1)
```

## Files Touched
src/lib/{wheelGuard.js NEW, VipContext.jsx, backendClient.js} · src/App.jsx ·
src/components/backend/{CustomerListTab, BranchesTab, CourseFormModal, QuotationFormModal, StockAdjustPanel,
StockSeedPanel, StockTransferPanel, StockWithdrawalPanel, OrderPanel, CentralStockOrderPanel, VendorSalesTab,
PickProductsModal}.jsx · src/components/treatment-form/{TfpBuyModal, TfpItemModals}.jsx · api/webhook/facebook.js ·
scripts/{av209-backfill-course-row-courseid, diag-av209-backfill-verify, diag-cron-first-night}.mjs NEW ·
tests/{av209-course-row-courseid-stamp.test.js, vip-sort-customer-list.test.jsx, number-input-wheel-guard.test.jsx,
e2e/wheel-guard.spec.js} NEW · audit-skill SKILL.md ×6 (both copies)

## Decisions (1-line each)
- Per-ROW courseId (not per-purchase) — mutators target product rows; grouping keys don't use courseId for named rows (V47-safe).
- Backfill prefix `crsbf-` disjoint from purchased-/pick-/exchange-/be-course-/legacy- sentinel namespaces.
- Wheel guard safe-by-DEFAULT (untagged = blocked) — money can never be forgotten; qty opts IN.
- Wheel = ±1 via handler; step attr untouched (typed decimals + validation semantics preserved).
- TFP usage-qty left UNTAGGED (course-deduct path = money-adjacent).
- Tool lesson (re-proven): Chrome-MCP `scroll` = scroll gesture, emits ZERO wheel events (logger) — trusted-wheel
  testing REQUIRES Playwright `page.mouse.wheel` (AV205); preview-pane rAF-dead freezes CSS transitions mid-flight.

## Next Todo
1. พรุ่งนี้เช้า: `node scripts/diag-cron-first-night.mjs` (retention คืนแรก — คาด eligible 0).
2. User L1 stack: wheel guard บนเครื่องจริง · VIP sort · AV209 course ops · buy modal · TFP retry escape ·
   TFP เครื่องช้า · mobile cold-start · AV205 · push · reports-home.

## Resume Prompt
Resume LoverClinic — 2026-07-19 EOD+1. Tail sweep + audit-all final (clean) + VIP sort + wheel guard —
master `2610a1a6` = prod LIVE (vercel-only; ping 200). Full vitest 17,777/0 + Playwright 2/2 + backfill 523 done.
Next: retention-cron first-night check + user L1 stack.
Read CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md → 00-session-start.md → this checkpoint.
