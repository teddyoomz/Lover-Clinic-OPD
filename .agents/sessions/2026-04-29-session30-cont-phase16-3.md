# Session 30 (cont.) — 2026-04-29 EOD — Phase 16.3 + V15 #9 + 16.3-bis

## Summary

8 commits closing 4 distinct work items: V36 stock-bug cluster (multi-writer-sweep + name-fallback + master_data removal), V36-quater/quinquies course-history audit + real-time listeners, Phase 16.3 System Settings tab (per master Phase 16 plan), and a same-day 16.3-bis fix when user reported the override toggles weren't actually wired to consumers. V15 #9 combined deploy shipped Phase 16.3 to production (firestore.rules version 20 → 21).

## Current State

- master = `ced094d` · production = `f4e6127` (V15 #9) · 1 commit unpushed-to-prod (16.3-bis fix)
- **3771/3771** tests pass · build clean · firestore.rules version 21
- Probe-Deploy-Probe Rule B clean both sides V15 #9
- 0 known regressions; 16.3-bis behaviour verified via test bank (consumer-hook now passes overrides 4th arg)

## Commits

```
ced094d fix(tab-access): Phase 16.3-bis — wire tabOverrides through useTabAccess hook
e5ff48b docs(handoff): V15 #9 deployed — Phase 16.3 System Settings + V36-quater/quinquies LIVE
f4e6127 feat(system): Phase 16.3 — System Settings tab + per-tab overrides + feature flags + audit trail
0dd147c fix(customer-detail): V36-quinquies — real-time listeners on customer doc + course-changes
db6d84e fix(course): V36-quater — purchased-in-session call site missed by V36-bis sweep
6f8af43 fix(stock+course): V36-bis/tris — name-fallback + master_data removal + course-history reorder
c2f0661 docs(handoff): session 30 EOD — V36 + V15 #8 deploy LIVE
ae760c7 fix(stock): V36 — multi-writer-sweep + fail-loud + phantom-branch fallback
```

## Files touched

- src/lib/backendClient.js (V36 + V36-bis + V36-tris + V36-quater + V36-quinquies + Phase 16.3 toggle)
- src/lib/BranchContext.jsx (V36 phantom-branch fallback)
- src/lib/tabPermissions.js (Phase 16.3 overrides param + system-settings tab)
- src/lib/permissionGroupValidation.js (system_config_management key)
- src/lib/systemConfigClient.js NEW
- src/hooks/useSystemConfig.js NEW
- src/hooks/useTabAccess.js (16.3-bis wire)
- src/components/TreatmentFormPage.jsx (V36-quater both call sites)
- src/components/backend/CourseHistoryTab.jsx (V36-quinquies live listener)
- src/components/backend/CustomerDetailView.jsx (V36-quinquies liveCustomer)
- src/components/backend/SystemSettingsTab.jsx NEW
- src/components/backend/SystemConfigAuditPanel.jsx NEW
- src/components/backend/nav/navConfig.js (system-settings entry)
- src/pages/BackendDashboard.jsx (lazy import + render case)
- firestore.rules (system_config narrow match + audit prefix exception; v20 → v21)
- api/admin/wipe-master-data.js NEW (V36-tris)
- 9 NEW phase16.3-* / v36-* test files + 6 legacy regression updates
- docs/superpowers/specs/2026-04-29-phase16-3-system-settings-design.md NEW

## Decisions (1-line; full reasoning in v-log-archive.md / spec doc)

- V36 — every batch-creating writer must route through `_ensureProductTracked` (V12 multi-writer mirror)
- V36-bis — productName fallback resolver in `_deductOneItem` + reverted V36 throw → silent-skip per "ห้ามพลาดไม่ว่า submit จากไหน"
- V36-tris — H-quater iron-clad: NO master_data reads in feature code; admin endpoint `/api/admin/wipe-master-data` for cleanup
- V36-quater — sibling miss at TFP:2654 purchasedDeductions; use resolved `purchasedNewTid`
- V36-quinquies — listenToCustomer + listenToCourseChanges helpers; CustomerDetailView liveCustomer state
- Phase 16.3 Q1-D — tabOverrides accept hidden / requires-add / adminOnly all 3 patterns
- Phase 16.3 Q2-C — write gated by NEW `system_config_management` permission key + admin bypass
- Phase 16.3 Q3-A — full audit per write to be_admin_audit/system-config-{ts} via writeBatch
- Phase 16.3 Q4-C — allowNegativeStock=false blocks NEW negatives but PRESERVES auto-repay path
- Phase 16.3-bis — useTabAccess consumer-hook now passes `overrides` to all 3 forwarded helpers (V12 lock-in test C.1-3)

## Next todo

1. User QA on dev (localhost:5173 — HMR live) for 16.3-bis fix:
   - set tabOverrides.<id>.hidden=true → switch to non-admin persona → tab disappears from sidebar
   - set tabOverrides.<id>.adminOnly=true → non-admin sees nothing; admin sees tab
   - toggle allowNegativeStock=false → treatment with shortfall → throw STOCK_INSUFFICIENT_NEGATIVE_DISABLED
2. Decision: V15 #10 deploy auth (1 commit ced094d) OR proceed 16.2 Clinic Report brainstorm
3. 16.4 Order tab intel — debug `MODULE_NOT_FOUND` in scraper repo OR alternate via Chrome MCP

## Resume prompt

```
Resume LoverClinic — continue from 2026-04-29 EOD (session 30 cont.).
Read: CLAUDE.md → SESSION_HANDOFF.md (master=ced094d, prod=f4e6127) →
  .agents/active.md (3771 tests) → .claude/rules/00-session-start.md →
  .agents/sessions/2026-04-29-session30-cont-phase16-3.md
Next: User QA 16.3-bis on dev OR V15 #10 deploy OR 16.2 Clinic Report
Outstanding: V15 #10 deploy auth · 16.4 intel deferred · H-bis cleanup LOCKED OFF
/session-start
```
