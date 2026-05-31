---
updated_at: "2026-05-31 EOD+1 — V138 negative-batch status-flip FIX: complete + verified, UNCOMMITTED/HELD in working tree."
status: "V138 code done + full-verified but NOT committed/deployed (gated — user ran /session-end without authorizing commit). prod UNCHANGED = 409804fc."
branch: "master"
last_commit: "06e0fca8 (V135/V136/V137 EOD docs) + this EOD docs commit on top. V138 SOURCE is uncommitted in working tree."
tests: "This session: tests/v138-* 34/0 + v34-stock-invariants 61/0 (V21 fixup) + targeted stock suite 426/0 + FULL vitest 15276/0 (695 files) + build clean + TRUE-L2 real-prod e2e 12/0 (scripts/e2e-negative-batch-directions.mjs)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "409804fc LIVE (V135/V136/V137). V138 NOT deployed."
firestore_rules_version: "UNCHANGED — V138 is frontend/lib only (no rules/storage/index/cron → frontend-only deploy, no Probe-Deploy-Probe)."
---

# Active Context — V138 negative-batch status invariant (2026-05-31 EOD+1)

## State
- `/systematic-debugging` + Rule P. Bug: ปรับเพิ่ม stock ติดลบ → batch หายจากยอดคงเหลือ. Root cause = `afterRemaining <= 0 ? DEPLETED` flipped a still-negative batch to depleted → excluded from `status:'active'` balance query + unrepayable.
- **V138 FIX DONE + FULLY VERIFIED but UNCOMMITTED/HELD** (4 mod + 4 new in working tree). prod unchanged 409804fc.
- Anti-negative guard (user: ติดลบได้แค่ TFP + การขาย) = verified ALREADY-correct structurally (no code change); locked with AV158 + tests.

## What this session shipped (detail → checkpoint 2026-05-31-v138-negative-batch-status-invariant.md)
- **Code**: NEW `resolveBatchStatusForRemaining(remaining)` in `stockUtils.js` (`=== 0 → depleted; <0 OR >0 → active`) → wired 6 sites in `backendClient.js` (createStockAdjustment ปรับเพิ่ม=บั๊คหลัก + deduct-loop + negative-push + transfer-export + withdrawal-export + _repayNegativeBalances). `_reverseOneMovement` revive-only = sanctioned. Enables "บวกติดลบทีละนิด" (−13→−12→…→0).
- **Heal (Rule M, dry-run only)**: `scripts/heal-negative-batch-wrongly-depleted.mjs` — 3 prod batches wrongly depleted (Augmentin −91, คอนฟอร์ม 2 นิ้ว −3, E.P.T.Q S500 −12 @ นครราชสีมา). `--apply` GATED.
- **Diag (Rule R)**: `scripts/diag-negative-batch-wrongly-depleted.mjs`.
- **Tests**: `tests/v138-negative-batch-status-invariant.test.js` (34: helper + all-direction flow-sim + source-grep + anti-negative matrix) + v34 V21 fixup (slice→next-export) + **AV158**.
- **e2e**: `scripts/e2e-negative-batch-directions.mjs` (TRUE-L2 real prod 12/0 — ปรับเพิ่ม −13→−12 stays active+VISIBLE in StockBalancePanel query; ปรับลดบล็อก; TFP+sale ติดลบได้).

## Next action
Idle / await user. When authorized: heal `--apply` → commit V138 source → `vercel --prod`.

## Outstanding user-triggered actions
- **Heal `--apply`** (Rule M mutation, dry-run passed = 3 batches) — flip depleted→active so E.P.T.Q S500 ฯลฯ กลับมาโผล่ในยอดคงเหลือ. Say "heal"/"apply".
- **Commit + push** V138 source (4 mod + 4 new — frontend/lib + tests/scripts).
- **Deploy** (frontend-only, no rules → no Probe-Deploy-Probe; V18 needs "deploy").
- L1 hands-on prod (after deploy+heal): ปรับเพิ่ม batch ติดลบ → ยอดคงเหลือ −12 ไม่หาย.
- Pre-existing (large, NOT deploy-gating): extended-suite 280 stale tests.
