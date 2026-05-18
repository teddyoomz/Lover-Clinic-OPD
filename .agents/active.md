---
updated_at: "2026-05-18 EOD+8 LATE — V83-followup-3 perm/tab mapping completeness (AV79)"
status: "V83 + 3 followups done · awaiting deploy verb"
branch: "master"
last_commit: "test(V83): V21 fixups — 6 backdrop-click tests flipped to 'DOES NOT close'"
tests: "Full vitest GREEN post-V21 fixups · build clean 2.76s · Rule Q L2 PASS"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef4bd5c3 LIVE (V83 NOT deployed)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- **V83 + V83-followup + V83-followup-2 + V83-followup-3 SHIPPED locally**:
  - V83: 56 modals stripped of backdrop-click (AV78) + link_request_management perm + phase tag cleanup
  - V83-followup: BackendArcBloom perm filter wire + sub-tab z-index above logo
  - V83-followup-2: sub-tab tilt sensing viewport-clamped (symmetric up/down)
  - V83-followup-3: **11 master-data tabs adminOnly→requires (AV79)** — perm grants for product/group/unit/instrument/branch/room/staff/doctor/holiday/permission/courses now ACTUALLY work
- **AV invariants added**: AV78 (modal backdrop) + AV79 (perm/tab mapping completeness)
- **All test banks GREEN**: M1-M5 + F1-F7 + P1-P5 (~50 V83 assertions) + 6 V21 fixups + full vitest.
- **Rule Q L2 PASS** on real prod: TEST-LINKREQ-V83 fixtures seeded across 2 branches, per-branch isolation verified, cleanup zero-orphan, audit doc emitted (`v83-l2-link-request-perm-verify-1779082269383-12e12359`).
- ~28+ commits ahead of prod · all pushed to `origin/master` · prod still at `ef4bd5c3`.

## What this session shipped
- **V83 Modal explicit-close-only universal fix** — Pain: "คลิ๊กพลาดปิด modal บ่อยจนอยากจะทุบคอมทิ้ง". Mechanical strip of `onClick={onClose}` / Pattern B currentTarget guard / state-setter dismissers from 56 modal backdrop divs (~80 instances). ESC + X + Cancel still close. 2 sanctioned exceptions: `StaffChatImageLightbox` + `TreatmentReadOnlyMirror` inner Lightbox (fullscreen image viewers). Each stripped backdrop carries `// AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)` marker.
- **AV78 invariant** added to `audit-anti-vibe-code` SKILL.md as HIGH priority + closed sanctioned exception list of 2 files (adding a 4th lightbox requires V-entry + test extension).
- **Source-grep regression bank** `tests/v83-modal-explicit-close-only.test.js` (M1-M5: sanctioned list closure + ZERO offenders + ESC/X presence + marker coverage + total count ≥40).
- **Rule I flow-simulate** `tests/v83-modal-explicit-close-flow-simulate.test.jsx` (F1-F7: backdrop click ignored × 22 vectors + X/Cancel/ESC close × 5 vectors + sanctioned lightbox exception verified + user-flow real-data scenario).
- **Permission polish**: added `link_request_management` key in settings module + flipped `tab=link-requests` `adminOnly:true` → `requires:['link_request_management']` (admin bypass implicit via canAccessTab) + stripped `(16.3)` from `system_config_management` label + `(29.22)` from `recall_management` label.
- **Permission unit + source-grep** `tests/v83-link-request-permission.test.js` (P1-P5: catalog presence + label exact match + tabPermissions wiring + canAccessTab 4-persona semantics + anti-regression label sweep + source-grep wiring locks).
- **6 V21 fixups** — backdrop-click test assertions flipped from "closes" → "DOES NOT close (V83/AV78)" in 5 recall modal tests + 1 link-requests tabPermissions test (adminOnly → requires).
- **2 bug fixes during run** — (a) MarketingFormShell:80 trailing backdrop onClick caught by M2.1; (b) OrderDetailModal:145 Batch 3 subagent's broken `{// AV78 ... }` JSX comment (parser ate `}`) → flat `// AV78 ...`. Build broke for ~5 min before second fix; now clean 2.76s.
- **Rule Q L2** real-prod admin-SDK verification PASS: 3 TEST-LINKREQ-V83 fixtures (2 BR_A + 1 BR_B) seeded → branch isolation verified → cleanup zero-orphan → audit emitted.
- **Checkpoint**: `.agents/sessions/` (next checkpoint via /session-end).

## Decisions (V83)
- **Mechanical strip > new wrapper component** (Q1=A) — 56 files × 1-3 line edit each is cheaper + lower risk than building shared `<Modal>` + migrating; AV78 source-grep regression locks the contract.
- **Closed sanctioned exception list of 2** — only fullscreen image lightboxes (StaffChatImageLightbox + TreatmentReadOnlyMirror inner) where click-anywhere-closes IS expected UX (Stripe/Linear convention).
- **Keep per-modal ESC handler as-is** (Q3=A) — don't centralize; minimal touch.
- **Universal permission key + per-branch via data-layer** (Q5=A) — `link_request_management` is universal; per-branch visibility happens at `listLinkRequests({branchId})` (already wired in LinkRequestsTab).
- **`// AV78 (EOD8): ...` line comment markers** (NOT `/* */` block) — uniform style across 42 files; avoids JSX parser edge cases.

## Next action
**Deploy when user types "deploy"** — combined queue is now LARGE:
- V83 (modal explicit-close-only + perm polish) — THIS SESSION
- EOD+7 ClinicLogo polish (rounds 1-7)
- EOD+5 Arc Fan polish rounds
- V82-Phone `257a699f`
- Sub-tab picker T1-T7
All vercel-only · NO firestore rules change since V82-Phone.

## Outstanding user-triggered actions
- **Deploy (vercel-only)** — explicit "deploy" verb required per V18
- **Rule Q L1 hands-on post-deploy**: open any modal → try clicking backdrop / outside → expect modal STAYS OPEN with form data preserved → click X / ESC / Cancel → modal closes. Repeat for 3+ representative modals (AppointmentForm, RecallCreate, WholeSystemBackup).
- **Per-branch link-request test post-deploy**: create staff user with `link_request_management` perm in branch A → log in non-admin → switch to branch A → confirm `tab=link-requests` visible + can approve/reject A's pending requests → switch to branch B → tab still visible but only B's records show
- **Chrome MCP extension reconnect** (carryover)
- **V82 Menu V2 mobile L1 re-test** (carryover)
- **Playwright L1 mouse-follow tilt** (E11 backend-menu-d.spec.js) when admin creds env set
