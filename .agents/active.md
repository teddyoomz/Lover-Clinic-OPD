---
updated_at: "2026-05-23 EOD — Office (Word/Excel/PPT/CSV) preview SHIPPED + DEPLOYED + Rule Q L2 11/11 verified"
status: "prod LIVE — Vercel frontend + Cloud Run office-to-pdf service (asia-southeast1) + Eventarc trigger active. 14151/0 tests."
branch: "master"
last_commit: "0dda0eae fix(functions): atomic Firestore transaction in stampAttachment — eliminates race under parallel uploads"
tests: "vitest 14151/0 PASS; build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0dda0eae (Vercel) · office-to-pdf rev 00004-* (Cloud Run)"
firestore_rules_version: "unchanged — admin SDK bypasses; storage.rules unchanged (existing chat-attachments rule covers .pdf cache)"
---

# Active Context

## State
- Office preview pipeline LIVE end-to-end: client stamps `pending` on upload → Cloud Run `office-to-pdf` (Gotenberg+LibreOffice) fires via Eventarc Storage onFinalize → patches `attachments[i].pdfPreviewStatus='ready'` + URL → client listener flips ⏳→👁. Verified 11/11 fixtures including 100KB→743KB-PDF stress test.
- Path B 60s timeout fallback also live — pre-Path-B legacy stuck-pending docs stay ⏳; new uploads after Path-B will flip ⚠ if Cloud Function ever stops responding.
- 2 bugs caught + fixed during Rule Q L2 stress: (a) FieldValue.serverTimestamp() in array element (Firestore rejects) → new Date(); (b) non-atomic read-modify-write in stampAttachment → db.runTransaction().

## What this session shipped
- Spec + 9-task plan + T1-T9 inline execution (HTML format, mockup + flow); 14 commits + 14140→14151 tests
- NEW Cloud Function in `functions/officeToPdf/` (Gotenberg-bundled Docker; gcloud-run-deployed, NOT Firebase Functions — Dockerfile incompatibility caught at deploy time)
- NEW `scripts/deploy-office-to-pdf-cloud-run.sh` (idempotent: API enables, IAM grants, Cloud Run deploy, Eventarc trigger create)
- NEW `scripts/diag-office-preview-comprehensive.mjs` (Rule Q L2: docx/xlsx/csv/stress/edge + cleanup; verified 11/11)
- AV108 amended: ONE sanctioned exception = in-project Gotenberg Cloud Run (no 3rd-party PHI leak)
- Detail: `.agents/sessions/2026-05-23-office-preview-shipped.md`

## Next action
1. User L1 hands-on: upload fresh .docx in staff chat → confirm 👁 appears within ~15s → preview iframe shows real PDF
2. User: revoke "Owner" role from firebase-adminsdk-fbsvc SA via Cloud Console (1-click) — was a deploy-bootstrap, not runtime-needed

## Outstanding user-triggered actions
- L1 hands-on (above)
- Security revoke (above)
- Stuck `pending` doc from earlier (2.8 MB test): re-upload to trigger fresh conversion (Eventarc doesn't auto-backfill past uploads)
