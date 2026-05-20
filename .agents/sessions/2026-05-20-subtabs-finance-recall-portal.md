# Session 2026-05-20 EOD+1 — Sales+Finance sub-tabs + Backend Menu D bug fixes (dup header + recall modal flicker)

## Summary

Three features (sales cancelled sub-tab, finance finished-deposit sub-tab, a comprehensive cross-wiring test bank) + two `/systematic-debugging` rounds fixing a Backend Menu D class-of-bug (duplicate header + recall modal flicker→freeze) on both the backend customer-detail and the frontend Recall tab. All UI-only, ALL LOCAL (nothing deployed). ~16 commits, 149 new tests, full vitest 13657 PASS / 24 pre-existing FAIL / 25 skip.

## Current State

- master = origin = `29f139d1` (clean, all pushed). Prod still `0511be1e` (V43-followup) — nothing this session deployed.
- 149 NEW tests GREEN: sales-subtab 32 + finance/cross-wiring 82 + menu-D-bugfix 35.
- Full vitest 13657 PASS / 24 FAIL (identical 10-file pre-existing baseline) / 25 skip · build clean.
- All work UI-only — no backend/rules/data/BSA change. Reactivity verified (reload-after-action + re-mount-on-nav; no listener added per user verify-first choice).
- Specs/plans in `docs/superpowers/{specs,plans}/2026-05-20-*`.

## Commits

```
29f139d1 docs(recall-portal-round2): frontend Recall tab fixed (all 6 recall modals portal)
c5317079 fix(recall): portal RecallLineTemplate + RecallCaseForm modals (Rule P round 2)
4db6016e docs(backend-menu-d-fixes): customer-detail dup header + recall flicker (local)
92fad5fc fix(backend-menu-d): customer-detail dup header + recall modal flicker→freeze
c29ccad3 docs(finance-subtab+tests): finance sub-tab + comprehensive test bank
49ac68c4 test(subtab): stress (mulberry32) + e2e user simulation
968a135e test(subtab-wiring): cross-surface creation routing (sale + deposit)
ebb2c0c0 test(finance-subtab): flow-simulate + source-grep + UI mirrors
28b74045 feat(finance-subtab): split finished deposits into สิ้นสุดแล้ว
c56b4db4 feat(finance-subtab): pure depositSubTabFilter helper + unit tests
(+ earlier: sales-subtab spec/plan/helper/impl/tests; finance spec/plan)
```

## Files Touched (names only)

Source: `src/lib/saleSubTabFilter.js` (NEW) · `src/lib/depositSubTabFilter.js` (NEW) · `src/components/backend/SaleTab.jsx` · `src/components/backend/DepositPanel.jsx` · `src/pages/BackendDashboard.jsx` (breadcrumb gate) · `src/components/backend/recall/{RecallCreate,RecallEdit,RecallOutcome,RecallSnoozeMenu,RecallLineTemplate,RecallCaseForm}Modal.jsx` (createPortal ×6).

Tests (NEW): `sale-subtab-filter` · `sales-cancelled-subtab-flow-simulate` · `deposit-subtab-filter` · `finance-finished-deposit-subtab-flow-simulate` · `sales-subtab-wiring-flow-simulate` · `finance-subtab-wiring-flow-simulate` · `subtab-filters-stress` · `subtab-e2e-user-simulation` · `recall-modal-portal-and-header-dedup`. V21 fixups: `backend-menu-d-bugfix-orb-and-mode-toggle` (B2.2/B2.4).

Docs: audit-anti-vibe-code SKILL.md (+AV98) · 2 spec HTML + 2 plan HTML · active.md · SESSION_HANDOFF.md.

## Decisions (1-line each)

- Sales Q1=A 2 sub-tabs / Q2=A active-dropdown drops cancelled + cancelled-tab hides dropdown / Q3=B no badge.
- Finance Q1=A pill in DepositPanel / Q2=B finished=used+cancelled+refunded+expired / Q3=A labels ใช้งานอยู่/สิ้นสุดแล้ว / Q4=A scoped dropdown both pills.
- `active|partial` = usable matches codebase getDepositBalance convention (lines 2863/3746/3827/4283).
- Reactivity: verify-first, listener only if gap — none found.
- Bug #1 root cause: BackendDashboard viewing-customer breadcrumbSlot rendered Frontend/Branch/Theme/Profile unconditionally; sibling branch already classic-gated. Fix: gate it.
- Bug #2 root cause: V86 auto-glow `:hover{transform:translateY(-3px)}` on `rounded-xl/2xl` cards (TWO scopes: backend-new-menu + `.admin-frontend-zone`) hijacks `fixed inset-0` modal containing block → confine + hover-feedback loop → freeze. Fix: portal modals (user chose KEEP V86 lift). Full reasoning + AV98 → `.agents/skills/audit-anti-vibe-code/SKILL.md` AV98.
- Rule P lesson: round 1 fixed 4 modals (RecallCard); round 2 +2 missed (RecallFrontendView). Class grep must span the whole modal SET, not one rendering component. Group-D test locks recall-dir completeness.

## Next Todo

1. **User L1 hands-on** (Rule Q V66, real ~2000px screen — preview headless 11px can't show visual): dup-header gone on customer detail; recall modal centered+no-flicker on backend customer-detail AND Frontend นัดหมาย→Recall; sub-tab pills work.
2. **Deploy** — one combined `vercel --prod` (V18 explicit "deploy" required) for all this-session work.
3. 24 pre-existing failures cleanup (separate batch).
4. V106 stock-movement 30-day retention (brainstorm locked, spec unwritten).

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-20 EOD+1.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=29f139d1, prod=0511be1e)
3. .agents/active.md (13657 PASS / 24 pre-existing FAIL)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-20-subtabs-finance-recall-portal.md

Status: master=29f139d1, full vitest 13657 PASS / 24 pre-existing FAIL, prod=0511be1e LIVE
Next: idle — await user "deploy" + L1 hands-on (sub-tabs + Menu-D bug fixes, all LOCAL)
Outstanding (user-triggered): deploy all this-session work · L1 hands-on (dup-header + recall modal both surfaces + sub-tab pills) · 24 pre-existing fails cleanup · V106 spec
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe; Rule Q V66 L1/L2 before "verified"
/session-start
```
