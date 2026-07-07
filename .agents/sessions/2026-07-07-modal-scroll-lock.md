# Checkpoint 2026-07-07 EOD+1 — Universal modal scroll-lock (AV205)

## Summary
Fixed a whole-app class bug: opening any modal and scrolling (finger/wheel) scrolled the
BACKGROUND page instead of the modal. 77 overlay files had containment in only 2 spots.
Shipped a 3-layer fix (hook + backdrop sweep + anti-confinement CSS). SHIPPED local, NOT deployed.

## Current State
- master `a5761d63` (11 commits ahead of prod `92b9ba15`); firestore.rules UNCHANGED → deploy = vercel-only, NO Probe-Deploy-Probe.
- full vitest **17,427/17,428** (1 fail = phase15.5b `global.fetch`-leak flake เดิม, green isolated 51/0; **0 V21 fixups this sweep**); build clean.
- Rule Q L1 Playwright trusted-wheel 4/4 + hook unit 9/0 + dynamic classifier 83/0; Q-vis screenshots eyeballed.
- Root: backend/admin scroll via an INNER scroller (AdminDashboard:5065) — body-lock alone never reaches it; wheel on backdrop chains INTO it.

## Commits
```
a5761d63 docs: AV205 V-entry + active.md EOD+1
dc8c232a test(e2e)+fix(css): AV205 L1 trusted-wheel 4/4 + layer-3 anti-confinement
aba19358 docs(audit): AV205 both SKILL.md (SY1)
7c90e7e4 test: AV205 dynamic classifier (83 checks)
4b62cfa1 fix(modals): sweep batch 4 — inline hosts
67a37758 fix(modals): sweep batch 3 — backend M-Z + recall/reports/nav
8ae291de fix(modals): sweep batch 2 — backend A-L
b78c36ec fix(modals): sweep batch 1 — root/staffchat/tablet
1ff6791a feat(scroll-lock): useModalScrollLock hook + css (layer 1)
2e9d07d1 docs(plan) · 4cf9e7e0 docs(spec)
```

## Files Touched
- NEW: `src/lib/useModalScrollLock.js` · `tests/use-modal-scroll-lock.test.jsx` · `tests/modal-scroll-lock-coverage.test.js` · `tests/e2e/modal-scroll-lock.spec.js`
- Modify: `src/index.css` (layer-1 rules + layer-3 anti-confinement) · `tests/e2e/helpers.js` (ArcBloom new-menu selector)
- Sweep (~68 overlay files): root (ImageLightbox/TreatmentTimeline/ChartTemplateSelector) · staffchat×6 · tablet-chart/PcPairingModal · backend A–Z (form/detail/confirm modals, MarketingFormShell shared) · recall×5 · reports×2 · nav/BackendCmdPalette · inline hosts (AdminDashboard 14, TFP 8, SaleTab 6, CustomerDetailView/DepositPanel/MembershipPanel/BackupManagerTab 4 each, WalletPanel 3, PointsPanel 2, PatientForm, ChatPanel)
- AV205: both `audit-anti-vibe-code/SKILL.md` copies · `.claude/rules/00-session-start.md` V-entry
- Spec/plan: `docs/superpowers/{specs,plans}/2026-07-07-modal-scroll-lock*.html`

## Decisions (1-line each)
- Approach A (2-layer + anti-confinement layer 3): shared hook + backdrop containment, NOT ModalShell refactor.
- Q1 = lock groups 1+2 (modal + lightbox/drawer/palette); dropdowns/print/full-screen editors NOT locked.
- Q2 = backdrop scroll is no-op (Stripe/Linear standard).
- Dedicated components gate the hook on their open-prop when they early-return; inline-host overlays use `<ModalScrollLock />` child.
- Sanctioned closed list enforced by classifier C1; StaffChatPanel keeps V82-fix7-bis (must NOT migrate).
- Layer-3 `:has(.fixed){transform:none}` neutralizes V86 hover-lift confinement only while a card contains an OPEN overlay (hover-lift invisible behind backdrop).
- NO agent fan-out (memory lock `feedback_no_large_agent_fanout`) — inline sweep, batch commits (Rule K).

## Next Todo
1. User L1 hands-on (นิ้วจริง iPad/มือถือ + จุดที่เคยเจอ): scroll on modal → เนื้อหา modal เลื่อน, background นิ่ง 100%, ปิดแล้วหน้าเลื่อนต่อ ตำแหน่งเดิม.
2. ถ้าโอเค → user พิมพ์ "deploy" (vercel only — rules ไม่เปลี่ยน).
- Known limit: iOS<16 no overscroll-behavior → touch residual on inner-scroller pages only (layer 1 covers body-scroll pages).

## Resume Prompt
Resume LoverClinic — 2026-07-07 EOD+1. AV205 modal scroll-lock SHIPPED local (master a5761d63, 11 ahead of prod 92b9ba15). Read CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md → .claude/rules/00-session-start.md → this checkpoint. 17,427/0 (1 flake). Status: idle — awaiting user L1 (นิ้วจริง) + explicit "deploy". No deploy without "deploy" (V18); rules unchanged → vercel-only.
