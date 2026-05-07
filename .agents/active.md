---
updated_at: "2026-05-08 EOD #3 — V50 ProClinic strip COMPLETE + 2 brainstorming asks PENDING"
status: "master=POST-V50 (Phase 1-7 shipped, H-bis EXECUTED) · prod=c92f924 (8 commits behind: V49 + V50.Phase 1+2 + V50.Phase 3 + V50.Phase 4 + V50.Phase 7 + EOD #3 docs) · 7261/7266 tests PASS · build clean · 2,599 prod docs cleaned"
branch: "master"
last_commit: "EOD #3 docs (V50 V-entry + AV28 + active.md + SESSION_HANDOFF.md)"
tests: 7261
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = POST-V50.Phase 7 + EOD #3 docs · prod = `c92f924` (8 commits ahead pending `vercel --prod`)
- 7261/7266 tests PASS (5 pre-existing TFP failures: BSA T6.1 + phase-17-2-septies S3 — NOT V50-caused)
- Build clean: BackendDashboard chunk 1018→933 KB, AdminDashboard 398→383 KB
- **Iron-clad Rule H-bis = EXECUTED** (V50 closes the dev-only-scaffolding strip)
- V50 V-entry locked in `.claude/rules/00-session-start.md` § 2 above V49

## What V50 shipped (7 phases, ~12K LOC removed, 2,599 prod docs deleted)
Phases 1-2: runtime broker.* migration + ClinicSettingsPanel sections strip + infrastructure DELETED + test bank cleanup. Phase 3: cross-branch booking contract verified (existing `be_customers.branchId` already serves the role — Option A). Phase 4: kiosk → OPD-save auto-link cascade PROF-GRADE (64 vitest + 53 e2e on real prod, 10 chaos scenarios). Phase 5: full suite verify (7235/7240 PASS). Phase 6: Rule M data ops `--apply` on real prod, **2,599 docs DELETED** (pc_*=2097 + master_data=502 + clinic_settings/proclinic_session{,_trial}=2 + audit doc emit). Phase 7: AV28 audit invariant + 26 regression tests + V50 V-entry + memory updates + final commit `0780516`.

## Brainstorming asks (interrupted — RESUME NEXT SESSION)
Per user `/brainstorming` 2026-05-08 EOD #3 (image: ClinicSettingsPanel screenshot post-V50):
1. **NEW iron-clad rule (likely Rule P) + skill update**: when test FAILS, don't just fix that one — use as starting point, expand class-of-bug search across project, fix all related, only THEN stop. Codify the V42-V49 saga discipline that was practiced ad-hoc into a permanent rule. Skills to update: `systematic-debugging`, `verification-before-completion`. User verbatim: "อัพทั้งกฎทั้ง skills ไปเลย เพื่อความเก่งของตัวนายและระบบของเรา".
2. **Per-branch settings migration**: move ClinicSettingsPanel sections (LINE OA URL · CLINIC PHONE · ข้อมูลคลินิก [name EN, biz license, taxpayer ID, address TH/EN, email] · เวลาเปิด-ปิดคลินิก · เวลาทำการระบบแชท) into BranchFormModal CRUD. EXCLUDE `เวลาแพทย์เข้า` (replaced by per-branch staff schedule reads). Wire frontend consumers to read per-branch via BranchContext. Eliminate duplicate fields globally — fields that aren't per-branch shouldn't be duplicated in branch modal.

Brainstorming workflow STARTED: Explored ClinicSettingsPanel.jsx (V50-stripped, lines 1-80) + grepped 17 clinic_settings consumers + identified BranchFormModal.jsx (11.3K) as target. NO Q1-Q4 asked yet, NO design proposed yet, NO spec written yet.

## Next action
1. 🚨 **Combined `vercel --prod` for 8 commits ahead** (V18 — needs explicit "deploy" THIS turn; auth never rolls over)
2. **RESUME brainstorming**: invoke `Skill(brainstorming)` → ask Q1-Q4 → propose design → spec file → writing-plans → executing-plans across BOTH asks (rule + per-branch settings)
3. Optional follow-ups (post-deploy):
   - Delete dead master_data CRUD helpers in backendClient.js + scopedDataLayer.js (sanctioned exception in AV28.4 — orphan exports, zero callers)
   - Clean `firestore.rules` of pc_* / master_data / broker_jobs / proclinic_session match blocks (rules deploy + Probe-Deploy-Probe per Rule B)

## Outstanding (user-triggered)
- 🚨 V49 + V50.Phase 1-7 + EOD #3 docs `vercel --prod` (8 commits behind prod)
- Brainstorming asks #1 + #2 (next session — RESUME mid-flow)
- 5 pre-existing TFP test failures — separate task
