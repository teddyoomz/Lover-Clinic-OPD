---
updated_at: "2026-06-16 EOD+1 — Dup-customer prevention (Part A, Rule T atomic identity-claim) + Recall fixes (Part B) — SHIPPED local, NOT deployed. Adversarial-reviewed; 2 HIGH bugs fixed."
status: "Feature complete on master (=origin, 9 commits). NOT deployed. DEPLOY-COUPLED: firestore.rules (be_customer_identity + be_recall_cases delete-narrow) → combined deploy + Probe-Deploy-Probe #17. 2 Rule-M scripts dry-run-verified, NOT applied."
branch: "master"
last_commit: "35fb5fa7 — fix(dup-prevent): adversarial-review — link-existing real HN + edit-reclaim in-tx + execution test + AV196/197"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = 019df953 (PRE this work). NOT deployed. firestore.rules NOT deployed (needs the be_customer_identity + be_recall_cases-delete changes)."
firestore_rules_version: "LOCAL change pending deploy: + be_customer_identity (get/list:false/create-update-delete staff) + be_recall_cases delete: if false→isClinicStaff. Probe #17 added to Rule B."
tests: "16609 / 0 (full suite, +67 net) + build clean + L2 e2e 16/0 real prod. NOT re-run at session-end."
---

# Active — 2026-06-16 EOD+1 — Dup-customer prevention + Recall fixes (SHIPPED local, NOT deployed)

## State
- master HEAD `35fb5fa7` (=origin), tree clean. 9 commits. Spec+plan: `docs/superpowers/{specs,plans}/2026-06-16-dup-customer-and-recall-fixes*`.
- Full vitest **16609/0** + build clean + **L2 e2e 16/0 real prod** (`scripts/e2e-dup-customer-and-recall.mjs`) + adversarial-review workflow (found+fixed 2 HIGH bugs).

## What shipped (`/brainstorming`→spec→plan→14 tasks + adversarial review)
- **Part A (Rule T dup-prevention):** `addCustomer` (single chokepoint) → ONE runTransaction claims `be_customer_identity/{CITIZEN:|PASSPORT:key}` (deriveClaimKey/resolveClaimAction in `src/lib/customerIdentity.js`) + counter + customer-doc; throws DUPLICATE_IDENTITY; override → `linkedCustomerIds` + `_duplicateOfCustomerId`. `updateCustomerFromForm` frees-old+claims-new on id change (oldKey re-derived IN-tx — race-safe). `deleteCustomerCascade` + server endpoint free/promote the claim. `CustomerCreatePage` warn modal (เปิดของเดิม / บันทึกซ้ำอยู่ดี) + phone soft-hint. OPD/deposit → `addCustomerOrLinkExisting` (DUPLICATE_IDENTITY → link existing, real HN). CDV flagged-dup badge. firestore.rules + probe #17.
- **Part B (recall):** `overlayRecallNames`/`useEnrichedRecalls` live-resolve customer name at the load chokepoint → fixes "—" in 3 lists + 5 modal headers (already clickable). RecallRow snooze/reschedule date chip (📞 โทรอีกครั้ง / 📅 เลื่อนนัด, dd/mm/yyyy พ.ศ.). `be_recall_cases` delete narrowed (rules). RecallCreateModal resolver.

## Next action (USER-triggered)
1. **DEPLOY** when user says "deploy": combined `vercel --prod` + `firebase deploy --only firestore:rules,storage` with **Probe-Deploy-Probe** (Rule B — probe #17: anon write be_customer_identity→403, anon delete be_recall_cases→403).
2. **AFTER deploy** run the 2 Rule-M scripts (admin-SDK, local): `node scripts/backfill-customer-identity.mjs --apply` (seeds claims; dry-run found **3 real dup pairs**: LC-69/74, LC-123/125, LC-143/155) + `node scripts/nuke-test-recall-cases.mjs --apply` (deletes the **7 TEST-CASE-PHASE2922 junk** presets, by caseName).
3. **USER L1** (backend-authed — no staff creds for automated L1): dup warn modal + override; recall name/clickable/date-chip/delete in all surfaces.

## Outstanding (carried)
- ⚠ ROTATE LINE/FB secrets (AV195).
- **3 existing duplicate customer pairs** (above) → manual merge/delete (backfill REPORTS them, does NOT auto-merge).
- Pending chip: encode customer id in the LINE OA message URL (pre-existing, out of scope — `task_1a3ac96c`).
- Honest gap (Rule Q): client-SDK-with-rules path = Probe-Deploy-Probe #17 at deploy; backend-authed UI L1 = user hands-on. The tx ALGORITHM + concurrency is L2-proven on real prod; the claim throw/override/reclaim are EXECUTED in `tests/dup-customer-claim-execution.test.js`.
