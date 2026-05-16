# 2026-05-18 — V73 deploy + 7 follow-up bugfixes + color picker + skill installs

## Summary

After V73 staff chat widget deploy this morning (`aff149e`), user-driven adversarial L1 testing surfaced 4+ user-visible bugs (V66 trust-collapse class repeat). Session resolved with 7 bugfixes + 2 features + skill installation from external MIT repo. 10 commits ahead of prod; awaiting deploy authorization (V18 lock).

## Current State

- master = `d686d3e` · prod = `aff149e` · **10 commits ahead**
- 10463 PASS / 0 FAIL / 12 skip · build clean
- No firestore rules / functions / probe changes this session — vercel-only deploy needed
- continuous-learning-v2 instinct system + 5 security skills + 1 cmd + 1 agent + audit-harness installed (not committed to repo — user-level + project-skills-folder)

## Commits (10 ahead of prod)

```
d686d3e fix(V73-BS1): badge state machine — confirmed label expanded + done driven by serviceCompletedAt
32c642c fix(V73-DR1): TFP doctor REQUIRED for "บันทึกสำหรับแพทย์" + "บันทึกสำหรับพนักงาน"
c1c2c99 fix(V71.B-ter): drop all gates on mark-complete — trust admin click
f7dae5e feat(V73 color-picker): per-device free hex color for name + bubble
532c3c9 fix(V71.B-bis): unlimited mark-complete ↔ un-mark toggle via persistent flag
06d0d57 fix(V73.RC1): RowCard advisor reads canonical advisorName field (V12-class)
a4d2cf8 feat(V73 name-edit): per-device chat name editing — header chip + edit modal
7c312b6 feat(skill): adopt audit-harness 7-dimension framework from everything-claude-code
884aab2 fix(V73-L1): 4 user-reported bugs from real-prod L1 + AV51 silent-listener-error class
5a4ba6b docs(V73-deploy): V73 Staff Chat Widget LIVE on prod + L1 instructions
```

## Files Touched

**Source (10 modified + 3 new)**:
- src/lib/staffChatColor.js NEW · src/lib/staffChatIdentity.js (+color helpers) · src/lib/staffChatClient.js (+senderColor) · src/lib/backendClient.js (+wasServiceCompleted)
- src/hooks/useStaffChat.js (loading/error/color/nameEdit threading)
- src/components/staffchat/{StaffChatWidget,StaffChatPanel,StaffChatHeader,StaffChatMessage,StaffChatNamePicker,StaffChatComposer}.jsx
- src/components/admin/AppointmentHubRowCard.jsx (advisor + mark-complete gate + badge state machine)
- src/components/TreatmentFormPage.jsx (doctor required for doctor-save)

**Tests (7 new + 5 V21 fixups)**:
- NEW: v73-l1-widget-fixes (21) · v73-name-edit (27) · v73-row-card-advisor-fix (6) · v73-mark-complete-unlimited-toggle (15) · v73-color-picker (48) · v73-dr1-doctor-required-doctor-save (9) · v73-bs1-status-badge-state-machine (13)
- V21 fixups: phase11-master-data-scaffold + backend-nav-config + v71-mark-service-completed + v73-l1-widget-fixes (C.3) + v73-staff-chat-widget-rtl (W5.4) + v73-name-edit (NE1.5/NE1.6)

**Docs**: docs/superpowers/specs/2026-05-18-chat-color-picker-design.md NEW (~210 lines) · SESSION_HANDOFF.md (Current State + new entry) · .agents/active.md (rewritten) · .agents/sessions/2026-05-18-v73-deployed-l1-instructions.md (post-deploy L1 instructions) · .agents/skills/audit-harness/SKILL.md NEW (~250 lines)

**Skills installed** (~/.claude/skills/ — NOT in repo):
- continuous-learning-v2 (12 files: SKILL.md + agents/ + hooks/ + scripts/ + config.json)
- security-review · security-bounty-hunter · safety-guard · workspace-surface-audit · production-audit
- commands/: evolve · instinct-{status,export,import} · projects · promote · security-scan
- agents/: security-reviewer

## Decisions

- **AV51 NEW**: globally-mounted widgets MUST self-resolve display data from React Context (not rely on prop) + MUST surface listener errors to UI banner (not swallow). Anti-V66 pattern.
- **V71.B-bis → ter**: 2-iteration gate relaxation. ter dropped ALL gates; trust admin's deliberate click + confirm dialog.
- **V73 color-picker palette**: free hex with native `<input type="color">` (user redirected from 8-color preset). No contrast clamp. Trust user.
- **Color storage**: per-message Firestore `senderColor` field embed. Past messages → fallback rose (own) / sky (other) via `resolveSenderColor`.
- **V73-DR1**: doctor required for staff + doctor saves, only `'vitals'` exception (nurse records vitals before doctor sees).
- **V73-BS1**: badge "done" driven by `serviceCompletedAt`, not `hasTreatmentForDay` (root cause of "stuck on เสร็จแล้ว" bug).
- **everything-claude-code curation**: 1 adopted (audit-harness), 229 SKIPPED with reasoning (most language-specific / our equivalents better / requires their runtime infra).
- **Instinct system install scope**: skill + commands placed user-level, but `hooks/observe.sh` NOT auto-wired to `~/.claude/settings.json` — manual opt-in only.
- **Deploy posture**: V18 strictly observed — 10 commits piled up local, awaiting explicit "deploy" verb.

## Lessons

- **V66 trust-collapse repeat**: V73 shipped with 8 test layers green; 4 user-visible bugs in <2 min L1. Vitest mocks + RTL + source-grep + Rule I flow-simulate + adversarial + admin-SDK e2e + pre/post probes ALL lied. Only real-browser preview_eval caught it. AV51 + explicit live verification per fix.
- **Multi-iteration on same gate** (V71.B-bis → ter): first relax retained partial preconditions; user reported still broken; second relax dropped everything. Lesson: when user says "ไปๆกลับๆไม่จำกัด" they mean ZERO conditions, not "weaker conditions". Trust admin's click.
- **Brainstorming HARD-GATE for new feature** (color picker): user redirected D1 free-hex; spec doc preserved + user-approved before code. Skill discipline kept design tight.
- **Rule N targeted-test-only**: ran full vitest 2x this session at batch milestones, targeted runs otherwise. Tests scaled smoothly.
- **External repo curation > bulk import**: everything-claude-code has 230 skills + 80 commands but most are language/framework-specific or duplicate our 24+ audit skills. Selective install (1 + 6) preserved our curation while extracting genuine new value.

## Next Todo

User-triggered:
1. `vercel --prod --yes` — combined deploy of 10-commit batch (vercel-only; no rules/functions/probes)
2. After deploy: Rule Q L1 multi-device hands-on per `.agents/sessions/2026-05-18-v73-deployed-l1-instructions.md` (30 V73 checks + V70/V71/V71.A/V71.B carry-over confirms)
3. (Optional) wire `~/.claude/skills/continuous-learning-v2/hooks/observe.sh` into `~/.claude/settings.json` for instinct auto-capture
4. (Optional) replace ffmpeg-synthesized MP3s with curated CC0 sounds from freesound.org / pixabay

## Resume Prompt

See SESSION_HANDOFF.md Resume Prompt block.
