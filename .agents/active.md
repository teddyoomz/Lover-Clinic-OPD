---
updated_at: "2026-06-03 — 4-system audit (TFP/Stock/Sales/Finance) /systematic-debugging loop ONGOING. R16 found V158 (CONCURRENT double-cancel money leak) → fixed. Loop continues toward multiple-consecutive-clean (user: 'ห้ามออกจากลูปจนกว่าจะไม่เจอบั๊ค ... deploy ที่เดียว')."
status: "LOOP ONGOING. Round-16 (concurrent double-cancel) FOUND V158 — V153's idempotency QUERIES were not concurrency locks → 2 concurrent cancels double-refunded wallet (+200 real baht) + over-reversed points (−50). Fixed via per-reference IN-tx net marker (saleNet / finance.pointsSaleNet) + legacy-seed for pre-V158 refs. R16 now 5/0. Loop must keep finding-fixing until N consecutive FRESH rounds are clean (stock-loop bar ~6). Deploy ONCE at loop end."
branch: "master"
last_commit: "(V158 about to commit) — prior d780750c (V153-V157)."
tests: "Full vitest 15970/0 (JSON run). Real-prod Rule Q L2: e2e-r16-concurrent-double-cancel 5/0 + e2e-reverse-idempotency 11/0 + e2e-points-concurrency 2/0 + e2e-r13-cancel-cascade 11/0 + e2e-r14-edit-reconciliation 7/0 + e2e-r15-adversarial-guards 15/0. v158/v153/v149 regression green. build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d780750c — V153-V157 LIVE. V158 NOT yet deployed (deploy-once at loop end). prod currently carries the concurrent-double-cancel gap (rare race; batched into the end-of-loop deploy per user 'deploy ที่เดียว')."
firestore_rules_version: "UNCHANGED (V158 = client-SDK logic only)."
---

# Active — 2026-06-03 — 4-system audit loop ONGOING (R16 → V158 fixed; loop continues)

## STOP CONDITION (user, verbatim)
"ห้ามออกจากลูปจนกว่าจะไม่เจอบั๊คตามเงื่อนไข ห้ามหยุด ทำไปเรื่อยๆ ผมจะไปนอนรอ" +
"ลุยให้จบ loop แล้ว deploy ที่เดียว". → Keep running FRESH adversarial audit rounds;
fix every bug found; stop ONLY when a fresh round finds NO bug AND multiple
consecutive rounds are clean (stock-loop bar ≈ 6). THEN deploy once.

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
