---
updated_at: "2026-05-20 EOD+1 — Sales+Finance cancelled/finished sub-tabs + Backend Menu D customer-detail/frontend bug fixes (dup header + recall modal flicker, AV98) — ALL LOCAL"
status: "✅ 3 features + 2 bug-fix rounds shipped LOCAL · Rule Q L1 structural-verified on real prod · awaiting user 'deploy' + L1 hands-on"
branch: "master"
last_commit: "29f139d1 docs(recall-portal-round2): session state — frontend Recall tab fixed (all 6 recall modals portal)"
tests: "149 NEW GREEN this session · full vitest 13657 PASS / 24 pre-existing FAIL (unrelated baseline) / 25 skip · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0511be1e LIVE (V43-followup) — NOTHING from this session deployed yet"
firestore_rules_version: "unchanged (all this-session work is UI-only — no rules/data ops)"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = origin = `29f139d1` (clean, all pushed). ~16 commits this session. Prod still `0511be1e`.
- Everything this session is UI-only / client-side — no backend, no Firestore rules, no data ops, no BSA change.
- Full detail: `.agents/sessions/2026-05-20-subtabs-finance-recall-portal.md`.

## What this session shipped (all LOCAL, awaiting deploy)

- **Sales cancelled sub-tab** (SaleTab): การขาย / ยกเลิกแล้ว · helper `src/lib/saleSubTabFilter.js` · spec+plan in docs/superpowers.
- **Finance finished-deposit sub-tab** (DepositPanel): ใช้งานอยู่ (active+partial) / สิ้นสุดแล้ว (used+cancelled+refunded+expired) · scoped dropdown per pill · helper `src/lib/depositSubTabFilter.js`.
- **Comprehensive cross-wiring test bank** (114 tests): helpers + flow-simulate + source-grep + UI mirrors + cross-wiring routing (TFP auto-sale + Frontend booking-pair, source-grep grounded) + mulberry32 stress + e2e user simulation.
- **Bug fix #1 — dup header** (new menu, customer detail): BackendDashboard breadcrumbSlot gated controls `menuMode==='classic'` (was unconditional → 2× branch/theme/profile).
- **Bug fix #2 — recall modal flicker→freeze** (new menu backend + `.admin-frontend-zone` frontend): V86 auto-glow `:hover{transform}` on rounded cards hijacked the `fixed inset-0` recall modals' containing block → portal ALL 6 recall modals (Create/Edit/Outcome/Snooze/LineTemplate/CaseForm) to `document.body`. Round 1 = 4 (backend); Round 2 (Rule P) = +2 missed (frontend). AV98 + group-D completeness test.
- Reactivity ("ไม่ต้อง refresh"): verified reload-after-action + re-mount-on-nav → no listener needed (user chose verify-first).

## Next action

- Idle — await user "deploy" (Vercel; Firebase rules unchanged) + L1 hands-on.

## Outstanding user-triggered actions

- **Deploy** all this-session work — one combined `vercel --prod` (V18: needs explicit "deploy" this turn).
- **L1 hands-on** (real ~2000px screen — preview is headless 11px): (a) customer detail new menu → ONE branch/theme/profile; (b) Recall modal (backend customer-detail AND Frontend นัดหมาย→Recall) opens centered, no flicker/freeze; (c) sub-tab pills on `tab=sales` + `tab=finance&subtab=deposit`.
- **24 pre-existing test failures** (backend-menu-d ×4 / audit-branch-scope AV37 / phase-26-0 / rp1 / tf3 / v36 / v81-emulator) — separate cleanup batch; all unrelated.
- **V106 stock-movement 30-day retention** — brainstorm locked, spec NOT written; awaiting "ship V106".
