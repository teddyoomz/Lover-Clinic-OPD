# 2026-05-22 EOD+1 — Lightbox round-5 + Chart templates persistence rewrite

## Summary
Two features shipped + deployed. (1) Staff-chat image-lightbox prev/next race
finally closed via the architectural answer: REMOVE the opacity gate entirely
(rounds 1-4 chased loadedSrc through onLoad / ref / useEffect+complete /
decode() / Set-of-loaded-URLs and each only narrowed the race). (2) Chart
template persistence rewrite — was broken since V50 with silent permission-
denial + 1MB doc cap. Now per-doc in `be_chart_templates` + Storage + lock +
per-device sort. Open bug investigating (not yet fixed): "Property detail
contains an invalid nested entity" on TFP save after using uploaded chart.

## Current State
- master = `1e88ed11` LIVE on https://lover-clinic-app.vercel.app
- 47/0 targeted tests; build 3.20s
- Firebase rules + storage deployed; 8/8 probes pre+post (NEW probe #14 = chart-templates anon Storage + Firestore writes both 403)
- Open bug investigating; diag script `scripts/diag-chart-template-save-shape.mjs` ready to run

## Commits this session
```
1e88ed11 feat(chart-templates): persistence rewrite — per-doc + Storage + lock + per-device sort
e848e18a fix(staff-chat): lightbox prev/next instant + race-immune — remove opacity gate (round-5 architectural)
```

## Files touched (no diffs — code in git)
- `src/components/staffchat/StaffChatImageLightbox.jsx` (round-5 — removed all opacity-gate state/effects)
- `src/components/ChartTemplateSelector.jsx` (rewrite — per-doc + Storage + lock + sort)
- `firestore.rules` (+ `match /be_chart_templates/{templateId}`)
- `storage.rules` (+ `match /chart-templates/{file=**}`)
- `tests/staff-chat-lightbox-cached-image-race.test.jsx` (R5 contract + 200-round stress)
- `tests/chart-template-persistence.test.jsx` (14 source-grep + rule assertions)
- `tests/staff-chat-any-file.test.js` (V21 fixup — round-5 grep contract)
- `.claude/rules/01-iron-clad.md` (Rule B probe #14 added)
- `scripts/diag-chart-template-save-shape.mjs` (UNCOMMITTED — for next chat)

## Decisions (1-line each)
- Lightbox round-5: opacity gate IS the wrong primitive; keyed remount + thumb-behind covers all cases without state.
- Chart templates: per-doc not single-doc-blob (escapes 1MB cap permanently); Storage refs not inline dataURLs.
- Chart templates: universal (no branchId) per user "ไม่ต้องเก็บแยกสาขา".
- Lock: built-ins seeded `locked:true` (can't one-click defaults away); uploads `locked:false`.
- Sort: localStorage per-device, never written to Firestore (each clinician's own preference).
- Errors: NO silent `.catch(()=>{})` — surface to user via alert + debugLog.

## Next Todo (priority order)
1. Run `node scripts/diag-chart-template-save-shape.mjs` — pinpoints "invalid nested entity" field path
2. Apply Rule P 7-step class-of-bug fix once root cause known; regression test; deploy
3. User hands-on confirm both deployed features feel right on iPad

## Open question (for diag)
- chartEntryForPersist DROPS the `template` field before save → my Node repro of just charts[]+clean shows safe shape. So WHY does Firestore reject? Hypothesis: another save path that includes the raw entry/template (search for any TFP write that doesn't go through chartEntryForPersist OR rebuildTreatmentSummary leaks something).

## Resume Prompt
```
Resume LoverClinic — continue from 2026-05-22 EOD+1.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=1e88ed11, prod=1e88ed11)
3. .agents/active.md
4. .claude/rules/00-session-start.md
5. .agents/sessions/2026-05-22-lightbox-r5-and-chart-templates.md

Status: master=1e88ed11, 47/0 targeted GREEN, prod=1e88ed11 LIVE
Next: run `node scripts/diag-chart-template-save-shape.mjs` to pinpoint "Property detail contains an invalid nested entity" on TFP save after using freshly-uploaded chart template; Rule P fix
Outstanding (user-triggered):
- Hands-on confirm round-5 lightbox feels instant on real device
- Hands-on test chart template upload persists across TFP reopen
- The "invalid nested entity" bug = active blocker

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe; Rule R diag pre-authorized
/session-start
```
