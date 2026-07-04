# Checkpoint 2026-07-05 — Recall reason + VIP system + staffchat cards (spec ①-⑥) + hunt loop converged

## Summary
Shipped the 6-feature batch (recall reason timeline · VIP gold system · TFP staff-chat
cards · intake/assessment card buttons) local on master — NOT deployed. Adversarial
bug-hunt loop converged: R1 (Workflow, 28 agents) confirmed 8 real bugs → all fixed;
R2 (inline — subagents hit session limit, user directed inline) found 0.

## Current State
- master `d4c977ce` = origin; prod `49032ef0` (19 commits behind master).
- full vitest **17146/17146** (1 perf-budget flake `subtab-filters-stress S4.2` passes isolated 10/0); build clean.
- firestore.rules LOCAL change staged: be_staff_chat_messages create gains narrow `tfp-vitals`/`tfp-doctor` allowlist (probe #18 in Rule B) — **TFP cards LIVE-GATED on rules deploy**; writer non-fatal until then.
- Rule Q: **VIP L2 ALL PASS real prod** (`scripts/diag-vip-l2.mjs`) · **TFP-card L2 pre-deploy ALL PASS** (`scripts/diag-tfp-chat-card-l2.mjs` — dual-mode, DENIED-as-expected + forge-intake DENIED).
- AV201 (recall reason everywhere) / AV202 (VIP surface classifier) / AV203 (system-card kinds) in BOTH SKILL.md copies (SY1 green).

## Features
- **① Recall reason**: RecallRow timeline (reason node ALWAYS `data-note-source="reason"` + outcome node) + amber reason strip in RecallOutcomeModal/RecallSnoozeMenu/RecallLineTemplateModal.
- **② VIP**: CDV toggle (`{vip, vipAt, vipBy}`, staff ทุกคน) → VipProvider (single `where('vip','==',true)` listener, 2 App.jsx staff mounts) → VipName/VipBadge gold (dark `#fbbf24` / light `#b45309`, AA) across ~25 internal surfaces real-time; customer-facing/print = zero imports.
- **③④ TFP cards**: `tfpStaffChatNotify.js` builder/writer (deterministic `CHAT-SYS-TFP-{tid}-{vitals|doctor}`, non-fatal) fired after vitals/doctor save; BackendDashboard `?treatment=` deep link → TFP edit; violet doctor card + โดยแพทย์; v2-A tinted buttons.
- **⑤⑥ Card buttons**: intake → StaffChatIntakeModal (shared `OpdIntakeDetailBody` extracted from AdminDashboard + `synthesizeSessionFromCustomer` fallback); followup → StaffChatEdModalLauncher → real EDDetailModal.

## Hunt loop (R1 → fixed → R2 clean)
R1's 8 confirmed (locks in `tests/2026-07-04-bughunt-r1-fixes.test.jsx`, 25 asserts):
1. Chat-launched modals below panel z-9000 → z-[9600] tier; EDDetailModal `zClassName` prop (CDV keeps z-110).
2. EdLauncher mount race → `assessLoaded` gate (first assessments snapshot before EDDetailModal captures primary).
3. Modal state evicted by 50-msg window → `StaffChatSystemModalHost` (widget-level, click-time snapshot; hostless fallback).
4. Synthetic session false "ไม่มี" health data → `reverseMapCanonicalPatientData` (canonical→kiosk: allergies/underlying/gender/idCard/nationality/pregnanted/howFoundUs) + medication renders '-'.
5. Cross-branch edit split cards → TFP edit uses persisted `loadedTreatmentBranchId`.
6. useTheme write-effect × N rows → `useResolvedTheme` (read-only useSyncExternalStore singleton).
7. Badge clipped by truncate → VipName renders badge as SIBLING fragment.
8. ESC closed all stacked modals → `useEscToClose` LIFO stack (EDDetailModal + both chat modals).
R2 inline lenses (fix-regression / reverse-map / vip-surfaces / staffchat-flow / theme-store) = 0 findings. 10 full-suite V21 fixups repointed (LR4 window, OBC.D, PhoneLink split-count, AV198 OR-form, V135 tagName, AV50 classifier 7).

## Commits
```
d4c977ce docs: active.md — batch complete, hunt loop converged
d45d215c fix: bug-hunt R1 — 8 confirmed findings
646a940c test: V21 fixups — 10 full-suite fails repointed
94c13637 test: bank recall-timeline + vip + staffchat cards + AV201-203 + L2 scripts
4490dd2d feat(staffchat): tfp card kinds + deep link + view buttons
c8ee72b8 feat(rules): staff-client tfp-* system cards (narrow) + probe #18
1b744ce4 feat(staffchat): TFP vitals/doctor save writes system card
9f80efd5 feat(vip): gold-allowed rule update + form-save vip survival
(+11 earlier feature/test commits this batch)
```

## Files Touched (key)
src: RecallRow/RecallOutcomeModal/RecallSnoozeMenu/RecallLineTemplateModal · VipContext.jsx(NEW) VipBadge.jsx(NEW) CustomerOption App.jsx CustomerDetailView + ~20 VIP surfaces · tfpStaffChatNotify.js(NEW) TreatmentFormPage BackendDashboard customerNavigation firestore.rules · OpdIntakeDetailBody.jsx(NEW) AdminDashboard StaffChatIntakeModal.jsx(NEW) StaffChatEdModalLauncher.jsx(NEW) StaffChatSystemCard StaffChatSystemModalHost.jsx(NEW) StaffChatWidget EDDetailModal useTheme.js useEscToClose.js(NEW) opdSessionState.js
tests: recall-reason-timeline · vip-context-badge · vip-surface-classifier · vip-write-shape · tfp-staffchat-cards · staffchat-card-buttons-rtl · 2026-07-04-recall-vip-cards-flow-simulate · 2026-07-04-bughunt-r1-fixes + 13 V21 fixup files
scripts: diag-vip-l2.mjs · diag-tfp-chat-card-l2.mjs

## Decisions (1-line each)
- Gold on names ALLOWED (user 2026-07-04 "ชื่อสีทองได้นะห้ามแดงเฉยๆ") — 04-thai-ui.md + memory updated; red still forbidden.
- Card mechanism = client-write + narrow rules (not Cloud Function); intake/followup kinds stay unforgeable.
- VIP = single-listener context keyed by customerId (never denormalized-name edits); provider never at App root (anon perm-denied + leak guarantee).
- Deep link mirrors the onEditTreatment opener field-for-field (AV50 customerId invariant, callsite #7).
- Synthetic-session fix at the synthesize chokepoint (all consumers benefit), not per-display dual-reads.

## Next Todo
1. User says "deploy" → V15 combined (vercel --prod + firebase deploy --only firestore:rules) + Probe-Deploy-Probe probes 1,5,6,7,8,9,12,15,16,17,**18** + rerun `diag-tfp-chat-card-l2.mjs` (auto post-deploy mode: staff create SUCCESS + forge DENIED + dup DENIED).
2. Post-deploy user L1: TFP บันทึกซักประวัติ/แพทย์ → card in the branch chat + ปุ่มเปิด TFP ถูกใบ · VIP toggle → gold everywhere instantly · card modals open ABOVE the chat panel (mobile too).

## Resume Prompt
See SESSION_HANDOFF.md / emitted at session end.
