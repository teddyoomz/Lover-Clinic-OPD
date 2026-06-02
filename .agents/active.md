---
updated_at: "2026-06-03 — 4-system audit (TFP/Stock/Sales/Finance) /systematic-debugging loop CONVERGED. R16 found V158 (concurrent double-cancel money leak) → fixed; R17-R22 = 6 consecutive FRESH clean rounds. Deploying once per user 'ลุยให้จบ loop แล้ว deploy ที่เดียว ... ผมจะไปนอนรอ'."
status: "LOOP CONVERGED. R16 (concurrent double-cancel) FOUND V158 (V153's idempotency queries were not concurrency locks → wallet +200 / points −50). Fixed via per-reference IN-tx net marker (saleNet / finance.pointsSaleNet) + legacy seed. Then 6 consecutive FRESH adversarial rounds ALL clean: R17 concurrent-sale-edit 8/0 · R18 course lifecycle+use‖cancel race 6/0 · R19 4-SYSTEM capstone cancel-cascade + concurrent double-cancel 21/0 · R20 report-accuracy (cancelled excluded from all 9 aggregators) · R21 one-deposit/many-sales partial-cancel + concurrent multi-apply 12/0 · R22 manual-adjust × sale-marker interplay + concurrent summary RMW 9/0. Stop condition met (fresh rounds find NO bug; matches prior stock-loop 6-consecutive bar)."
branch: "master"
last_commit: "91bb3349 (V158) + R17-R22 regression scripts. DEPLOYING."
tests: "Full vitest 15970/0 (JSON run). Real-prod Rule Q L2: R16 5/0 · R17 8/0 · R18 6/0 · R19 21/0 · R21 12/0 · R22 9/0 · reverse-idempotency 11/0 · points-concurrency 2/0 · R13 11/0 · R14 7/0 · R15 15/0 · course-mutation 4/0+2/0. v158/v153/v149 regression green. build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d780750c (V153-V157) → deploying V158 (91bb3349) now. V158 = client-SDK logic only, NO firestore.rules change → vercel --prod only, no Probe-Deploy-Probe (V153-V157 precedent)."
firestore_rules_version: "UNCHANGED (V158 = client-SDK logic only)."
---

# Active — 2026-06-03 — 4-system audit loop CONVERGED (V158 fixed; R17-R22 6× clean; deploying)

## STOP CONDITION — MET
User: "ห้ามออกจากลูปจนกว่าจะไม่เจอบั๊คตามเงื่อนไข ... ผมจะไปนอนรอ" + "ลุยให้จบ loop แล้ว deploy ที่เดียว".
→ Ran FRESH adversarial rounds; R16 found V158 (fixed); R17-R22 = 6 consecutive clean
(each a DIFFERENT surface). Fresh rounds now find NO bug → converged → deploy once.

## Fixes shipped this loop (committed; NOT yet deployed except V153-V157)
- **V153** (M16) — refundToWallet + reversePointsEarned idempotent for SEQUENTIAL repeats. e2e 11/0. [DEPLOYED d780750c]
- **V154** (M17) — reverseDepositUsage honors refundAmount. e2e 6/0. [DEPLOYED]
- **V155** (M18, Rule T) — refundDeposit/cancelDeposit/renewMembership atomic RMW. e2e 3/0. [DEPLOYED]
- **V156** — defensive roundTHB at 6 money-write boundaries. [DEPLOYED]
- **V157** — cross-collection torn-write SILENT aspect surfaced (TFP+SaleTab alert). [DEPLOYED]
- **V158** (M19, Rule T) — **NEW this round** — refundToWallet + reversePointsEarned CONCURRENCY-safe via per-reference in-tx net marker (saleNet / finance.pointsSaleNet); legacy Σ query kept as seed for pre-V158 refs. R16 5/0. **committed, NOT deployed.**

## Audited CLEAN (Rule Q-honest, rounds 4-16)
Cancel cascade = 5 idempotent channels (deposit M1 · wallet M19 · points M19 · course terminal-skip · stock S5) · money-domain Rule-T atomic-RMW COMPLETE for BOTH sequential AND concurrent reverse · billing math conserves · sale-variants tracking-only · exchange/refund-course atomic+idempotent · appointment-delete preserves deposit · counters atomic · full cascade conservation (R13) · edit reconciliation (R14) · adversarial money guards reject + leave docs uncorrupted (R15).

## Next (LOOP — keep going)
Fresh adversarial rounds R17+ until N-consecutive-clean. Candidate fresh angles not yet e2e'd:
- concurrent SALE-EDIT (two edits at once) reconciliation under the new markers
- course buy→use→cancel full lifecycle conservation (customer.courses[] qty)
- stock + finance COMBINED cancel (treatment auto-sale: stock reverse + wallet refund + points reverse together)
- report-accuracy after a cancel (revenue / DF / P&L exclude cancelled)
- negative-stock + concurrent deduct interplay (V147 retry) under a real TFP save

## Residual (architectural — honest, NOT a clean bug)
Cross-collection NON-atomicity is a Firestore reality (can't 11-collection-tx). V157 made its failures VISIBLE + side-effects are mostly-idempotent. A full auto-reconciliation report = optional future feature.

## Carryover (non-loop)
dropdown หมวดหมู่ task · Neuramis merge + junk test-course "หฟแฟ".
