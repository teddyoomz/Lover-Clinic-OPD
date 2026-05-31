# 2026-05-31 EOD+1 — V138 negative-batch status invariant + anti-negative verify

## Summary
`/systematic-debugging` + Rule P. User: ปรับเพิ่ม stock ที่ติดลบ (เช่น E.P.T.Q S500 −13 +1) → สินค้า **หายจากหน้ายอดคงเหลือ** (movement log ถูก). Root cause = stock writers used `afterRemaining <= 0 ? DEPLETED : ACTIVE` → a still-negative batch (−12) flipped to `depleted` → excluded from StockBalancePanel's `status:'active'` query + from `_repayNegativeBalances` (compounding). Fixed via single-source helper; verified the anti-negative guard (ติดลบได้แค่ TFP + การขาย) is already structurally correct + locked it. **Code complete + FULLY verified but UNCOMMITTED/HELD** (user ran /session-end without authorizing commit/heal/deploy).

## Current State
- master HEAD = this EOD docs commit (on `06e0fca8`); prod UNCHANGED = `409804fc` LIVE.
- V138 source = **uncommitted** in working tree: 2 mod (`stockUtils.js`, `backendClient.js`) + 1 mod test (`v34-stock-invariants.test.js` V21 fixup) + 1 mod (`audit-anti-vibe-code/SKILL.md` AV158) + 4 new (`tests/v138-*`, `scripts/{diag,heal,e2e}-...`).
- Full vitest **15276/0** (695 files) + build clean + TRUE-L2 real-prod e2e **12/0**.
- Rule R diag: 3 prod batches wrongly depleted (Augmentin −91, คอนฟอร์ม 2 นิ้ว −3, E.P.T.Q S500 −12 @ นครราชสีมา). Heal dry-run = 3; `--apply` GATED.
- Anti-negative guard = NO code change (already correct); enforced by AV158 + tests.

## Commits
```
(none for V138 source — held/gated)
EOD docs commit only: docs(agents): EOD 2026-05-31 EOD+1 — V138 negative-batch status-flip fix (DONE+verified, held)
```

## Files Touched (V138 — all uncommitted/held)
- `src/lib/stockUtils.js` — NEW `resolveBatchStatusForRemaining(remaining)` (=== 0 → depleted; else active)
- `src/lib/backendClient.js` — wired helper at 6 sites (createStockAdjustment, _deductOneItem ×2, transfer export, withdrawal export, _repayNegativeBalances); removed all `<= 0 ? DEPLETED`
- `tests/v138-negative-batch-status-invariant.test.js` — NEW (34: unit + all-direction flow-sim + source-grep + anti-negative matrix)
- `tests/v34-stock-invariants.test.js` — V21 fixup (slice→next-export boundary, 2.1+7.1)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV158
- `scripts/diag-negative-batch-wrongly-depleted.mjs` — NEW (Rule R)
- `scripts/heal-negative-batch-wrongly-depleted.mjs` — NEW (Rule M two-phase, dry-run passed)
- `scripts/e2e-negative-batch-directions.mjs` — NEW (TRUE-L2 real prod 12/0)

## Decisions (1-line each)
- Single-source helper `resolveBatchStatusForRemaining` (Rule C1 — was inline at 6+ sites) > 4 one-word edits → greppable + AV-enforceable.
- Invariant: negative remaining = active DEBT (must stay visible); only `=== 0` = depleted. (line 7730 + repay were already correct.)
- Anti-negative guard NOT changed — `_deductOneItem` has only 2 callers (treatment+sale), both already negative-allowed; all other paths throw via deductQtyNumeric+guard. Locked, not rewritten.
- `_reverseOneMovement` revive-only branch = sanctioned exception (never newly-depletes).
- Held uncommitted (matches EOD+4 precedent) — user gated commit/heal/deploy.

## Next Todo (user-triggered)
1. Heal `--apply` (Rule M) — 3 batches depleted→active so E.P.T.Q S500 ฯลฯ reappear in ยอดคงเหลือ.
2. Commit + push V138 source.
3. Deploy (frontend-only, no rules/storage → no Probe-Deploy-Probe; V18 needs "deploy").
4. L1 hands-on prod: ปรับเพิ่ม batch ติดลบ → ยอดคงเหลือ −12 ไม่หาย.

## Resume Prompt
Resume LoverClinic — continue from 2026-05-31 EOD+1. V138 fix DONE+verified but UNCOMMITTED/HELD in working tree. Read CLAUDE.md · SESSION_HANDOFF.md (master=docs-HEAD, prod=409804fc) · .agents/active.md · this checkpoint. When user authorizes: heal `--apply` → commit V138 source → vercel --prod. No deploy without "deploy" THIS turn (V18).
