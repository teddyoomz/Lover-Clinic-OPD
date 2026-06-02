# 2026-06-02 EOD+4 — Stock adversarial-hunt loop (V147-V152 + R16-R21) — CONVERGED + DEPLOYED

## Summary
`/systematic-debugging` 3-part LOOP directive ("find novel stock bugs → fix → repeat until a fresh round finds nothing"). Found + fixed **6 real bugs (V147-V152), all one family** (non-atomic read-modify-write / stale-plan race) → codified as NEW iron-clad **Rule T**. Then ran **6 consecutive CLEAN verification rounds (R16-R21)** on real prod (Rule Q L2) across every distinct stock surface — ZERO new app bugs (every "finding" was my own test-assumption error, corrected to confirm the app is right). Loop converged; all V147-V152 DEPLOYED LIVE.

## Current State
- master = prod = `ae51cc18` LIVE @ lover-clinic-app.vercel.app (`vercel --prod`, frontend-only, NO rules change → no Probe-Deploy-Probe).
- All V147-V152 fixes + R16-R21 regression scripts committed + pushed + deployed.
- Full vitest **15898/0**; build clean. Each fix: source-grep test + audit invariant (S32-S35, AV177, AV178).
- Negative-stock from TFP/sale CONFIRMED INTACT (R16.4/R17.1/R18.3/R20.3 + earlier 18/0 comprehensive).
- iron-clad **Rule T** added (`.claude/rules/01-iron-clad.md`); V147-V152 one-liners in `00-session-start.md` § 2.

## The 6 fixes (all in `src/lib/backendClient.js` except V150 in `stockUtils.js`)
- **V147** (S32) — `_deductOneItem` reads candidate batches OUTSIDE the per-batch tx, plans from a stale snapshot; a race-time shortfall bypassed the negative-stock fallback → raw "Batch raced" throw failed the whole save. Fix: bounded retry loop (`STOCK_RACE_RETRY`).
- **V148** (AV177) — `customer.courses[]` getDoc→mutate→updateCustomer with NO tx → concurrent course ops lost-update (over-credit). Fix: shared `_mutateCustomerCoursesAtomic` (runTransaction) routed through 8 writers.
- **V149** (AV178) — `finance.loyaltyPoints` getDoc→setDoc(ledger)→updateDoc with NO tx → points lost/over-credited. Fix: earn/deduct/reverse in runTransaction + in-tx over-spend re-check.
- **V150** (S33) — `pickNegativeTargetBatch` could pick a CANCELLED/EXPIRED lot as the negative-debt carrier (a "dispensed expired" MOPH-audit violation). Fix: candidate filter excludes cancelled/expired/hasExpired.
- **V151** (S34) — cancelling a sale/treatment whose lot V144 already auto-deleted → `_reverseOneMovement` threw "vanished" → whole cancel FAILED + stock never returned. Fix: re-create the vanished lot from movement metadata (`_recreatedByReverse`).
- **V152** (S35) — concurrent central-PO receive → DOUBLE stock (idempotency checkpoint read `receivedLineIds` via getDoc OUTSIDE tx). Fix: a runTransaction CAS CLAIMS the lineIds before any batch is built; finalize is also a merge-CAS. (The documented AUDIT-V34 "deferred concurrent-receive gap".)

## The 6 verification rounds (R16-R21 — real-prod Rule Q L2, all CLEAN)
- **R16** (17/0) reverse conservation — concurrent double-reverse credits ONCE (S5 in-tx CAS holds); negative-debt reverse → 0; nonexistent product silent-skips (V36-bis, not fail-loud).
- **R17** (10/0) single-batch contention — V147 retry + negative-allowance + cross-op (deduct↔adjust↔adjust) serialization on ONE batch.
- **R18** (16/0) multi-lot FEFO span + ledger-replay conservation (S16 time-travel) + V144 0-lot-delete + V151 reverse-recreate interaction.
- **R19** (10/0) edit path (reverse-old + deduct-new): qty up/down, product swap, edit-to-same, re-edit-after-V144-clear.
- **R20** (10/0) cross-branch isolation — deduct at A never touches B; negative carrier branch-scoped; movement branchId stamped.
- **R21** (12/0) transfer/withdrawal concurrent double-receive — status-CAS gate (loser throws Invalid transition), ONE dest batch, conservation. Empirically confirms the "never vulnerable" code-read.

