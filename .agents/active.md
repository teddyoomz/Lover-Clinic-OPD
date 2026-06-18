---
updated_at: "2026-06-18 EOD+1 — ED Score 2-panel round compare + be_assessments backup coverage (+ be_wallets phantom fix). SHIPPED + DEPLOYED LIVE."
status: "COMMITTED + PUSHED + DEPLOYED (vercel + functions). full vitest 16756/0; build clean."
branch: "master"
last_commit: "2e19ac01 — test(backup): real-prod L2 e2e be_assessments + be_customer_wallets round-trip (9/0)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "lover-clinic-a2f1vlim5 (vercel --prod, frontend) + firebase functions deployed (sendPushOnSubmit). aliased lover-clinic-app.vercel.app HTTP 200."
firestore_rules_version: "UNCHANGED (no rules change this session → no Probe-Deploy-Probe)."
tests: "full vitest 16756/0 (this session's last run) + build clean. NOT re-run at session-end."
---

# Active — 2026-06-18 EOD+1 — ED 2-panel compare + be_assessments backup coverage (SHIPPED + DEPLOYED)

## State
- master HEAD `2e19ac01` (= origin, tree clean). prod DEPLOYED LIVE — `lover-clinic-a2f1vlim5` (vercel frontend) + functions (`sendPushOnSubmit`); aliased `lover-clinic-app.vercel.app` HTTP 200.
- full vitest **16756/0** + build clean (reused — not re-run at session-end).
- 2 features via /brainstorming → spec(html) → plan(html) → inline impl → test → adversarial Workflow → Rule R diag + Rule M cleanup + Rule Q L2 e2e → deploy.

## What this session shipped (detail → checkpoint 2026-06-18-ed-compare-and-backup-coverage.md)
- **ED Score 2-panel round compare** (`303a85af`) — `EDDetailModal` reworked into side-by-side compare (left/right swap via `useLayoutPreference('ed-compare')`, per-panel round pickers, type tabs, latest "ล่าสุด"/"วันนี้" hero badges, changed-row highlight). REMOVED the better/worse trend (user). Badges no-squeeze (flex:none + centered + nowrap). NEW pure `src/lib/edCompare.js` (`autoPickCompareRound` + `markChangedRows`). AV78 backdrop no-close. Tests: ed-compare 11/0 + ed-detail-modal 16 RTL + 5 source-grep.
- **be_assessments backup coverage** (`f9c4d36b`) — new ED `be_assessments` (2026-06-15) was missing from EVERY backup/cascade scope → V122-class drift. Added to `CUSTOMER_CASCADE_COLLECTIONS_FULL` (now 17), `CUSTOMER_ONLY_UNIVERSAL`, `branchBackupCore.UNIVERSAL`. **Single-source reconcile**: `backendClient.CUSTOMER_CASCADE_COLLECTIONS` = `…_FULL` (was a drifting inline 11) → client-delete + server-delete can't diverge. NEW drift-catcher test (D: every customerId-queried be_* ⊆ FULL ∪ allowlist). Whole-system FULL already dynamic (V122) → covered automatically.
- **be_wallets phantom fix** (same commit) — the drift-catcher immediately surfaced it: cascade listed `be_wallets` (0 docs, no rule, no accessor); the real store is `be_customer_wallets` (composite id `customerId__walletTypeId`, money-adjacent). Renamed across cascade/delete/backup/scripts → customer delete no longer ORPHANS wallet balances.
- **Rule M orphan cleanup (APPLIED)** — Rule R diag found 5 prod orphans (4 be_assessments for deleted LC-26000155 + 1 be_customer_wallets for deleted 2853). `cleanup-orphan-assessments.mjs --apply` deleted 5 + audit `cleanup-orphan-assessments-1781799289079-01e2d08b`; verified idempotent (0 left).
- Verified: ed-compare 11/0 · ed-detail-modal 21/0 · be-assessments-backup-coverage (A–E incl. drift-catcher) · **Rule Q L2 e2e 9/0 real prod** (`e2e-be-assessments-backup-roundtrip.mjs` — seed→collect-by-customerId→restore→cleanup) · full **16756/0** · build clean.

## Next action
- Idle / await. Both features DEPLOYED LIVE. (2 transient full-suite timeout flakes confirmed green on re-run — v85-glow / staff-chat; not real fails.)

## Outstanding (user-triggered)
- ⚠ ROTATE LINE/FB secrets (AV195).
- Pending chip: encode customer id in LINE OA message URL (task_1a3ac96c).
- Honest gap (Rule Q): ED-compare L1 pixel render on authed CDV (real ≥2-round customer) = USER hands-on; L2 + RTL + adversarial done.
