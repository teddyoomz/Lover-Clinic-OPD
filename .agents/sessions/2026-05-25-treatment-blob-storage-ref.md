# Checkpoint — 2026-05-25 EOD+2 — Treatment-blob Storage-ref migration + 2 follow-up fixes + Rule Q-honest

## Summary

`/systematic-debugging` on a user report ("รูปภาพการรักษาใน TFP บันทึกได้บ้างไม่ได้บ้าง / ช้า / ติด"). Rule R prod diag found the root cause: TFP Before/After/Other photos + lab images + lab/treatment PDFs were stored INLINE base64 in the `be_treatments` doc → 1 MiB Firestore cap hit at ~2 photos (real prod docs at 95%/86%/80%) → intermittent save-failure + main-thread jank. Charts were Storage-ref'd 2026-05-22; the rest never were (latent Rule P gap). Migrated ALL blobs → Firebase Storage; raised chart cap 2→10; flex-balanced the OPD Card column; deployed; stress-tested hard, which found + fixed 2 more bugs; codified Rule Q-honest. User L1 confirmed "ใช้ได้แล้ว".

## Current State

- **prod LIVE @ `65ab6467`** (deployed 2× this session: migration `e59756e6`, then clamp+edit-remove `c6b0e1e8`/`65ab6467`). AV128 (prior session) rode along.
- **NO firestore/storage.rules change** — `uploads/{collection}/{docId}/{fileName}` already allows image/* + application/pdf (≤10MB, clinic-staff). No Probe-Deploy-Probe needed.
- Full suite **14603/0** · stress e2e **24/0** · human-flow e2e **18/0 REAL prod** · build clean · zero Storage orphans · **user L1 confirmed**.
- Legacy inline blobs preserved (user chose "leave legacy") — readers accept data:|http; only NEW uploads go to Storage.

## Architecture

- NEW `src/lib/treatmentImageUpload.js` (`computeResizeDims` pure + `readFileAsDataURL` + `resizeImageDataUrl` + `processAndUploadTreatmentImage` + `uploadTreatmentPdf`) → calls `uploadTreatmentBlob` (NEW in `chartImageStorage.js`, accepts image/* + pdf; `uploadChartImage` now delegates). `deleteTreatmentBlob` = alias.
- TFP: 4 upload sites (photo/lab-img/lab-pdf/tfile-pdf) upload-on-add → state holds Storage URL (never inline base64); `pendingUploads` save-gate; persist both save blocks carry storagePath/pdfStoragePath; edit-load preserves them.
- `deleteBackendTreatment` cascade extended: charts + before/after/other + lab images + lab/tfile PDFs.
- **edit-remove-cancel fix**: `removeTreatmentBlob(path)` deletes Storage only in CREATE mode (true orphan); EDIT skips (saved doc refs it until save → no 404 on cancel). 4 TFP removes + ChartSection (handleDelete + handleSave-replace via `onBlobRemoved` prop) route through it.

## Commits

```
65ab6467 test(treatment): human-flow e2e (18/0 real prod) + Rule Q-honest
c6b0e1e8 fix(treatment): defer blob Storage-delete in EDIT mode — no broken-ref on cancel (AV129)
f6eb93ca test(treatment): heavy Storage-ref stress (e2e 24/0 + fuzz) + computeResizeDims clamp
e59756e6 fix(treatment): Storage-ref ALL TFP blobs + chart cap 2→10 + OPD column balance (AV129)
```

## Files Touched

- NEW `src/lib/treatmentImageUpload.js` · `src/lib/chartImageStorage.js` (+uploadTreatmentBlob/deleteTreatmentBlob)
- `src/components/TreatmentFormPage.jsx` (imports + pendingUploads + 4 upload sites + persist×2 + 4 removes + save-gate + removeTreatmentBlob + OPD column flex + OPDFieldWithPrev grow)
- `src/components/ChartSection.jsx` (MAX_CHARTS 2→10 + onBlobRemoved + removeChartBlob)
- `src/lib/backendClient.js` (deleteBackendTreatment cascade)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV129 + delete-timing clause)
- `.claude/rules/01-iron-clad.md` (Rule Q-honest)
- NEW tests: `treatment-blob-storage-ref.test.js` (25) · `treatment-blob-stress.test.js` (13) · 1 V21 fixup `re-edit-chart-on-tablet.test.jsx` (cap 2→10)
- NEW scripts: `diag-treatment-image-doc-size.mjs` (Rule R) · `e2e-treatment-blob-storage-stress.mjs` (24/0) · `e2e-treatment-blob-human-flows.mjs` (18/0)
- user-memory: `feedback_no_self_deception_in_testing.md` + MEMORY.md index

## Decisions (1-line each)

- Scope (AskUserQuestion) = full inline-blob class (photos + lab images + lab/tfile PDFs), not photos-only.
- Legacy (AskUserQuestion) = leave inline as-is; only new uploads → Storage (no Rule M migration).
- NO rules change — storage path already allows image/* + pdf (verified by reading storage.rules + charts live).
- OPD balance = flex right column + CC field `grow` (presentational only; cosmetic-shell).
- edit-remove-cancel = skip-delete-in-EDIT (safest; avoids a save-mode-doesn't-persist-images broken-ref); orphan cost negligible.
- Rule Q-honest born from this session: reasoning ≠ verification (the real e2e found a bug "identical to proven path" reasoning would have shipped).

## Next Todo

- idle — work fully shipped + deployed + user L1-confirmed.
- (carryover) นัดหมาย-tab unification brainstorm · cron monitoring (passive) · L1 verify V124-126.

## Resume Prompt

Resume LoverClinic — continue from 2026-05-25 EOD+2.

Read: CLAUDE.md → SESSION_HANDOFF.md (master=65ab6467, prod=65ab6467 LIVE) → .agents/active.md → .claude/rules/00-session-start.md (note NEW Rule Q-honest in 01-iron-clad.md).

Status: master=`65ab6467`, full suite 14603/0, prod LIVE. Treatment-blob Storage-ref migration + chart 2→10 + OPD balance + edit-remove fix + clamp — all DEPLOYED + user L1-confirmed.
Next: idle / await task.
Rules: no deploy without "deploy" THIS turn (V18); Rule Q + Q-honest (reasoning ≠ verification) before any "verified" claim.
/session-start
