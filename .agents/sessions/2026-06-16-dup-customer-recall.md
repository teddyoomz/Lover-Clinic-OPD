# Checkpoint — 2026-06-16 EOD+1 — Dup-customer prevention (Rule T) + Recall fixes — DEPLOYED + 3 dup pairs resolved

## Summary
Two-part batch from a 7-item user request. **Part A** = bulletproof (Rule T) duplicate-national-id + double-create prevention via an atomic `be_customer_identity` claim. **Part B** = recall fixes (name "—" → live-resolve, clickable, snooze/reschedule date chips, recall-case hard-delete). `/brainstorming`→spec→`/writing-plans`(14 tasks)→inline impl, hardened by a 4-agent census workflow + a 20-agent adversarial-review workflow (found+fixed 2 HIGH bugs). DEPLOYED (rules + frontend) with Probe-Deploy-Probe 8/8; Rule-M backfill/nuke applied; **3 real dup pairs resolved → 0**.

## Current State
- master `c78378a9` (=origin); tree clean. prod = frontend `lover-clinic-gpxsr048v` (lover-clinic-app.vercel.app) + firestore.rules DEPLOYED.
- Full vitest **16609/0** (+67) + build clean + **L2 e2e 16/0 real prod** + Probe-Deploy-Probe **8/8** (opd_sessions anon→200 intact; be_customer_identity + be_recall_cases anon→403).
- Rule-M APPLIED: 128 identity claims seeded + 131 denorm-stamped (idempotent) + 7 TEST-CASE junk deleted + **3 dup pairs resolved** (LC-125 recall MOVED→LC-123 then deleted; LC-069 empty deleted/keep LC-074; pair3 test LC-143+155 both deleted). **0 dups remain** (re-verified).
- Honest gap (Rule Q): anon-deny PROVEN (Probe #17 live); staff-client-SDK write + backend-authed UI = USER L1 (preview can login `loverclinic@loverclinic.com`/`Lover2024`).

## Commits (this session, on master)
```
c78378a9 docs(agents): active.md — 3 dup pairs resolved (recall moved + deleted, 3→0)
852d0669 data(rule-m): resolve 3 dup-customer pairs — move LC-125 recall→LC-123 + delete empty/test dups
f5f77dc0 docs(agents): active.md — DEPLOYED + Probe-Deploy-Probe green + Rule-M applied
36bdbdfd fix(probe): WS1 chat 200→403 + probe #17 (be_customer_identity + be_recall_cases anon-deny)
35fb5fa7 fix(dup-prevent): adversarial-review — link-existing real HN + edit-reclaim in-tx + execution test + AV196/197
(+ A1-A9/B1-B3/C1-C2 impl commits 01a7d745..ec.. ; spec/plan 01a7d745)
```

## Files Touched
- SRC: `customerIdentity.js` (NEW deriveClaimKey/resolveClaimAction/DuplicateIdentityError) · `backendClient.js` (addCustomer tx claim + updateCustomerFromForm reclaim + deleteCustomerCascade._freeCustomerIdentityClaim + identityClaimDoc) · `recallCustomerName.js` (NEW overlayRecallNames) · `useEnrichedRecalls.js` (NEW hook) · `RecallRow.jsx` (date chip) · `RecallTab/RecallFrontendView/RecallCard` (enrich wire) · `RecallCreateModal.jsx` (resolver) · `CustomerCreatePage.jsx` (warn modal + phone hint) · `AdminDashboard.jsx` (addCustomerOrLinkExisting) · `CustomerDetailView.jsx` (dup badge) · `firestore.rules` (be_customer_identity + be_recall_cases delete) · `api/admin/delete-customer-cascade.js` (freeIdentityClaimAdmin)
- TESTS (new): customer-identity-claim-key · addcustomer-atomic-claim · dup-customer-claim-execution (EXECUTES claim logic) · dup-customer-flow-simulate · recall-customer-name · recall-fixes-flow-simulate · firestore-rules-identity-and-recall-delete. V21 fixups: add-customer/customer-create flow-simulate (tx-write mock) · phase-20/23/25 (addCustomerOrLinkExisting rename) · branch-collection-coverage (+be_customer_identity).
- SCRIPTS: backfill-customer-identity · nuke-test-recall-cases · e2e-dup-customer-and-recall (L2) · diag-dup-customer-pairs · fix-dup-customer-pairs · probe-deploy-probe (WS1 fix + #17).
- DOCS: spec+plan 2026-06-16-dup-customer-and-recall-fixes · AV196/AV197 · feedback_full_customer_footprint_before_delete (memory).

## Decisions (1-line each)
- Q1 warn+choose / Q2 ID-passport block+phone warn / Q3 Rule-T atomic claim / Q4 hard-delete (rules+deploy) — locked via AskUserQuestion.
- Claim key TYPE-prefixed (`CITIZEN:{13d}`/`PASSPORT:{UPPER}`); citizen validated ==13 digits; both→citizen wins; walk-in→null (no claim).
- Override = flagged + appended to claim.linkedCustomerIds (NOT silent); cascade promotes a linked dup or deletes the claim.
- be_customer_identity NOT in CUSTOMER_CASCADE_COLLECTIONS — freed explicitly by denorm `_identityClaimKey` (O(1)); list:false = CRITICAL PII invariant (national-id-as-doc-id; marginal exposure ~nil since be_customers.citizen_id already staff-readable).
- Recall name = live-resolve at load chokepoint (V113; NOT admin-SDK display backfill); enriched recall flows to modals too.
- 2 HIGH bugs from adversarial review: link-existing returned empty HN → fetch real HN; edit-reclaim read oldKey OUTSIDE tx → re-read IN-tx (race-safe).
- **LESSON (user caught)**: customer-empty footprint MUST include `be_recalls` (NOT in cascade list) + V74 CG collections — never a partial list. Moved LC-125's recall to LC-123 before deleting.

## Next Todo
- USER L1 hands-on (preview/live, admin login): dup warn modal + override; recall name/clickable/date-chip/delete; 7 TEST-CASE gone.
- Carried: ROTATE LINE/FB secrets (AV195); LINE-OA URL-encode chip `task_1a3ac96c`.

## Resume Prompt
```text
Resume LoverClinic — continue from 2026-06-16 EOD+1.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=c78378a9, prod=lover-clinic-gpxsr048v)
3. .agents/active.md (16609 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-06-16-dup-customer-recall.md

Status: master=c78378a9 (=origin), 16609/0 pass, DEPLOYED (rules + frontend, Probe-Deploy-Probe 8/8). Dup-customer prevention (Rule T) + recall fixes LIVE; Rule-M backfill/nuke applied; 3 dup pairs resolved → 0.
Next: USER L1 hands-on (admin login loverclinic@loverclinic.com/Lover2024) — dup warn modal + recall name/chip/delete. Else idle.
Outstanding (user-triggered): ROTATE LINE/FB secrets (AV195); LINE-OA URL-encode chip task_1a3ac96c.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe (Rule B). Customer-empty check MUST include be_recalls.
/session-start
```
