# 2026-06-18 EOD+1 — ED Score 2-panel round compare + be_assessments backup coverage

## Summary
Two `/brainstorming` features, both SHIPPED + DEPLOYED LIVE: (1) the per-question ED detail modal became a side-by-side 2-panel round COMPARE (TFP split-screen pattern); (2) the new ED `be_assessments` collection (added 2026-06-15) was missing from every backup/cascade scope — covered it, reconciled a long-standing client-vs-server delete drift into a single source, added a drift-catcher guard that immediately caught a real `be_wallets` phantom (money-adjacent), and Rule-M-cleaned 5 prod orphans.

## Current State
- master HEAD `2e19ac01` (= origin, tree clean). prod = `lover-clinic-a2f1vlim5` (vercel frontend) + `firebase deploy --only functions` (sendPushOnSubmit); aliased `lover-clinic-app.vercel.app` HTTP 200.
- firestore.rules UNCHANGED → no Probe-Deploy-Probe (V125/V145/V162 frontend-only precedent).
- full vitest **16756/0** + build clean. 2 transient full-suite timeout flakes (v85-glow / staff-chat) confirmed green on isolated re-run (Rule-Q-honest).
- Rule M orphan cleanup APPLIED (5 deleted + audit doc), verified idempotent (0 left). Rule Q L2 e2e 9/0 real prod.

## Commits
```
2e19ac01 test(backup): real-prod L2 e2e — be_assessments + be_customer_wallets backup round-trip (9/0)
f9c4d36b fix(backup): cover be_assessments in every cascade/backup list + reconcile client-delete drift + fix be_wallets phantom
303a85af feat(ed-score-box): EDDetailModal → 2-panel round compare (tabs + swap + per-panel pickers + changed-row highlight)
```

## Files Touched
- NEW: `src/lib/edCompare.js`, `tests/ed-compare.test.js`, `tests/be-assessments-backup-coverage.test.js`, `scripts/{diag-orphan-assessments,cleanup-orphan-assessments,diag-wallet-collection-names,e2e-be-assessments-backup-roundtrip}.mjs`, `docs/superpowers/{specs,plans}/2026-06-18-ed-score-compare-2panel*`, `docs/superpowers/{specs,plans}/2026-06-18-be-assessments-backup-coverage*`
- ED: `src/components/backend/EDDetailModal.jsx` (reworked), `src/components/backend/EDScoreBox.jsx` (1-line props), `tests/ed-detail-modal.test.jsx` (reworked → 16 RTL + 5 source-grep)
- Backup scope: `src/lib/customerBackupCore.js` (CUSTOMER_CASCADE 16→17 + be_wallets→be_customer_wallets), `src/lib/backendClient.js` (single-source reconcile + assessmentsCol/walletsCol), `src/lib/customerDeleteClient.js`, `api/admin/delete-customer-cascade.js`, `src/lib/wholeSystemBackupCore.js` (CUSTOMER_ONLY_UNIVERSAL), `src/lib/branchBackupCore.js` (UNIVERSAL), `scripts/{fix,diag}-dup-customer-pairs.mjs`
- Test fixups: `tests/v74-customer-backup-core.test.js`, `tests/phase-24-0-customer-delete-flow-simulate.test.js`, `tests/phase-24-0-customer-delete-server.test.js`

## Decisions (1-line each)
- ED compare default-open when ≥2 rounds; hero badges "ล่าสุด" + "วันนี้" so staff don't misread (user Q1).
- Same assessment type both panels + type tabs (user Q2); REMOVED the ดีขึ้น/แย่ลง trend — keep only changed-row highlight + both scores (user follow-up).
- Swap left/right via the existing `useLayoutPreference('ed-compare')` (TFP split-screen hook) — no new mechanism (ponytail rung 4).
- `autoPickCompareRound` = nearest PRIOR round measuring the active type, later-round fallback, excludes primary; `markChangedRows` aligns by question `n`.
- Badge no-squeeze = `flex:none` + centered + nowrap; the round picker truncates instead (user "Badge โดนบีบ").
- Backup coverage Q1=A comprehensive + reconcile the client-delete 11-vs-16 drift into a single source so client + server can't diverge.
- Backup coverage Q2=A: Rule-R diag + Rule-M cleanup of any orphans found (found 5 → cleaned).
- `be_wallets` → `be_customer_wallets`: the cascade phantom (0 docs/no rule/no accessor) was the drift-catcher's first real catch; the live store is composite-id, money-adjacent → renamed everywhere.
- Whole-system FULL backup already dynamic (`listCollections()`, V122) → be_assessments auto-covered; only the curated lists needed the add.

## Next Todo
- Idle / await. Both features DEPLOYED LIVE.
- Outstanding (user-triggered): ROTATE LINE/FB secrets (AV195); encode customer id in LINE OA URL (task_1a3ac96c).
- Honest gap (Rule Q): ED-compare L1 pixel render on an authed CDV with a real ≥2-round customer = USER hands-on (L2 e2e + RTL + adversarial done).

## Resume Prompt
Resume LoverClinic — continue from 2026-06-18 EOD+1. master=2e19ac01, prod=lover-clinic-a2f1vlim5 LIVE. Both features (ED 2-panel compare + be_assessments backup coverage) SHIPPED + DEPLOYED. full vitest 16756/0. Next: idle/await. Outstanding (user-triggered): rotate LINE/FB secrets (AV195); LINE-OA-url customer-id chip. Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe (Rule B). /session-start
