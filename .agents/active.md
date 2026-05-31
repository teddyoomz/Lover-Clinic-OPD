---
updated_at: "2026-05-31 EOD+4 — V142 (+V140/V141) DEPLOYED 8c3a9047 + healed; V142-bis (single-save verify + serialization extract) done, held."
status: "V142+V140+V141 DEPLOYED LIVE (8c3a9047) + heals applied (V141 109; V142 no-op self-corrected). V142-bis (create-flow single-save proven on real prod + IIFE extracted) committed-pending. Full vitest 15364/0."
branch: "master"
last_commit: "fff79e32 (deployed-state docs). V142-bis source (treatmentBuyHelpers + TFP + 4 tests + e2e) HELD uncommitted. prod code = 8c3a9047."
tests: "Full vitest 15364/0. V142 unit 20/0 + L2 e2e 10/0; V142-bis unit 8/0 + L2 single-save e2e 7/0 (buy+deduct+charge+meds: course 1/1→0/1, stock 10→9, sale 2140); v101 18/0 (real helper, no replica) + v104 13/0. Build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "8c3a9047 LIVE (V138+V139 + V140+V141+V142). V142-bis = behavior-identical refactor (not yet deployed; optional)."
firestore_rules_version: "UNCHANGED — V142 frontend/lib only (no rules/storage/index/cron → no Probe-Deploy-Probe)."
---

# Active Context — V142 (2026-05-31 EOD+4) — SHIPPED + DEPLOYED

## State
- `/systematic-debugging` on a user-reported course-deduction bug (real prod LC-26000115 / BT-1780203508072). DONE + verified by **real-prod L2** (the bug was reproduced AND the fix verified with the SHIPPED `assign/deduct/reverse` functions — NOT mocks/simulate, addressing the exact Rule-Q-honest failure the user was furious about).
- UNCOMMITTED/HELD on top of the held V140 + V141 (3 features in the working tree).

## What this session fixed (detail → checkpoint 2026-05-31-v142-course-deduct-edit-resave-symmetry.md)
- **Root cause**: edit-RESAVE reverse/re-deduct ASYMMETRY. On a 2nd+ save, `handleSubmit` reverses the prior course deduction (`oldPurchased`) but the fresh re-deduct serialization comes up EMPTY for purchased courses (in-session `purchased-…` rowIds regenerate to `be-row-N` → Pass-1 miss; productId stripped → Pass-2 skip; rem=0 → Pass-2 gate). Refund-without-rededuct → balance reverts to full. (Audit kept the stale "0/1"; customer.courses showed "1/1".)
- **Fix**: NEW `buildReDeductListWithCarryForward` (treatmentBuyHelpers.js) re-applies every reversed deduction still selected → reverse + re-deduct symmetric. TFP wires both sites, create-mode bypassed. **AV163**.
- **Stock parallel**: investigated, NOT affected (gated by `hasStockChange` + `_resolveProductIdByName`).

## V142-bis (same session) — single-save create flow verified + serialization extracted
- User follow-up: "ทดสอบ ซื้อคอร์สใน TFP ที่เพิ่งสร้าง + ตัดคอร์สเลย + คิดเงิน + เอายากลับบ้าน ในกดบันทึกครั้งเดียว … ดูจำนวนที่เหลือทุกอย่าง". The CREATE (single-save) path is distinct from the edit-resave (V142).
- Extracted the V101 two-pass courseItems IIFE VERBATIM → `buildCourseItemsForSave` (treatmentBuyHelpers.js) so the create-flow serialization is testable (behavior-identical; deployed 8c3a9047 has the inline IIFE = same logic → re-deploy NOT required). 2 V21 fixups (v104 SG3 + v101 A1/A2/A5; v101 replica → real-helper adapter).
- **`tests/v142-bis-*` 8/0** + **TRUE-L2 `scripts/e2e-v142bis-single-save-buy-deduct-charge-meds.mjs` 7/0** on real prod: คอร์ส Testoviron 1/1→0/1 (ตัดจริง) · Talafil สต็อก 10→9 · ใบขาย 2,140 · audit kind=use 1. **Empirical**: real-prod BT-1780203508072 CREATE save DID deduct → the create path was never the bug; the revert was the 2nd/edit save (V142).
- Full vitest **15364/0** + build clean.

## Heal outcomes (Rule M, applied)
- **V141 visitReasons: APPLIED 109 customers** (audit `v141-heal-visit-reasons-…eff2805c`).
- **V142 course balances: 0 healed (correct)** — LC-26000115's 3 courses are already `0/1`: a 2nd treatment **BT-1780214479261** (~15:01) re-deducted them (the bug had reverted them to full so staff re-used them in a new treatment). LC-26000009 (Shock-Wave promo ×N) = ambiguous → manual review (untouched). ⚠ FLAG for user: BT-1780214479261 may be a duplicate-of-BT-1780203508072 to review (clinical call; NOT auto-deleted).

## Next action
Idle / await user. master ahead of prod by V142-bis (behavior-identical). REMAINING: commit V142-bis + L1 hands-on + (optional) review BT-1780214479261 duplicate.

## Outstanding user-triggered actions
- **L1 hands-on** (prod): buy course in TFP → ตัด → คิดเงิน → เอายากลับบ้าน → กดบันทึกครั้งเดียว → course deducts; + edit→save again → stays deducted. (V140 chat-scroll 50+ thread + lightbox; V141 intake visit-reason — healed.)
- **(optional) Review BT-1780214479261** (LC-26000115 possible duplicate treatment from the bug window).
- **(optional) re-deploy** V142-bis (behavior-identical to live — only if you want the cleaner extracted code in prod).
- Pre-existing (large, NOT deploy-gating): extended-suite 280 stale tests.
