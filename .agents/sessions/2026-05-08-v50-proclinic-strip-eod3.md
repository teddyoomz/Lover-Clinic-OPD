# 2026-05-08 EOD #3 — V50 ProClinic strip COMPLETE (Phase 3-7) + brainstorming asks PENDING

## Summary

V50 ProClinic strip closed end-to-end across Phase 3-7 in single push per user "phase 5 - phase 7 ไปเลยยย จะได้จบๆ". Iron-clad Rule H-bis flipped from "IN PROGRESS" → **EXECUTED**. 7 commits on master (8 ahead of prod) including final EOD #3 docs commit. Two new brainstorming asks introduced at session end were INTERRUPTED at Explore phase — must resume next session via `Skill(brainstorming)`.

## Current State

- master = POST-V50.Phase 7 + EOD #3 docs
- prod = `c92f924` (8 commits behind — V49 + V50.Phase 1+2 + V50.Phase 3 + V50.Phase 4 + V50.Phase 7 + EOD #3 docs)
- 7261/7266 vitest PASS (5 pre-existing TFP failures: BSA T6.1 + phase-17-2-septies S3)
- Build clean (BackendDashboard 1018→933 KB, AdminDashboard 398→383 KB)
- Rule H-bis EXECUTED · Rule O complete · AV20-AV28 invariant set complete

## Commits (this session, EOD #3)

```
1c67baf test(V50 Phase 3): cross-branch booking contract verification + e2e
59f7aa8 test(V50 Phase 4): kiosk → OPD-save auto-link cascade PROF-GRADE bank
0780516 refactor(V50 Phase 6+7): ProClinic residue cleanup + AV28 + H-bis EXECUTED
<EOD>   docs(agents): EOD 2026-05-08 #3 — V50 saga COMPLETE + brainstorming asks pending
```

(Phase 5 = full vitest verify; no commit. Phase 6 = data ops via `--apply` script; one commit folded with Phase 7.)

## Files Touched (highlights, no diffs)

NEW source / scripts:
- `scripts/v50-phase6-cleanup-proclinic-residue.mjs` (Rule M two-phase)
- `scripts/e2e-v50-phase3-cross-branch-booking.mjs` (30 assertions on real prod)
- `scripts/e2e-v50-phase4-kiosk-opd-cascade.mjs` (53 assertions, 10 chaos scenarios)

NEW tests:
- `tests/v50-phase3-cross-branch-booking-flow-simulate.test.js` (46 tests, F1-F6)
- `tests/v50-phase4-kiosk-opd-cascade-prof-grade.test.js` (64 tests, F1-F12 prof-grade categories)
- `tests/v50-av28-no-proclinic-imports.test.js` (26 tests, AV28.0-AV28.6)

MODIFIED memory + rules:
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV28 entry added above AV27)
- `.claude/rules/00-session-start.md` (V50 V-entry inserted above V49)
- `SESSION_HANDOFF.md` (current state + new EOD #3 entry + Resume Prompt)
- `.agents/active.md` (rewritten for EOD #3 + brainstorming-pending)

## Decisions (1-line each)

- **Phase 3 = Option A** — skip schema change; existing `be_customers.branchId` already serves creation-branch role. Rule C3 lean schema preserved.
- **Phase 4 = prof-grade test methodology lock** — 12 categories: source-grep + simulator + property-based mulberry32×100 + cross-branch toString.grep + adversarial Thai/Unicode/NUL/10K + idempotency + forward-compat + class-of-bug classifier + lifecycle + chaos + V50 markers.
- **Phase 4 sharp edge documented** — kiosk@A + admin-switched-to@B leaves customer.branchId=B but appt.branchId=A; production code does NOT auto-correct (admin should stay on kiosk's branch). Documented as intentional in test J.1-J.3.
- **Phase 6 = Rule M two-phase + admin-SDK + canonical artifacts/{APP_ID}/public/data/ path** — single dry-run + single apply cycle, zero migration bugs (no PEM-parse / bare-collection-path drift like V15 #22).
- **Phase 7 AV28 sanctioned exception** — backendClient.js + scopedDataLayer.js retain orphan `master_data/*` CRUD exports (zero callers); structural delete deferred as a focused refactor commit later.
- **Brainstorming workflow STARTED but interrupted** — todo list captures Q1-Q4 + propose + spec + writing-plans steps as breadcrumbs for next session.

## Lessons (full reasoning → v-log-archive.md V50 entry)

- Multi-phase strip ordering — runtime callers FIRST, infrastructure SECOND, tests THIRD, verification FOURTH, data ops FIFTH, audit invariant SIXTH — prevents test mocks from masking broken runtime paths (V11/V12 risk).
- Schema verification before deletion — proven existing field semantically meant the new field's role; saved a duplicate-field commit.
- Rule M two-phase + admin-SDK + canonical path is the iteration-speed AND blast-radius-control sweet spot. Local + dry-run-first + audit-doc emit caught bugs in <10 min during V15 #22; would have been a redeploy + new probe cycle if UI-triggered.
- AV28 grep is the architectural backstop — re-introducing brokerClient.js or /api/proclinic/* post-V50 fails the audit at next pre-release pass. Future ProClinic interop (if ever) must come through a NEW well-defined integration boundary.

## Brainstorming asks (PENDING — interrupted at Explore phase)

User invoked `/brainstorming` 2026-05-08 EOD #3 with image (ClinicSettingsPanel screenshot post-V50) and 2 directives (verbatim Thai):

1. **NEW iron-clad rule (likely Rule P) + skill update** — "ถ้า Test แล้วเจอ Failed อย่าแก้แค่ failed นั้นๆแล้วจบ ให้เอา failed นั้นมาขยายผล และหาสิ่งที่เป็นไปได้ที่คล้ายๆกันเพื่อขยายผลการหาบั๊คที่คล้ายๆกันหรือต่อเนื่องกันในจุดอื่นๆของโปรเจ็ค และเทสจนจบ แก้บั๊คจนหมด ถึงหยุด test และหยุดทำงานได้". Codify the V42-V49 saga discipline (practiced ad-hoc) into a permanent rule. Skills to update: `systematic-debugging` (class-of-bug expansion BEFORE proposing fix) + `verification-before-completion` (don't claim done until adjacent surfaces grep'd).

2. **Per-branch settings migration** — move ClinicSettingsPanel sections into BranchFormModal CRUD: LINE OFFICIAL ACCOUNT URL · CLINIC PHONE · ข้อมูลคลินิก (name EN, biz license, taxpayer ID, address TH/EN, email) · เวลาเปิด-ปิดคลินิก (Mon-Fri / Sat-Sun) · เวลาทำการระบบแชท (Mon-Fri / Sat-Sun + Always On). EXCLUDE `เวลาแพทย์เข้า` (replaced by per-branch staff schedule reads). Wire frontend consumers (17 files reference clinic_settings — App.jsx · AdminDashboard.jsx · BackendDashboard.jsx · ChatPanel.jsx · DocumentPrintModal.jsx · LineSettingsTab.jsx · SalePrintView.jsx · backendClient.js · branchBackupCore.js · BranchContext.jsx · documentPrintEngine.js · documentTemplateValidation.js · lineConfigClient.js · lineTestClient.js · permissionGroupValidation.js · systemConfigClient.js · tabPermissions.js) to read per-branch via BranchContext. Eliminate duplicate fields globally — fields that aren't per-branch shouldn't be duplicated in branch modal.

**Workflow status**: Explore phase done (ClinicSettingsPanel.jsx 1-80 read · BranchFormModal.jsx 11.3K identified · 17 consumers grepped). Q1-Q4 NOT asked. Design NOT proposed. Spec NOT written. Plan NOT created.

## Next Todo

1. 🚨 **Combined `vercel --prod`** for 8 commits ahead of prod (V18 — explicit "deploy" THIS turn).
2. **RESUME brainstorming**: invoke `Skill(brainstorming)` → ask Q1-Q4 (one at a time) → propose 2-3 approaches with tradeoffs → present design sections → write spec → user review → writing-plans → executing-plans across BOTH asks.
3. Optional follow-ups (post-deploy):
   - Delete dead `master_data/*` CRUD helpers in backendClient.js + scopedDataLayer.js (sanctioned exception in AV28.4 — orphan exports, zero callers).
   - Clean `firestore.rules` of pc_* / master_data / broker_jobs / proclinic_session match blocks (rules deploy + Probe-Deploy-Probe per Rule B).

## Resume Prompt

```
Resume LoverClinic — V50 COMPLETE; resume interrupted brainstorming asks.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=POST-V50 EOD #3, prod=c92f924 — 8 commits ahead)
3. .agents/active.md (7261/7266 tests · brainstorming PENDING at Explore phase)
4. .claude/rules/00-session-start.md (iron-clad A-O + V42-V50 V-summary)
5. .agents/sessions/2026-05-08-v50-proclinic-strip-eod3.md (this file)

Status: V50 ProClinic strip COMPLETE — 7 phases shipped, ~12K LOC removed, 2,599 prod docs deleted, AV28 invariant + 26 regression tests, V-entry locked, **Rule H-bis EXECUTED**.

Next: invoke `Skill(brainstorming)` for 2 pending asks: (1) NEW iron-clad rule + skill updates for class-of-bug expansion (codify V42-V49 saga discipline); (2) Per-branch settings migration (ClinicSettingsPanel → BranchFormModal CRUD, EXCLUDE เวลาแพทย์เข้า, wire 17 consumers via BranchContext).

Outstanding (user-triggered):
- 🚨 V49 + V50 + EOD #3 vercel --prod (V18 — explicit "deploy" THIS turn) [8 commits ahead]
- 5 pre-existing TFP test failures — separate task

Rules: Rule J brainstorming HARD-GATE (plan-mode ORTHOGONAL — invoke Skill FIRST); deploy auth never rolls over; Rule N targeted-test-only; Rule M data-ops local + admin-SDK; V37 NEVER `git add -A`.

/session-start
```
