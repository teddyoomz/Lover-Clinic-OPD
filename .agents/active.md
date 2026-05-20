---
updated_at: "2026-05-20 EOD+1 — Sales+Finance sub-tabs + Backend Menu D customer-detail bug fixes (dup header + recall modal flicker) SHIPPED LOCAL (awaiting deploy)"
status: "✅ Sub-tabs + 2 Menu-D bug fixes + AV98 · Rule Q L1 structural-verified on real prod · LOCAL ONLY · awaiting user 'deploy' + L1 hands-on"
branch: "master"
last_commit: "(this session) fix(backend-menu-d): customer-detail dup header + recall modal flicker — pushed"
tests: "134 NEW GREEN (sales 32 + finance/cross-wiring 82 + menu-D bugfix 20) · full vitest 13642 PASS / 24 pre-existing FAIL (all unrelated) / 25 skip · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0511be1e LIVE (V43-followup) — sub-tabs NOT yet deployed"
firestore_rules_version: "unchanged (idempotent — both features UI-only, no rules/data)"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = origin (clean, all pushed). Sales + Finance sub-tabs = LOCAL ONLY. Prod still on `0511be1e` (V43-followup).
- Both features UI-only (client-side split over already-loaded lists) — no backend / no Firestore rules / no data ops / no BSA change / no handler change.

## What this session shipped

- **Sales cancelled sub-tab** (SaleTab) — การขาย (non-cancelled, default) / ยกเลิกแล้ว (status=cancelled). Helper `src/lib/saleSubTabFilter.js`. Spec + plan in docs/superpowers/.
- **Finance finished-deposit sub-tab** (DepositPanel under tab=finance → มัดจำ) — ใช้งานอยู่ (active+partial, default) / สิ้นสุดแล้ว (used+cancelled+refunded+expired). Helper `src/lib/depositSubTabFilter.js`. Scoped status dropdown per pill (active→3 opts / finished→5 opts). Spec + plan in docs/superpowers/.
- Both: pill row + subTab state + handleSubTabChange (reset filter on switch) + split-first useMemo + per-pill empty states. Active|partial = usable matches codebase getDepositBalance convention.
- **Comprehensive cross-wiring test bank (114 NEW tests)**: helper units (sale 15 + deposit 18) · flow-simulate + source-grep + UI mirrors (sale 17 + finance 22) · cross-wiring routing (sale 8 + deposit 11 — TFP auto-sale + Frontend booking-pair both default to active/usable, source-grep grounded against real createBackendSale/createDeposit/createDepositBookingPair/applyDepositToSale) · stress mulberry32 (10 — 1200 fixtures, 10k perf <50ms, NFC/NFD/NUL/concurrent) · e2e user simulation (13 — full sessions both + branch isolation).

## Rule Q V66 L1 verification (real browser, real prod, read-only)

- **Sales** (verified earlier this session): active 2 ชำระแล้ว + dropdown w/o ยกเลิก; cancelled 9 + dropdown hidden; round-trip resets filter.
- **Finance** (verified this batch on นครราชสีมา): ใช้งานอยู่ = 3 rows (all ใช้งาน) + scoped dropdown 3 opts (ทุกสถานะ/ใช้งาน/ใช้บางส่วน); สิ้นสุดแล้ว = 1 row (ใช้หมด) + scoped dropdown 5 opts (ทุกสถานะ/ใช้หมด/ยกเลิก/คืนเงิน/หมดอายุ) + filterStatus reset; round-trip back to 3 active + 3-opt dropdown + reset. (3+1=4 deposits.)
- (Coordinate clicks intercepted by mega-menu overlay → verified via real React onClick element.click() + DOM eval read-back.)

## Reactivity ("ไม่ต้อง refresh จอ") — verified, no listener needed

- DepositPanel `loadList()` fires after save/cancel/refund/delete/booking (lines 492/522/546/555/861/897); SaleTab `loadSales()` after create/cancel/delete. Both re-mount on tab navigation. Sub-tab split re-computes over fresh data → migration without F5. NO stale-data gap found → NO onSnapshot listener added (user chose verify-first / YAGNI).

## Backend Menu D — customer-detail bug fixes (2026-05-20, /systematic-debugging)

Two new-menu-mode-only bugs reported on the customer detail page:
- **Bug #1 dup header**: BackendDashboard viewing-customer breadcrumbSlot rendered Frontend/Branch/Theme/Profile UNCONDITIONALLY while BackendTopBarNew renders them too → 2× branch/theme/profile. Fix: gate those controls `menuMode==='classic'` (matches sibling non-customer branch). Live-confirmed before (branch 2 / profile 2 / theme 4) → after (branch 1 / profile 1 / theme 2).
- **Bug #2 recall modal flicker→freeze**: V86 auto-glow (`index.css:3909-3933`) applies `:hover{transform:translateY(-3px)}` to rounded cards in new-menu backend-content; RecallCard's rounded-xl wrapper became the containing block for the `fixed inset-0` recall modals rendered as its descendants → confine to box + self-sustaining hover-feedback flicker → repaint-storm freeze. Fix: portal RecallCreate/Edit/Outcome/Snooze modals to `document.body` (user chose KEEP V86 lift). Live-confirmed: modal `parentIsBody=true`, no animated ancestor.
- **Root-cause method**: live preview eval (modal ancestor chain → found `animation:v86-breath` on RecallCard wrapper) + index.css read (`:hover{transform}`). NOT a React loop (no "Maximum update depth"), NOT double-mount (modalCount=1). Preview is headless 11px so visual flicker can't be seen — structural root cause provably eliminated.
- **AV98** invariant: fixed modal rendered inside a glow card MUST `createPortal(document.body)`. Sanctioned: tab/page-root modals (CDV AddQty/Exchange/Timeline + SaleTab/DepositPanel) — not inside a glow card. Tests `tests/recall-modal-portal-and-header-dedup.test.js` (20) + 2 V21 fixups.

## Next action

- Idle — sub-tabs + Menu-D fixes done LOCAL. Await user "deploy" (Vercel; Firebase rules unchanged → V15 combined optional) + L1 hands-on.

## Outstanding user-triggered actions

- **Deploy** sales + finance sub-tabs + Menu-D bug fixes — say "deploy". NOT deployed this turn (V18).
- **L1 hands-on** (user's real ~2000px screen — preview is headless 11px so can't show the visual): (a) customer detail in new menu → header shows ONE branch/theme/profile; (b) click Recall → "ตั้ง Recall ใหม่" opens as a proper centered overlay, NO flicker/freeze, hover anywhere stable; (c) sub-tab pills on `/?backend=1&tab=sales` + `&tab=finance&subtab=deposit`.
- **31/24 pre-existing test failures** — all confirmed unrelated (backend-menu-d ×4 / v36 deductStockForSale / rp1 SaleTab IIFE line 1228 / tf3 / phase-26-0 / audit-branch-scope AV37 / phase-17-1 flake / v81-emulator gaxios env). Separate cleanup batch when desired.
- **V106 stock-movement 30-day retention** — brainstorm locked; spec NOT written; awaiting "ship V106".
