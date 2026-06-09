---
updated_at: "2026-06-09 EOD+1 — V162: TFP buy critical-path — qty-multiply divergence + per-purchase rowId/remove collision (course+promo). Committed + pushed, NOT deployed."
status: "Both user-reported buy/sale bugs root-caused on the served code + fixed class-wide (Rule P) + regression-tested + real-browser L1 verified. master ahead of prod; awaiting explicit 'deploy' (frontend-only, vercel-only)."
branch: "master"
last_commit: "2d13c980 — V162 (fix: TFP buy qty-multiply + per-purchase purchaseUid for rowId/courseId/grouping/remove — course+promo)."
tests: "default vitest 16300/0 (16277 + 23 new bank) + build clean + extended treatmentBuyHelpers 54/54 + 8 affected runnable 217/217 + Rule Q L1 real-browser served-module (display ×3 + displayEqualsPersist + distinct rowIds + checkbox-independent + targeted remove). NOT re-run at EOD."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "Vercel prod = e56d2ac7. master ahead (b8351546 4-fix + 10e2c266 docs + V162). frontend-only, no firestore.rules → vercel-only, no Probe-Deploy-Probe."
firestore_rules_version: "UNCHANGED."
---

# Active — 2026-06-09 EOD+1 — V162: TFP buy qty-multiply + per-purchase rowId/remove collision

## State
- master ahead of prod `e56d2ac7`. Tree clean after V162 commit+push. NOT deployed.
- The buy/sale critical path: both user bugs fixed class-wide (course AND promo); verified on the REAL Vite-served module in the browser.

## What this session shipped (checkpoint: .agents/sessions/2026-06-09-tfp-buy-qty-and-rowid-collision.md)
- **Bug #1 qty divergence**: `buildPurchasedCourseEntry` now multiplies sub-product remaining/total by `buyQty` → DISPLAY === SALE === PERSIST (`resolvePurchasedCourseForAssign`). Was display 1× / bill N×.
- **Bug #2 collision**: per-purchase `purchaseUid` threaded through courseId + every rowId + grouping + `removePurchasedItem` targeting → same course bought twice = independent checkboxes + targeted delete. Promo path fixed identically (Rule P). Consumables carry purchaseUid too.
- AV190 + new bank `course-buy-qty-multiply-and-rowid-uniqueness` (23) + 4 V21 fixups (extended BPCE).

## Next action
- IDLE / await direction. If "deploy" → `vercel --prod` (no rules) → then L1 hands-on.

## Outstanding user-triggered actions
- **deploy** (vercel-only) to ship V162 — then L1: buy a course qty 3 (panel shows N×, bill matches) · buy same course twice → tick one (other unticked) · delete one (other stays).
- **Pre-existing (flagged, spawned task)**: `npm run test:extended` = 283/4699 fail — V50-deleted AppointmentTab/MasterDataTab/CloneTab still referenced by 46 stale extended RTL tests (since 2026-05-08). Opt-in suite, NOT the tracked baseline; unrelated to V162.
