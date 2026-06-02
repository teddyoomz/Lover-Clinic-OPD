# 2026-06-03 — 4-system audit loop (TFP/Stock/Sales/Finance) CONVERGED + V158 DEPLOYED

## Summary
`/systematic-debugging` (ultrathink) 3-part loop — audit the 4-system money relationships → fix every bug → stop only when a fresh round finds nothing. R16 found **V158** (concurrent double-cancel money leak — V153's idempotency was a query, not a concurrency lock); fixed via per-reference in-tx net markers; then R17-R22 = 6 consecutive FRESH clean rounds → converged → deployed once (user: "ลุยให้จบ loop แล้ว deploy ที่เดียว").

## Current State
- master `c31248ed`; prod **`91bb3349` (V158) LIVE** @ lover-clinic-app.vercel.app (vercel --prod aliased; client-SDK only → no Probe-Deploy-Probe, V153-V157 precedent). Was d780750c.
- Full vitest **15970/0**; build clean.
- Money domain (deposit M1/M17 · wallet M5/M16/M19 · points V149/M19 · course V148 · stock S5/V147-V152) atomic-RMW COMPLETE for **sequential AND concurrent** reverse.
- Loop stop-condition MET: R16 found a bug; R17-R22 = 6 consecutive clean (matches prior stock-loop bar).
- Working tree clean.

## V158 (M19, Rule T) — the bug + fix
- **Bug**: `refundToWallet` (Σdeduct−Σrefund) + `reversePointsEarned` (Σearn−Σreverse) computed "outstanding" via a QUERY OUTSIDE the tx → idempotent for SEQUENTIAL repeats (cancel→delete) but NOT a concurrency lock. 2 CONCURRENT cancel cascades on one sale (double-click / 2 admins) both read the pre-state → wallet over-refunded **+200 baht (re-spendable)** + points over-reversed **−50**. (V153 EXPLICITLY documented "not a concurrency lock" — that comment WAS the latent bug.)
- **Fix**: per-reference NET marker stored ON the doc — `saleNet[refId]` (wallet) / `finance.pointsSaleNet[refId]` (customer). `deductWallet`/`_earnPointsInternal` increment it += amt IN their existing tx; `refundToWallet`/`reversePointsEarned` read it IN their tx (outstanding = marker, decrement by amount) → Firestore OCC serializes; the 2nd reverse re-reads the decremented marker → reverses 0. The old Σ query is kept ONLY as a LEGACY SEED for pre-V158 refs (no marker). Edit-safe (deduct re-increments the net).

## Commits
```
c31248ed V158 DEPLOYED — loop converged, prod now carries the concurrent-double-cancel fix
ef9150c8 4-system audit loop CONVERGED — R17-R22 (6 consecutive fresh clean rounds) + regression artifacts
91bb3349 V158 (M19, Rule T) — wallet refund + points reverse CONCURRENCY-safe via per-reference in-tx net marker
```

## Files touched
- `src/lib/backendClient.js` — `_earnPointsInternal` (maintain pointsSaleNet in-tx) · `reversePointsEarned` (in-tx marker dedup + legacy seed) · (wallet `deductWallet`/`refundToWallet` saleNet from prior turn).
- `tests/v158-concurrent-reverse-marker.test.js` (NEW, 14/0) · `tests/v149-points-atomicity.test.js` + `tests/v153-reverse-idempotency.test.js` (V21 fixups).
- `.claude/skills/audit-money-flow/{checklist.md,SKILL.md}` (M19) · `.claude/rules/00-session-start.md` (V158 V-entry).
- `scripts/e2e-r16..r22` (NEW real-prod e2e) · `scripts/e2e-reverse-idempotency.mjs` (PE harness faithful).
- `.agents/active.md` · `SESSION_HANDOFF.md` (+ archived 16 oldest blocks → session-handoff-archive.md, handoff 224→183 KB).

## Loop rounds (all real-prod Rule Q L2)
- R16 concurrent double-cancel → **FOUND V158** → 5/0 after fix.
- R17 concurrent sale-EDIT under markers 8/0 · R18 course buy→use→cancel→delete + use‖cancel race 6/0 · **R19 4-system capstone** (stock+deposit+wallet+points+course cancel-cascade + concurrent double-cancel) **21/0** · R20 report-accuracy code-audit (cancelBackendSale writes `status='cancelled'` → ALL 9 aggregators filter it; saleReport totals exclude cancelled rows) · R21 one-deposit/many-sales partial-cancel + concurrent multi-apply 12/0 · R22 manual-adjust × sale-marker interplay + concurrent summary RMW 9/0.
- Regression re-runs green: reverse-idempotency 11/0 · points-concurrency 2/0 · R13 11/0 · R14 7/0 · R15 15/0 · course-mutation 4/0+2/0.

## Decisions (1-line; full reasoning in V158 V-entry / v-log-archive.md)
- Per-reference on-doc net marker + in-tx read = the canonical concurrency-safe reverse (legacy Σ query → seed only). Rule T family (V147/V148/V149/V155/V158).
- PE e2e harness made faithful: re-earns via real `earnPoints` (maintains marker), not raw `addEarnTx` — mirrors a legacy sale edited post-V158.
- V21 fixups lock the INVARIANT not the literal shape (v149: in-tx tx.update + `'finance.loyaltyPoints': a`; v153: fnBody window 4400 + in-tx marker short-circuit).
- Deployed once at loop end (V158 = client-SDK only → vercel-only, no Probe-Deploy-Probe).

## Next todo
- IDLE — loop converged + deployed + verified. Await user direction.
- Carryover (non-loop, low-pri): dropdown หมวดหมู่ task · Neuramis merge + junk test-course "หฟแฟ".
- Optional future feature (not a bug): cross-collection partial-failure auto-reconciliation report (builds on V157 surfacing).
- Maintenance debt (flag): SESSION_HANDOFF.md `## Current State` head ~154 KB (accumulating dated bullets duplicating session blocks) — trim old bullets to get the file < 150 KB (archived blocks already done; head-trim deferred — risky at EOD).

## Resume Prompt
Resume LoverClinic — continue from 2026-06-03 EOD. Read CLAUDE.md → SESSION_HANDOFF.md (master c31248ed, prod 91bb3349) → .agents/active.md (15970 tests) → .claude/rules/00-session-start.md → this checkpoint. Status: loop CONVERGED + V158 DEPLOYED LIVE. Next: idle / await direction. No deploy without "deploy" THIS turn (V18). /session-start
