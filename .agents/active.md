---
updated_at: "2026-05-23 EOD+1 — V109 Office preview canonical-path fix + heal + Cloud Function redeploy IN PROGRESS"
status: "FIXED (LOCAL); heal applied to 2 stuck docs; Cloud Run office-to-pdf redeploy in progress (gcloud run deploy --source); pending L2 canonical-path re-verify + user L1"
branch: "master"
last_commit: "(pending) — V109 code fix + heal script + AV109 + V109 regression test"
tests: "vitest 14151 + 10 V109 = 14161/0 PASS targeted; full suite pending end-of-batch"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0dda0eae (Vercel, NO new deploy needed — client unchanged) · office-to-pdf rev N+1 (Cloud Run, redeploying NOW with V109 fix)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- **Root cause found + fixed**: `functions/officeToPdf/index.js` was writing to bare `be_staff_chat_messages` collection. Client writes to canonical `artifacts/${APP_ID}/public/data/be_staff_chat_messages`. Cloud Function converted PDFs successfully (cached at correct Storage paths) but its Firestore patch landed in empty universe → `pdfPreviewStatus` stayed `pending` → 60s Path B fired → ⚠.
- **V66 mirror amplifier**: 3 L2 test scripts (`diag-office-preview-comprehensive.mjs`, `diag-office-preview-deploy-verify.mjs`, `e2e-staff-chat-office-preview.mjs`) ALL wrote test fixtures at the SAME bare path → claimed "11/11 verified" while real prod stuck. Classic test-vs-code shared-wrong-assumption.
- **Reference (correct, was right there)**: pre-existing `functions/index.js` uses `BASE_PATH = artifacts/${APP_ID}/public/data` — same project, correct pattern, not followed.

## Diag evidence (Rule R read-only, before fix)
- 4 stuck office attachments at canonical Firestore path, ALL `status: pending`
- **2/4 had cached `.docx.pdf` at correct Storage paths** with `contentType=application/pdf` size=52671 → proves Cloud Function ran successfully, just couldn't patch
- 2/4 had no cached PDF (older uploads from 15:39/16:30, pre-deploy or pre-rev-00004) → need re-upload

## What this session shipped (LOCAL — not yet pushed)
- **Cloud Function fix**: `functions/officeToPdf/index.js` uses canonical `MESSAGES_COLLECTION_PATH` + `db.doc(\`${PATH}/${messageId}\`)`
- **3 V66-mirror test scripts** fixed (now would catch the bug if re-introduced)
- **NEW** `tests/v109-office-preview-canonical-path.test.js` (10/0): V109.A1-A4 + B1-B3 + C1-C3 source-grep regression
- **NEW** AV109 invariant in `audit-anti-vibe-code` SKILL.md (CRITICAL priority addition)
- **NEW** `scripts/diag-2-8mb-stuck-attachments.mjs` (Rule R)
- **NEW** `scripts/v109-heal-stuck-office-attachments.mjs` (Rule M) — APPLIED on real prod: 2 docs healed pending→ready with reconstructed download URLs from existing Storage tokens; audit doc `be_admin_audit/v109-heal-stuck-office-1779475851250-9c23a8a8`; idempotent (2nd run 0 writes)
- **V109 V-entry** in `.claude/rules/00-session-start.md` § 2
- Cloud Run redeploy `gcloud run deploy --source functions/officeToPdf` IN PROGRESS (background task bnrcqzkuy)

## Next action
1. **WAIT for Cloud Run deploy to complete** (background task bnrcqzkuy, ~10-15 min)
2. **Re-run Rule Q L2 with canonical-path fixtures** — `node scripts/diag-office-preview-comprehensive.mjs` — would have caught this bug pre-fix (V66 mirror eliminated)
3. **Verify user's 2 healed docs** show 👁 in real client (Firestore listener picks up the ready status)
4. **Update SESSION_HANDOFF.md** + v-log-archive.md with full V109 verbose entry
5. **Commit + push** all V109 changes
6. **User L1**: upload a fresh .docx → expect ⏳→👁 within ~15s (the 2 cached-PDF docs from the screenshot will already show 👁 once listener resyncs)

## Outstanding (user-triggered)
- L1: hard-refresh staff chat → the 2 most recent 18:27 docs (`CHAT-1779474473885-958a715e` + `CHAT-1779474454460-dd9b6fbf`) should show 👁 → click → real PDF iframe
- The 2 older stuck docs (15:39 + 16:30, no cached PDF) need re-upload via delete-and-resend
- Security: revoke "Owner" role from firebase-adminsdk-fbsvc SA via Cloud Console (carried over from 2026-05-23)
