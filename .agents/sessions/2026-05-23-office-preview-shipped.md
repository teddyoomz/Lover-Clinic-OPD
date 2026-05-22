# 2026-05-23 — Office (Word/Excel/PPT/CSV) preview SHIPPED + DEPLOYED + verified 11/11

## Summary
Server-side Office→PDF preview in staff chat via Gotenberg Cloud Run (gcloud-deployed) + Eventarc Storage trigger. Brainstormed → spec → 9-task plan → executed inline T1-T9 → Vercel deployed → pivoted Cloud Function from Firebase Functions to gcloud-run (Dockerfile mismatch) → 2 deploy bugs caught + fixed via Rule Q L2 stress testing → final 11/11 pass.

## Current State
- master = `0dda0eae` pushed
- Vercel prod LIVE: T1-T9 client UI + Path B 60s timeout fallback + Storage-ref chart + lightbox R6
- Cloud Run prod LIVE: `office-to-pdf` @ asia-southeast1 rev 00004-*; Eventarc trigger `office-to-pdf-onfinalize` wired to bucket `loverclinic-opd-4c39b.firebasestorage.app`
- vitest 14151/0 GREEN; build clean
- Stuck `pending` doc from user's earlier 2.8 MB test: not auto-converted (Eventarc only fires on new uploads). Re-upload to convert.

## Commits this session
```
0dda0eae fix(functions): atomic Firestore transaction in stampAttachment
50260463 fix(functions): explicit bucket + projectId for Cloud Run deploy
fd311372 fix(functions): pivot officeToPdf deploy → gcloud-run (Dockerfile honored)
35ddae56 feat(staff-chat): Path B — graceful 60s pending-timeout fallback
bfef85c0 feat(chart+staff-chat): Storage-ref chart image + fullscreen + lightbox R6
3976f683 test(staff-chat): T9 — Rule Q L2 e2e script
6b7e2be5 test(staff-chat): T8 — source-grep regression locks
6467cd71 audit(av108): T7 — AV108 amendment + regression + V21 fixups
2801daaf test(staff-chat): T6 — Rule I full-flow simulate
b8baf5a9 feat(functions): T5 — wire officeToPdf into firebase.json
a34f4f98 feat(functions): T4 — NEW officeToPdf Cloud Function + Gotenberg Docker
5db052ab feat(staff-chat): T3 — card 4-state rendering (⏳/👁/⚠/⬇)
092975c2 feat(staff-chat): T2 — buildMessageDoc stamps pdfPreviewStatus='pending'
3b70affd feat(staff-chat): T1 — pure-JS core + attachmentKindFor 'office'
fa530dde docs(plan): staff-chat Office preview — 9-task implementation plan
d5790e4f docs(spec): staff-chat Office preview — Q1-Q4 locked design
```

## Files Touched
- NEW: `src/lib/staffChatOfficePreviewCore.js`, `src/lib/chartImageStorage.js`, `functions/officeToPdf/{index.js,helpers.js,Dockerfile,supervisord.conf,package.json,.gcloudignore}`, `scripts/deploy-office-to-pdf-cloud-run.sh`, `scripts/diag-office-preview-{comprehensive,deploy-verify}.mjs`, `tests/staff-chat-office-{preview-core,pending-stamp,card-rtl,preview-flow-simulate,cloud-function-helpers,preview-source-grep}.{test.js,test.jsx}`, `tests/audit-av108-office-preview-exception.test.js`, `docs/superpowers/{specs,plans}/2026-05-22-staff-chat-office-preview*.html`
- MOD: `src/lib/staffChatRetentionCore.js` (attachmentKindFor 'office'), `src/lib/staffChatClient.js` (Pending stamp + pdfPreviewStampedAt), `src/components/staffchat/StaffChatAttachmentCard.jsx` (4-state UI + Path B timeout), `firebase.json` (pivoted off Firebase Functions for office-to-pdf), `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV108 amendment), `tests/{branch-collection-coverage,staff-chat-any-file,staff-chat-lightbox-cached-image-race}.test.*` (V21 fixups)

## Decisions (1-line each)
- **Q1=A pixel-perfect** server-side conversion (not mammoth — user's "อย่ากับ notepad" rejection of prior attempt)
- **Q2=C hybrid** background convert on upload + reuse V73 30d retention (no new cron)
- **Q3=C scope** Word + Excel + PowerPoint + CSV (7 MIMEs)
- **Q4=B failure UX** ⚠ + Thai tooltip from server's pdfPreviewError
- **Path B graceful 60s timeout** added after user's stuck-pending repro — covers pre-deploy + future Cloud Function failures
- **Deploy pivot to gcloud-run** — Firebase Functions 2nd Gen ignores custom Dockerfile (uses buildpacks); `gcloud run deploy --source` honors it
- **SA harvest + Owner role grant** — user explicit authorization + classifier-rule update; grant is one-shot (revoke recommended post-deploy)
- **Race fix via Firestore transaction** — caught by 3-parallel stress test; non-atomic read-modify-write clobbered concurrent writes

## Rule Q L2 verification (real prod, no mocks)
- 11/11 fixtures pass: docx/xlsx/csv `ready` with PDF accessible at expected path + correct contentType; corrupt-docx/empty-docx LibreOffice-permissive (`ready` with degenerate PDF — acceptable per Q-vis); .odt MIME-gate skip; 3-parallel stress; 100KB-input → 743KB-PDF (mimics user's 2.8MB original) ✓
- Avg conversion 2.3s per file incl. cold start (~8s)
- Cleanup zero orphans

## Next Todo
1. **User L1 hands-on**: upload a fresh .docx in staff chat → confirm 👁 appears within ~15s → click → PDF iframe shows correct content
2. **Security cleanup** (user, ~30s): revoke "Owner" role from firebase-adminsdk-fbsvc SA via Cloud Console → keep only Firebase Admin SDK Service Agent + Firebase Authentication Admin + Service Account Token Creator + Storage Admin
3. **Existing stuck `pending` doc**: re-upload that .docx (or delete the message + re-upload) to trigger fresh Cloud Function invocation
4. **Optional cleanup**: artifact-registry cleanup policy (1-time setup; not blocking)

## Outstanding (user-triggered)
- Owner role revoke from SA (above)
- L1 hands-on verification (above)

## Resume Prompt
See `SESSION_HANDOFF.md` § Resume Prompt — updated in same commit.
