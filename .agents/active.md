---
updated_at: "2026-05-08 — V46 Rule O productName live-resolve + 4th-round skip-stock-deduction class CLOSED architecturally + 524 verification points GREEN"
status: "master=PENDING (V46 commit drafting) · prod=c92f924 (V42-V46 ALL pending deploy) · 220 V42-V46 cumulative unit + 524 e2e assertions · build clean · 2 poisoned batches migrated on prod"
branch: "master"
last_commit: "PENDING (V46 commit drafting); V45 chain at 22ac0a9"
tests: 220
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = PENDING (V46 commit drafting); V45 chain at 22ac0a9 already pushed
- prod = c92f924 — V42-V46 ALL pending deploy
- V46 fix: NEW `_resolveProductNameLive(productId)` helper + 3 callsites in `_deductOneItem` (positive FIFO + negative-overage + AUTO-NEG batch creation) — productName always sourced from be_products live read
- Migration applied on prod: 2 poisoned batches restamped (BATCH-...-m33s Stapple no 22 + BATCH-...-z1oh Neuramis Deep) — audit doc `be_admin_audit/v46-backfill-stock-batch-product-name-...`
- **NEW Iron-clad Rule O** in `.claude/rules/00-session-start.md` § 1: productId is THE only identity for stock; productName MUST be live-resolved at write time
- **NEW AV24 audit invariant** in `audit-anti-vibe-code/SKILL.md`
- 220/220 V42-V46 cumulative unit tests pass
- **524 e2e verification points GREEN**: 166/166 comprehensive prof + 70/70 V44 + 39/39 V43 + 29/29 V46 live + 220 unit
- Build clean

## What this session shipped (V46 — 4th round skip-stock class CLOSED)
- **Diag** (`scripts/v46-diag-treatment-trace.mjs`): traced exact treatment BT-1778169734111 + linked sale + movements; pinpointed the architectural gap at `_deductOneItem:6889+6952` (movement.productName from b.productName denorm cache)
- **Source fix** at `src/lib/backendClient.js`:
  - NEW `_resolveProductNameLive(productId)` helper with per-call cache (line ~6270)
  - Positive FIFO movement: `productName: liveName || item.productName || b.productName || ''`
  - Negative-overage movement: `productName: liveNameNeg || item.productName || b.productName || ''`
  - AUTO-NEG batch creation: `productName: liveProductName || item.productName` (prevents poisoning at source)
- **Migration** (`scripts/v46-backfill-stock-batch-product-name.mjs`): Rule M two-phase. Applied on prod — 2 poisoned batches restamped + forensic `_v46ProductNameBackfilledAt/_v46ProductNameBackfilledFrom` + audit doc
- **Tests**: 20 V46.A-F groups in `tests/v46-rule-o-live-product-name.test.js` (helper definition + caching + positive FIFO + negative overage + AUTO-NEG creation + Rule I full-flow with poisoned-batch USER REPORT REPRO + V12 sweep)
- **Live e2e** (`scripts/e2e-v46-rule-o-batch-name-resolution.mjs`): 29/29 PASS — actual Firestore writes with poisoned batches across 2 current + 1 future branches; verified persisted movement.productName = canonical (NOT poisoned)
- **Iron-clad Rule O**: productId = ONLY identity; productName = live-resolved at write time. batch.productName = display cache only. Fallback chain: `liveName || item.productName || batch.productName || ''` (NEVER course-name).
- **AV24 invariant**: source-grep regression locks the contract; auditable via grep patterns.
- **V46 V-entry** in `00-session-start.md` § 2 (above V45)

## Class-of-bug skip-stock-deduction (4-round saga ARCHITECTURALLY CLOSED)
| Round | V-entry | Layer fixed | Audit invariant |
|---|---|---|---|
| 1 | V43 | Denormalized customer.courses[i] frozen flag | AV21 |
| 2 | V44 | TFP buy fetcher bypassed canonical mapper | AV22 |
| 3 | V45 | Canonical mapper silent dedup-shadow | AV23 |
| **4** | **V46** | **Stock movement productName from poisoned batch denorm — Rule O live-resolve** | **AV24** |

Iron-clad **Rule O** is the architectural backstop: regardless of how many other layers exist, the FINAL stock-movement write goes through live-resolve. Even if a future bug poisons some intermediate cache, the movement record stays canonical.

## Next action
**1) Deploy V42-V46** — `vercel --prod` after user "deploy" auth (V18). Rolling deploy of all 5 fixes:
   - V42 promo bundle qty (4 writer sites)
   - V43 skipStockDeduction live-resolve + direct-product flag + Rule M migration applied
   - V44 course-buy product-name source fix
   - V45 dedup-shadow OR-merge
   - **V46 productName live-resolve at movement write + 2 poisoned batches migrated**

**2) Live verification post-deploy** (optional): admin reproduces user's exact scenario via TFP buy "ขลิบไร้เลือด (เบอร์22) 1 ครั้ง" + treatment + verify movement log shows "Stapple no 22" (not course name) and SKIP for "ขลิบไร้เลือด" (course-skip from V45 OR-merge).

## Outstanding (user-triggered, none blocking unless deploy)
- 🚨 V42 + V43 + V44 + V45 + V46 `vercel --prod` (V18)
- H-bis ProClinic full strip (deferred)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass
