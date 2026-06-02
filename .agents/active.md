---
updated_at: "2026-06-02 EOD+4 — Stock adversarial-hunt LOOP: V147-V152 (6 concurrency/atomicity fixes) + R16-R21 (6 consecutive CLEAN verification rounds → loop CONVERGED). V147-V150 DEPLOYED; V151+V152 local."
status: "Loop CONVERGED. 6 real bugs found+fixed (V147-V152, all read-outside-tx RMW / atomicity family → iron-clad Rule T). 6 fresh adversarial rounds (R16-R21) across all distinct stock surfaces found ZERO new app bugs (every 'finding' was MY test-assumption/filter error, corrected to confirm the app is right). Stop condition met."
branch: "master"
last_commit: "010bb24c (R21 regression). All V147-V152 + R16-R21 committed + pushed."
tests: "Full vitest 15898/0 (after V152). Every fix: source-grep test + audit invariant. Every round R16-R21: real-prod Rule Q L2 e2e green (17+10+16+10+10+12 = 75 prod assertions, zero orphans). build clean. NOT re-run at session-end."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ab0080e4 (V147+V148+V149+V150) DEPLOYED LIVE this session. V151 (8a95f7ec) + V152 (82170c99) committed+pushed but NOT deployed — frontend-only, await the single end-of-night deploy."
firestore_rules_version: "UNCHANGED — all V147-V152 are client-SDK logic (runTransaction/CAS) fitting existing rules. NO rules change → no Probe-Deploy-Probe."
---

# Active — 2026-06-02 EOD+4 — Stock adversarial-hunt loop (CONVERGED)

## The loop (user /systematic-debugging directive: find novel stock bugs → fix → repeat until a fresh round finds nothing)

### Fixes shipped (V147-V152 — all ONE family: non-atomic read-modify-write / stale-plan race; backstopped by NEW iron-clad **Rule T** = atomic RMW for concurrent-mutation-prone Firestore docs)
- **V147** (S32) — `_deductOneItem` multi-batch FIFO: listStockBatches→allocate→tx ran with a stale plan under contention → wrong deduction. Fix: retry loop (`_DEDUCT_MAX_ATTEMPTS=6`, `STOCK_RACE_RETRY`). DEPLOYED.
- **V148** (AV177) — `customer.courses[]` getDoc→modify→updateDoc (lost-update on concurrent course ops). Fix: `_mutateCustomerCoursesAtomic` runTransaction; routed deduct/reverse/addQty/assign/resolve/exchange/cancel. DEPLOYED.
- **V149** (AV178) — `finance.loyaltyPoints` RMW (over-credit/over-spend race). Fix: runTransaction earn/deduct/reverse + in-tx over-spend re-check. DEPLOYED.
- **V150** (S33) — `pickNegativeTargetBatch` could pick a CANCELLED/EXPIRED lot as the negative carrier. Fix: candidate filter excludes them. DEPLOYED.
- **V151** (S34) — cancel a sale/treatment whose lot V144 already auto-deleted → reverse threw → whole cancel FAILED + stock never returned. Fix: `_reverseOneMovement` RE-CREATES the vanished lot (`_recreatedByReverse`). LOCAL.
- **V152** (S35) — concurrent central-PO receive → DOUBLE stock (read-outside-tx idempotency gap, the documented AUDIT-V34 "deferred" one). Fix: a `runTransaction` CAS CLAIMS the lineIds before any batch is built; finalize merge-CAS. LOCAL.

### Verification rounds (R16-R21 — 6 CONSECUTIVE CLEAN, real-prod Rule Q L2, every distinct stock surface)
- **R16** reverse conservation — concurrent double-reverse credits ONCE (S5 in-tx CAS holds); negative-debt reverse clears to 0; nonexistent product silent-skips (V36-bis). 17/0.
- **R17** single-batch contention — V147 retry + negative-allowance + cross-op (deduct↔adjust) serialization. 10/0.
- **R18** multi-lot FEFO span + ledger-replay conservation (S16 time-travel) + V144 0-lot-delete + V151 reverse-recreate interaction. 16/0.
- **R19** edit path (reverse-old + deduct-new): qty up/down, product swap, edit-to-same, re-edit-after-V144-clear. 10/0.
- **R20** cross-branch isolation — deduct at A never touches B; negative carrier branch-scoped; movement branchId stamped. 10/0.
- **R21** transfer/withdrawal concurrent double-receive — status-CAS gate (loser throws), ONE dest batch, conservation. EMPIRICALLY confirms the "never vulnerable" code-read. 12/0.

**Negative-stock from TFP/sale CONFIRMED INTACT** (user's key ask): R16.4 + R17.1 + R18.3 + R20.3 + earlier 18/0 comprehensive.

## Next action
- **DEPLOY V151 + V152** (frontend-only, no Probe-Deploy-Probe) — user said "จะ deploy ทีเดียว" (deploy once at the end). User-triggered.
- Loop is converged — no further rounds warranted (6 clean; every R16-R21 "finding" was a test-assumption error, strong signal the app is correct).

## Outstanding (user-triggered, carryover from EOD+3)
- Deploy V151+V152 · dropdown หมวดหมู่ task (3rd original ask, not started) · V-log-archive verbose entries (V147-V152) unwritten · Neuramis merge + junk test-course "หฟแฟ" (deferred data).
