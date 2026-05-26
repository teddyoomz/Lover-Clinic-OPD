# 2026-05-26 EOD+7 — Per-branch LINE OA add button restored + ดูข้อมูล OPD→ดูข้อมูลรับเข้า (AV139)

## Summary
`/systematic-debugging` on 2 user items: (1) the patient-form success-screen "เพิ่มเพื่อน LINE Official" button vanished; (2) rename the appointment-card view button. Root cause #1: PatientForm gated the card on the empty GLOBAL `clinic_settings.lineOfficialUrl`; the real per-branch URL is `be_branches.settings.lineOaUrl` (staff-only). Fix = NEW secure server endpoint (admin SDK, returns ONLY the public lin.ee URL); PatientForm fetches per `session.branchId`. SHIPPED + DEPLOYED + endpoint L2-verified on prod.

## Current State
- master = `7e2a5bd8` = prod (`vercel --prod` frontend + new serverless fn). Endpoint LIVE + L2-verified.
- NO firestore.rules change → no Probe-Deploy-Probe.
- full suite 14843 pass + 1 isolated-pass flake (`phase-17-1-cross-branch-import-rtl` global.fetch-leak, 7/0 isolated, NOT mine) · build clean · new bank 9/0.
- 3 Rule S working-tree files (CLAUDE.md, rules 00/01) untouched (pre-existing, user's to commit).
- This session ALSO deployed (own SESSION_HANDOFF entries): appointment-card 5-band redesign · realtime-intake-notif (AV137) · push_config rule (AV138). All LIVE on prod.

## Commits
```
7e2a5bd8 fix(patient-form): restore per-branch LINE OA add button + rename ดูข้อมูล OPD→ดูข้อมูลรับเข้า (AV139)
6d76b77b docs(agents): EOD 2026-05-26 EOD+7 — push_config rule fix DEPLOYED (Probe-Deploy-Probe green) + probe tool
f1a2110b fix(push): add missing push_config firestore rule — client enable-push was default-denied (AV138)
```

## Files Touched
- NEW `api/branch-line-oa.js` — admin-SDK serverless reader; GET ?branchId → `{ ok, lineAddUrl }` from `be_branches.settings.lineOaUrl`; returns ONLY the URL; branchId validation; fail-soft.
- `src/pages/PatientForm.jsx` — `sessionBranchId` + `branchLineUrl` state; capture branchId in the session onSnapshot; fetch `/api/branch-line-oa`; LINE card gate `(branchLineUrl || cs.lineOfficialUrl)`.
- `src/components/admin/OpdLifecycleRow.jsx` — rename "ดูข้อมูล OPD"→"ดูข้อมูลรับเข้า" (label/title + 2 state comments).
- `src/pages/AdminDashboard.jsx` — OPD-save toast renamed to match.
- NEW `tests/branch-line-oa-and-rename.test.js` (9/0) · `scripts/diag-patient-form-line-oa.mjs` (Rule R) · `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV139).

## Decisions (1-line each)
- Source per-branch LINE OA via NEW server endpoint (user-picked) reading `be_branches.settings.lineOaUrl` — be_branches is staff-only + holds secrets, so admin-SDK returns ONLY the public lin.ee URL.
- Endpoint mirrors `api/patient-view.js` (same secure anon-read pattern); same-origin so no CORS concern beyond the standard headers.
- Rename = cosmetic-shell (label/title/comments/toast only); `opd-view-btn` testid + `onViewOpd` handler byte-unchanged.
- My first diag MISSED the be_branches LINE field (printed only `name`) → proposed a more complex be_line_configs-based fix; the user's screenshot corrected it. Lesson: dump ALL relevant fields in a diag, not a subset.

## Next Todo
- USER L1: open `?session=<intake link>` → LINE OA button shows; re-enable push on device (rule live); confirm นัดหมาย card real-time + renamed "ดูข้อมูลรับเข้า".
- (optional) add push_config + branch-line-oa to the Rule B probe list (`01-iron-clad.md` — has user's uncommitted Rule S edits).

## Resume Prompt
See SESSION_HANDOFF.md Current State (EOD+7). master=7e2a5bd8=prod LIVE. All 4 session ships deployed + (endpoint/rule) L2-verified. Next = user L1 + next task. No deploy without "deploy" THIS turn (V18).
