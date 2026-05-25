---
updated_at: "2026-05-25 EOD+2 — Treatment-blob Storage-ref migration SHIPPED + DEPLOYED + 2 follow-up fixes + Rule Q-honest"
status: "prod LIVE @ 65ab6467 (migration + chart 2→10 + OPD layout + edit-remove fix + clamp). Real-adversarial tested + user L1 confirmed 'ใช้ได้แล้ว'."
branch: "master"
last_commit: "65ab6467 test(treatment): human-flow e2e (18/0 real prod) + Rule Q-honest"
tests: "full suite 14603/0 · stress e2e 24/0 · human-flow e2e 18/0 REAL prod · build clean · zero Storage orphans"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "65ab6467 LIVE (deployed 2× this session: migration, then clamp+edit-remove fixes)"
firestore_rules_version: "unchanged (NO rules change — storage.rules uploads/{collection}/{docId}/{fileName} already allows image/* + application/pdf)"
---

# Active Context

## State
- TFP treatment blobs (Before/After/Other photos + lab images + lab/treatment PDFs) migrated inline-base64 → Firebase Storage (**AV129**); doc dropped from ~95% of 1 MiB cap → ~30 KB → intermittent save-fail + jank FIXED. Chart cap 2→10. OPD Card column flex-balanced (purple btn bottom-aligns teal). All LIVE.
- 2 follow-ups (found by stress test): `computeResizeDims` clamp ≥1 (extreme aspect ratio → 0-dim canvas); **edit-remove-cancel broken-ref** — `removeTreatmentBlob` deletes Storage only in CREATE mode; EDIT skips (doc still refs it until save → no 404 on cancel). Both for photos + charts.
- NEW **Rule Q-honest** (`.claude/rules/01-iron-clad.md`): reasoning ≠ verification; run real-adversarial test even when certain; disclose test-vs-claim gap. Origin: I claimed "done — identical to proven chart path"; the e2e the user demanded then found the edit-remove bug.

## What this session shipped
- Storage-ref migration (NEW `treatmentImageUpload.js` + `uploadTreatmentBlob`/`deleteTreatmentBlob`; TFP 4 upload sites + persist + remove + save-gate; backendClient cascade) — deployed `e59756e6`
- chart 2→10 (`ChartSection MAX_CHARTS`) + OPD column flex-balance (cosmetic)
- clamp fix `f6eb93ca` + edit-remove-cancel fix `c6b0e1e8` + human-flow e2e + Rule Q-honest `65ab6467`
- AV129 + 3 test banks (storage-ref 25 · stress 13 · human-flow e2e 18) + 1 V21 fixup (chart cap)
- Detail → `.agents/sessions/2026-05-25-treatment-blob-storage-ref.md`

## Next action
- **idle** — work fully shipped + deployed + user L1-confirmed. Await next task.

## Outstanding user-triggered actions
- None for this work (deployed + confirmed "ใช้ได้แล้ว").
- (carryover) นัดหมาย-tab unification brainstorm · cron monitoring (passive) · L1 verify V124-126.
