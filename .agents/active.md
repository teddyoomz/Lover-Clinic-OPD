---
updated_at: "2026-05-08 EOD — V42-V48 class-of-bug 7-round saga ARCHITECTURALLY CLOSED + AV20-AV26 invariant set complete"
status: "master=1442301 · prod=c92f924 (V42-V48 NOT yet deployed) · 698 verification points GREEN · build clean"
branch: "master"
last_commit: "1442301"
tests: 366
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = `1442301` · prod = `c92f924` (V42 + V43 + V44 + V45 + V46 + V47 + V48 ALL pending deploy)
- 366/366 V34-V48 unit + 166/166 comprehensive prof e2e + 70/70 V44 + 39/39 V43 + 29/29 V46 + 28/28 V47 e2e = **698 verification points GREEN**
- 2 poisoned batches migrated on prod via V46 backfill (LC-26000006 PRP/Stapple cluster) + 3 customer.courses[] entries restamped via V43 backfill — both audit-doc'd

## What this session shipped
Detail: `.agents/sessions/2026-05-08-v42-to-v48-class-of-bug-saga.md`

- V42 promo bundle qty multiplier (4 writer sites)
- V43 skipStockDeduction live-resolve overlay + direct-product flag + Rule M migration (applied: 3 entries on LC-26000006)
- V44 course-buy product-name source fix (TFP adopt canonical mapper + dual-read defensive)
- V45 dedup-shadow OR-merge at beCourseToMasterShape:3193 (14 affected courses on prod)
- V46 Rule O — productName live-resolve at movement write (3 _deductOneItem sites + 2 poisoned batches migrated)
- V47 CustomerDetailView course grouping — display parity with TFP (NEW class: display-layer multi-reader-sweep)
- V48 Rule O UNIVERSAL extension to ALL stock-write sites (7+) + prof-grade 59-test bank covering 10 categories (property-based + cross-branch + adversarial + idempotency + forward/backward-compat + class-of-bug universal)
- AV20-AV26 audit invariant set COMPLETE (locks entire class permanently)
- NEW iron-clad Rule O in `.claude/rules/00-session-start.md`

## Next action
**Deploy** — `vercel --prod` after user "deploy" auth (V18). All 7 V-entries committed-not-deployed. Migration data ops applied where needed (V43 + V46); V44/V45/V47/V48 are forward-defense.

## Outstanding (user-triggered)
- 🚨 V42-V48 `vercel --prod` (V18 — explicit "deploy" THIS turn)
- H-bis ProClinic full strip (deferred from prior sessions)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass (recommended before next big release)
