---
updated_at: "2026-06-03 — 4-system audit (TFP/Stock/Sales/Finance) /systematic-debugging loop CONVERGED + DEPLOYED. V153-V157 (5 money-integrity fixes) LIVE."
status: "LOOP CONVERGED + DEPLOYED. Round-12 fresh audit = 0 new concrete leaks; full suite 15956/0. 5 fixes shipped: V153 (wallet+points reverse idempotency), V154 (deposit reverse refundAmount term), V155 (deposit/membership atomic RMW), V156 (defensive money rounding), V157 (torn-write silent-aspect → side-effect failures now surfaced). Money-domain Rule-T atomic-RMW class COMPLETE; cancel cascade fully idempotent."
branch: "master"
last_commit: "d780750c (V157). Pushed + DEPLOYED."
tests: "Full vitest 15956/0 (definitive JSON run). Real-prod Rule Q L2: e2e-reverse-idempotency 11/0 + e2e-deposit-refund-reverse 6/0 + e2e-deposit-refund-atomicity 3/0. v153/v154/v155/v157 regression all green. build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d780750c — V153-V157 LIVE (vercel --prod 2026-06-03, aliased). Was ae51cc18 (V147-V152). Frontend-only — all client-SDK logic/UI, NO firestore.rules change → no Probe-Deploy-Probe."
firestore_rules_version: "UNCHANGED."
---

# Active — 2026-06-03 — 4-system audit loop CONVERGED + DEPLOYED (V153-V157)

## Fixes shipped + LIVE (5 money-integrity)
- **V153** (M16) — `refundToWallet` + `reversePointsEarned` idempotent (cancel→delete / retry double-credit). Net-based; round-3 self-catch corrected the wallet guard to net-outstanding (edit-safe). e2e 11/0.
- **V154** (M17) — `reverseDepositUsage` honors `refundAmount` (phantom balance). e2e 6/0.
- **V155** (M18, Rule T) — refundDeposit/cancelDeposit/renewMembership atomic RMW (lost-update). e2e 3/0.
- **V156** — defensive `roundTHB` at 6 money-write boundaries (M12 caveat).
- **V157** — cross-collection torn-write SILENT aspect: TFP auto-sale + SaleTab now SURFACE failed deposit/wallet/course/promo side-effects via a non-fatal alert (was console-only). V21 fixup: doctor-save GATE_WINDOW 16000→18000.

## Audited CLEAN (Rule Q-honest, rounds 4-12)
Cancel cascade = 5 idempotent channels · money-domain Rule-T atomic-RMW COMPLETE (wallet/points/deposit/courses/membership/counters all atomic) · billing math conserves · sale-variants tracking-only · exchange/refund-course atomic+idempotent · appointment-delete preserves deposit · customer-delete cascade safe · stock cost cascade atomic. **Round-12 fresh audit: 0 new concrete leaks.**

## Residual (architectural — honest, NOT a clean bug)
Cross-collection NON-atomicity is a Firestore reality (can't 11-collection-tx). V157 made its failures VISIBLE + side-effects are mostly-idempotent (retry converges). A full auto-reconciliation/compensation report = optional future feature (not a bug).

## Next (carryover — no longer loop work)
- Optional: auto-reconciliation report for cross-collection partial-failures (build on V157's surfacing).
- Pre-existing carryover: dropdown หมวดหมู่ task · Neuramis merge + junk test-course "หฟแฟ".
