---
updated_at: "2026-06-16 EOD+1 — Dup-customer prevention (Part A, Rule T) + Recall fixes (Part B) — ✅ DEPLOYED + Probe-Deploy-Probe green + Rule-M backfill/nuke APPLIED."
status: "DEPLOYED to prod (firestore.rules + frontend). Probe-Deploy-Probe green (no regression, patient intake intact). Rule-M: 128 identity claims seeded + 131 denorm-stamped + 7 TEST-CASE junk deleted. Pending: USER L1 (backend-authed UI) + manual merge of 3 dup pairs."
branch: "master"
last_commit: "c78378a9 — docs(agents): 3 dup pairs resolved (recall moved + dups deleted, 3→0)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = lover-clinic-gpxsr048v (HEAD 380ce1ea + probe-fix 36bdbdfd) — DEPLOYED 2026-06-16. firestore.rules DEPLOYED (be_customer_identity + be_recall_cases delete-narrow)."
firestore_rules_version: "DEPLOYED: + be_customer_identity (get/list:false/create-update-delete staff) + be_recall_cases delete if false→isClinicStaff. Probe #17 live (anon write/delete → 403)."
tests: "16609 / 0 (full suite, +67 net) + build clean + L2 e2e 16/0 real prod. Probe-Deploy-Probe 8/8 pre+post."
---

# Active — 2026-06-16 EOD+1 — Dup-customer prevention + Recall fixes (✅ DEPLOYED)

## State
- master HEAD `36bdbdfd` (=origin), tree clean. ~11 commits. Spec+plan: `docs/superpowers/{specs,plans}/2026-06-16-dup-customer-and-recall-fixes*`.
- Full vitest **16609/0** + build clean + **L2 e2e 16/0 real prod** + adversarial-review (found+fixed 2 HIGH bugs).
- **DEPLOYED**: firestore.rules + Probe-Deploy-Probe **8/8 green** pre+post (opd_sessions anon→200 intact; be_customer_identity + be_recall_cases anon→403) + frontend live. Rule-M **APPLIED**: backfill 128 claims + 131 denorm (idempotent ✓), nuke 7 TEST-CASE junk (idempotent ✓), both with audit docs.

## What shipped (`/brainstorming`→spec→plan→14 tasks + adversarial review)
- **Part A (Rule T dup-prevention):** `addCustomer` (single chokepoint) → ONE runTransaction claims `be_customer_identity/{CITIZEN:|PASSPORT:key}` (deriveClaimKey/resolveClaimAction in `src/lib/customerIdentity.js`) + counter + customer-doc; throws DUPLICATE_IDENTITY; override → `linkedCustomerIds` + `_duplicateOfCustomerId`. `updateCustomerFromForm` frees-old+claims-new on id change (oldKey re-derived IN-tx — race-safe). `deleteCustomerCascade` + server endpoint free/promote the claim. `CustomerCreatePage` warn modal (เปิดของเดิม / บันทึกซ้ำอยู่ดี) + phone soft-hint. OPD/deposit → `addCustomerOrLinkExisting` (DUPLICATE_IDENTITY → link existing, real HN). CDV flagged-dup badge. firestore.rules + probe #17.
- **Part B (recall):** `overlayRecallNames`/`useEnrichedRecalls` live-resolve customer name at the load chokepoint → fixes "—" in 3 lists + 5 modal headers (already clickable). RecallRow snooze/reschedule date chip (📞 โทรอีกครั้ง / 📅 เลื่อนนัด, dd/mm/yyyy พ.ศ.). `be_recall_cases` delete narrowed (rules). RecallCreateModal resolver.

## Next action
- **USER L1 hands-on** (preview server can also login as admin — `loverclinic@loverclinic.com`/`Lover2024`): on the app — (a) create a customer with an existing national-id → dup warn modal + เปิดของเดิม/บันทึกซ้ำอยู่ดี; (b) recall list real names + clickable + 📞/📅 date chips + ลบเคส works; (c) the 7 TEST-CASE presets gone.

## Done this session (beyond the feature)
- ✅ **3 dup-customer pairs RESOLVED** (`scripts/fix-dup-customer-pairs.mjs --apply`, audit doc): pair1 LC-069 (empty) deleted/keep LC-074; pair2 **LC-125's recall MOVED → LC-123** then LC-125 deleted; pair3 LC-143+155 (test) both deleted. **3→0 dups** (re-verified). LESSON: missed `be_recalls` in the first footprint (NOT in CUSTOMER_CASCADE_COLLECTIONS) — user caught it → `feedback_full_customer_footprint_before_delete.md`.

## Outstanding (carried)
- ⚠ ROTATE LINE/FB secrets (AV195).
- Pending chip: encode customer id in the LINE OA message URL (pre-existing, out of scope — `task_1a3ac96c`).
- Honest gap (Rule Q): the tx ALGORITHM + concurrency is L2-proven on real prod; claim throw/override/reclaim EXECUTED in `tests/dup-customer-claim-execution.test.js`; anon-deny PROVEN by Probe-Deploy-Probe #17 (live). The staff-writes-via-client-SDK + backend-authed UI = USER L1 (above).
