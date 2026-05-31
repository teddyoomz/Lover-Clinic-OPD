---
updated_at: "2026-05-31 EOD+2 — V139 (OPD course-step + appt status↔tab sync) + V138 SHIPPED + DEPLOYED + HEALED."
status: "V139 + V138 shipped + deployed (3342a9f0 LIVE @ lover-clinic-app.vercel.app) + Rule M heal applied (3 batches depleted→active). Awaiting user L1 hands-on prod."
branch: "master"
last_commit: "3342a9f0 — feat(backend): V138 negative-batch status invariant + V139 OPD course-step & appt status↔tab sync (combined; pushed + vercel --prod aliased)."
tests: "FULL vitest 15319/0 (698 files) + build clean + 2 TRUE-L2 e2e on real prod (V139 13/0 + V138 12/0) + theme-AA (Chrome MCP). V139: course-step 14/0 + status-sync 12/0 + flow-sim 17/0 + 4 V21 fixups."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "3342a9f0 LIVE (V138 + V139). Rule M heal applied on prod (audit heal-negative-batch-1780208334449-895a86e6)."
firestore_rules_version: "UNCHANGED — V138 + V139 frontend/lib only (no rules/storage/index/cron → no Probe-Deploy-Probe)."
---

# Active Context — V139 OPD course-step + status↔tab sync (2026-05-31 EOD+2) — SHIPPED

## State
- `/brainstorming → spec → writing-plans → executing-plans (inline, 8 tasks)`. 2 user-requested features for the Frontend "นัดหมาย วันนี้" card. **DONE + verified + DEPLOYED + HEALED** (commit `3342a9f0`).
- V138 (negative-batch status invariant) shipped in the SAME commit (shared backendClient.js + audit SKILL.md) + Rule M heal applied.

## What shipped (detail → checkpoint 2026-05-31-v139-opd-course-step-status-sync.md)
- **V139 Feature 1** — opt-in 4th "คอร์ส" step (card stepper): violet ✓=ตัดคอร์ส · amber "ยังไม่ตัด"=เสร็จแต่ไม่ตัด · เลขจาง=กำลังทำ. SSOT `resolveCourseDeducted`/`resolveCourseStepState` (reads `detail.*` — Rule R confirmed). `withCourseStep` opt-in → CDV history คง 3 ขั้น. Live ฟรี.
- **V139 Feature 2** — `decideApptStatusServiceSync` wired 3 backendClient chokepoints (mark/unmark/updateBackendAppointment). serviceCompletedAt = tab SSOT (filter ไม่แตะ). Live ฟรี cross-surface.
- **V138** — `resolveBatchStatusForRemaining` (negative=active DEBT visible). Heal: 3 batches (Augmentin −91, คอนฟอร์ม 2 นิ้ว −3, E.P.T.Q S500 −12 @ นครราชสีมา) → active. AV158 + AV159.

## Verified
- FULL vitest **15319/0** (698 files) + build clean + **2 TRUE-L2 e2e on real prod** (V139 13/0 + V138 12/0) + theme-AA (Chrome MCP: violet + amber AA both themes, 4 dots fit 360+300px) + heal idempotent (re-run = 0).

## Honest Rule Q gap
USER L1 post-deploy = ASSEMBLED real-browser flow on auth-gated AdminDashboard: deduct a real course → course dot lights live; mark-complete/edit-modal-status cross-surface → card hops tab live cross-device.

## Next action
Idle / await user L1 confirmation. If a bug surfaces in L1 → `/systematic-debugging` + Rule P.

## Outstanding (user-triggered)
- **L1 hands-on prod** (V139 course-step live + status→tab cross-surface; V138 ปรับเพิ่ม batch ติดลบ → ยอดคงเหลือ ไม่หาย).
- Pre-existing (large, NOT deploy-gating): extended-suite 280 stale tests.