## Commits
```
ae51cc18 docs(agents): EOD 2026-06-02 EOD+4 — stock loop CONVERGED
010bb24c test(stock): R21 transfer/withdrawal double-receive CAS
027a396e test(stock): R20 cross-branch isolation
47edcd42 test(stock): R19 edit-path conservation
7783f3ea test(stock): R18 multi-lot FEFO + ledger conservation
fe382e3c test(stock): R17 single-batch contention
8352f73f test(stock): R16 reverse conservation
82170c99 fix(stock): V152 central-PO receive CAS claim + S35
8a95f7ec fix(stock): V151 reverse re-creates a VANISHED lot (S34)
ab0080e4 fix(stock+points): V149 points-RMW atomic (AV178) + V150 neg-carrier excl expired (S33)
9d80ab63 fix(courses): V148 atomic customer.courses[] RMW (AV177, Rule T)
baf933a5 fix(stock): V147 concurrency-race retry in _deductOneItem (S32)
```
(V147-V150 deployed mid-session; V151+V152 + R16-R21 + active.md deployed at EOD+4.)

## Files touched
- src/lib/backendClient.js (V147/V148/V149/V151/V152) · src/lib/stockUtils.js (V150)
- tests/v147..v152-*.test.js (6 source-grep banks) + V21 fixups (course-skip-stock-deduction, v36-treatment-skip-fail-loud, phase16.5-source-grep, v34-stock-invariants, phase15.2-central-po-flow-simulate)
- scripts/e2e-stock-*.mjs (R1-R21 real-prod probes; R16-R21 new this convergence sweep)
- .claude/rules/01-iron-clad.md (Rule T) · .claude/rules/00-session-start.md (V147-V152 § 2) · .claude/skills/audit-stock-flow/{SKILL.md,checklist.md} (S32-S35) · .agents/skills/audit-anti-vibe-code/SKILL.md (AV177, AV178)

## Decisions (1-line; full reasoning → v-log-archive.md V147-V152, unwritten)
- A non-atomic read-modify-write of a concurrent-mutation-prone Firestore doc MUST be a transaction (Rule T) — courses/points/stock were the missed instances; wallet/deposits/counters were already atomic.
- A multi-batch FIFO allocator that reads the candidate SET outside the tx must RETRY+RE-PLAN on a race (a stale-plan in-tx guard is a USER throw → Firestore won't auto-retry it).
- An idempotency guard that READS its checkpoint outside a tx is NOT concurrency-safe — claim the checkpoint IN a CAS before the side-effecting work.
- A reverse must be robust to a vanished lot (re-create, never throw-and-lose) — V144 deletes 0-lots the reverse still needs.
- The negative-debt carrier must be an ACTIVE non-expired lot (or a synthetic), never expired/cancelled.
- A real-prod e2e (not a code-read) is what closes a "documented-deferred" gap — the V152 "safe" code-read was wrong.

## Next todo
- Loop converged — no further rounds warranted (6 clean; every R16-R21 finding was a test-assumption error). Next session idle on stock OR pick a carryover.
- Carryover: dropdown หมวดหมู่ task (3rd original ask, not started; be_product_groups empty → source = distinct categoryName, brainstorm needed) · V-log-archive verbose V147-V152 entries unwritten (00-session-start one-liners suffice to recognize) · Neuramis merge + junk test-course "หฟแฟ" (deferred data).

## Resume Prompt
Resume LoverClinic — continue from 2026-06-02 EOD+4. Stock concurrency loop CONVERGED + all V147-V152 DEPLOYED. Read CLAUDE.md → SESSION_HANDOFF.md (master=prod=ae51cc18 LIVE) → .agents/active.md → .claude/rules/00-session-start.md. Next: idle on stock; carryover = dropdown หมวดหมู่ task / V-log V147-V152 verbose / Neuramis merge. /session-start
