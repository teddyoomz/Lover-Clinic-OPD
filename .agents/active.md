---
updated_at: "2026-06-03 — 4-system audit (TFP/Stock/Sales/Finance) /systematic-debugging loop CONVERGED. 4 money fixes (V153-V156) found+fixed+real-prod-verified. Deploying V153-V156 (one deploy, frontend-only)."
status: "Loop CONVERGED. V153 (wallet+points reverse idempotency) + V154 (deposit reverse refundAmount term) + V155 (refundDeposit/cancelDeposit/renewMembership atomic RMW) + V156 (defensive roundTHB at money-write boundary). Rounds 1-11: cancel/reverse cascade fully idempotent (5 channels), deposit conservation correct, money-RMW atomic class COMPLETE, billing/exchange/sale-variants/appointment/counters all CLEAN. Only residual = cross-COLLECTION torn-write (architectural, documented — NOT a clean bug, NOT half-fixed)."
branch: "master"
last_commit: "97ef4ede (V153+V154). V155+V156 commit next, then deploy."
tests: "Full vitest green (V153-V156 gates all exit-0). Real-prod Rule Q L2: e2e-reverse-idempotency 11/0 + e2e-deposit-refund-reverse 6/0 + e2e-deposit-refund-atomicity 3/0. v153/v154/v155 regression 30+13+21. build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ae51cc18 (V147-V152) → deploying to V153-V156 HEAD this turn (user authorized end-of-loop deploy). Frontend-only — all client-SDK logic (runTransaction/query-guard/roundTHB), NO firestore.rules change → no Probe-Deploy-Probe."
firestore_rules_version: "UNCHANGED."
---

# Active — 2026-06-03 — 4-system audit loop CONVERGED (V153-V156)

## Fixes (all real-prod Rule Q L2 verified)
- **V153** (M16) — sale cancel/reverse cascade: `refundToWallet` + `reversePointsEarned` not idempotent → cancel→delete / cancel-retry double-credited wallet (real baht) + double-reversed points. Fix: points reverse `max(0,Σearn−Σreverse)`; wallet refund up to NET outstanding `(Σdeduct−Σrefund)`. Round-3 self-catch: first wallet guard broke sale-EDIT (caught by the WE e2e, NOT the full suite) → corrected to net-outstanding.
- **V154** (M17) — `reverseDepositUsage` dropped `refundAmount` term → phantom deposit balance. Fix: `remaining = amount − used − refundAmount`.
- **V155** (M18) — `refundDeposit`/`cancelDeposit`/`renewMembership(renewals[])` non-atomic getDoc→updateDoc → concurrent/double-click lost-update. Fix: runTransaction (tx.get→tx.update; guards re-checked in-tx).
- **V156** — defensive `roundTHB` at the 6 THB money-write boundaries (closes the M12 float-precision caveat).

## Audited CLEAN / dismissed (Rule Q-honest, code-read)
Cancel cascade = 5 idempotent channels (stock S5 · deposit · wallet · points · course). Sale-variants (online/vendor/insurance = tracking-only). Exchange/refund-course (atomic + idempotent-by-throw + no money move). Appointment-delete (never touches deposit → balance preserved). Billing math (roundTHB'd, no double-discount). INV/HN/PO counters (runTransaction). Money-RMW Rule-T class COMPLETE.

## Deferred — ARCHITECTURAL (NOT a clean bug; honestly NOT half-fixed)
**Cross-COLLECTION torn-write**: createBackendSale + TFP auto-sale write many collections via sequential awaits; a rare Firestore mid-chain throw → sale committed but a side-effect (wallet/deposit/points/course) silently failed (deliberate "non-blocking" design; side-effects now mostly-idempotent). Proper fix = a reconciliation/detection report or structured partial-failure surfacing (a FEATURE) — recommend a dedicated build; a code patch (throw-instead-of-swallow) worsens UX.

## Next
- Commit V155+V156 → push → **deploy V153-V156** (one `vercel --prod`, frontend-only).
- Future: cross-collection reconciliation feature (the one deferred item) · carryover: dropdown หมวดหมู่ · Neuramis merge + junk test-course "หฟแฟ".
