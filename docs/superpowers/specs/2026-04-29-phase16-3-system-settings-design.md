# Phase 16.3 — System Settings tab — Design Spec

**Date**: 2026-04-29 evening
**Status**: Implemented + tested + committed; pending V15 #9 firestore.rules deploy
**Master plan**: `~/.claude/projects/F--LoverClinic-app/memory/project_phase16_plan.md`
**Plan file**: `C:\Users\oomzp\.claude\plans\movement-log-stock-structured-hopcroft.md`

## Why

Per Phase 16 master plan, after 16.5 (Remaining Course tab) ships the next sub-phase is 16.3 — System Settings. Centralises clinic-wide admin config in one tab so admin doesn't need to edit Firestore docs by hand.

User directive 2026-04-29: "แพลนลุย phase 16 ต่อตามแพลนเลย".

## Scope (4 sections in 1 tab)

1. **Per-tab visibility overrides** — admin overrides static `tabPermissions.js` defaults per tab
2. **Defaults** — `defaultDepositPercent`, `defaultPointsPerBaht`, `defaultDateRange` (filter/report initial values)
3. **Feature flag** — `allowNegativeStock` (Phase 15.7 negative-stock + auto-repay system runtime gate)
4. **Audit trail viewer** — read-only list of recent system-config changes (paginated 20/page, real-time via onSnapshot)

## Key design decisions (from brainstorming Q1-Q4)

| # | Question | Decision |
|---|---|---|
| Q1 | Per-tab override semantic | **D — all 3 patterns** (`hidden:true` / `requires:[...]` add / `adminOnly:true`) per tab |
| Q2 | Write access | **C — permission-key gated** (NEW key `system_config_management`) + admin claim bypass |
| Q3 | Audit trail | **A — full audit** per write — every change → `be_admin_audit/system-config-{ts}` doc with changedFields + before/after diff |
| Q4 | `allowNegativeStock=false` runtime | **C — block NEW negatives, repay existing** (transition-friendly; existing negative batches still receive auto-repay; new shortfall throws) |

## Architecture

### Storage

Single doc `clinic_settings/system_config`:

```js
{
  tabOverrides: {
    [tabId: string]: {
      hidden?: boolean,        // hide entirely from sidebar (admin still sees)
      requires?: string[],     // ADD to default requires list (any-of merge)
      adminOnly?: boolean,     // override default; force admin-only gate
    },
  },
  defaults: {
    depositPercent: number,    // 0-100; 0 = no auto-suggest
    pointsPerBaht: number,     // ≥ 0; 0 = points disabled
    dateRange: '7d' | '30d' | '90d' | '180d' | '1y' | 'mtd' | 'qtd' | 'ytd',
  },
  featureFlags: {
    allowNegativeStock: boolean,   // default true (Phase 15.7 contract)
  },
  _updatedBy: string,
  _updatedAt: serverTimestamp,
  _version: number,
}
```

Defaults applied via `mergeSystemConfigDefaults()` so missing fields fall through to schema defaults — never undefined.

### Components

| Component | Responsibility |
|---|---|
| `src/lib/systemConfigClient.js` | helper module (no React) — getSystemConfig / listenToSystemConfig / saveSystemConfig / mergeSystemConfigDefaults / validateSystemConfigPatch / computeChangedFields / readPath |
| `src/hooks/useSystemConfig.js` | React hook — shared listener (single onSnapshot fan-in across components); cached at module level |
| `src/components/backend/SystemSettingsTab.jsx` | Main tab UI — 4 sections stacked; each editable section has its own Save button (per-section atomic) |
| `src/components/backend/SystemConfigAuditPanel.jsx` | Read-only paginated audit viewer; onSnapshot-backed (real-time refresh when other admin saves) |
| `src/lib/tabPermissions.js` | EXTEND — `canAccessTab(tabId, permissions, isAdmin, overrides?)` accepts 4th param; new pure helper `applyTabOverride(staticGate, override)` merges without mutating frozen `TAB_PERMISSION_MAP` |
| `src/lib/permissionGroupValidation.js` | EXTEND — `system_config_management` added to ALL_PERMISSION_KEYS under "ตั้งค่า / ข้อมูลพื้นฐาน" module |
| `src/lib/backendClient.js _deductOneItem` | EXTEND — read `getSystemConfig().featureFlags.allowNegativeStock`; throw `STOCK_INSUFFICIENT_NEGATIVE_DISABLED` Thai error when shortfall + flag-off. Repay path (in `_repayNegativeBalances`) NOT gated — preserves Q4-C asymmetric semantic. |
| `firestore.rules` | EXTEND — narrow match for `clinic_settings/system_config` + `be_admin_audit/system-config-*` prefix exception; read open to isClinicStaff for audit panel render |
| `src/components/backend/nav/navConfig.js` | EXTEND — `'system-settings'` entry under master-data section (Settings icon, amber color) |
| `src/pages/BackendDashboard.jsx` | EXTEND — lazy import + render case for tab `'system-settings'` |

### Permission gate (Q2-C)

- Read: `isClinicStaff()` — UI consumers + backendClient `_deductOneItem` runtime gate
- Write: `request.auth.token.admin == true || request.auth.token.perm_system_config_management == true`
- Admin bypass works immediately (admin claim auto-set on bootstrap)
- Permission-gated users wait for claim refresh (~1h ID-token TTL) OR re-login after admin assigns the new key to their group

### Audit emit (Q3-A)

Every `saveSystemConfig({patch, executedBy, reason?})` call:
1. Reads current state via `getSystemConfig()`
2. Builds next state by applying patch
3. Computes `changedFields` (dotted-path list)
4. Short-circuits if `changedFields.length === 0` (no-op)
5. Writes `be_admin_audit/system-config-{ts}` doc atomically with the system_config update via `writeBatch`:
   - `auditId`, `action: 'system_config_update'`, `executedBy`, `executedAt`
   - `changedFields[]`, `beforeValues{}`, `afterValues{}` (slice only — for diff readability)
   - `reason` (optional admin-supplied string, max 500 chars)
   - `version` (next system_config version number)

### Negative-stock flag (Q4-C)

`_deductOneItem` decision tree extended:

```
if (plan.shortfall > 0 && (context === 'treatment' || context === 'sale')) {
  // NEW: read system_config
  const sysCfg = await getSystemConfig();
  if (sysCfg.featureFlags.allowNegativeStock === false) {
    throw STOCK_INSUFFICIENT_NEGATIVE_DISABLED;  // Thai error
  }
  // Existing Phase 15.7 path
  pickNegativeTargetBatch + AUTO-NEG synthesis
}
```

The `_repayNegativeBalances` path (in `_buildBatchFromOrderItem` for vendor receive + `_receiveAtDestination` for transfer/withdrawal) is UNCONDITIONAL — does NOT read the flag. Q4-C "repay existing" semantic preserved automatically.

Graceful degradation: if `getSystemConfig()` throws (transient Firestore read failure), default behaviour is "allow" — Phase 15.7 contract preserved. Treatment save never blocks on a config-read transient.

## Test budget

| File | Tests | Coverage |
|---|---|---|
| `phase16.3-system-config-client.test.js` | 30 | Helper unit (mergeDefaults / validate / computeChangedFields / readPath) + V36-tris no-master_data + Q3-A audit shape |
| `phase16.3-tab-permission-overrides.test.js` | 21 | Q1-D 3-pattern merge + system-settings tab gate + anti-mutation guards |
| `phase16.3-negative-stock-flag.test.js` | 11 | Q4-C runtime flag-off throw + repay path UNCONDITIONAL + V36/V35 regression bank intact |
| `phase16.3-firestore-rules-gate.test.js` | 10 | Q2-C admin/perm gate + Q3-A audit prefix exception + immutability + anti-regression on existing rules |
| `phase16.3-flow-simulate.test.js` | 35 | End-to-end pure-helper chain + adversarial + cross-file wiring source-grep + Phase 16 plan invariants |
| **Total NEW** | **107** | |
| **Legacy regressions fixed** | 5 | nav-config I4 (count 18→19) · phase11 M2 (18→19) · course-skip K.2/K.2-bis slice (20000→25000) · v35-3 B.3/B.5 same · phase15.6c ACE.E (be_admin_audit narrow exception) |

Full suite: 3652 → 3759 pass.

## Risks (and mitigations)

| Risk | Mitigation |
|---|---|
| Tab-override merge mutating frozen `TAB_PERMISSION_MAP` | Pure helper `applyTabOverride` uses spread + Set; source-grep test guards against `TAB_PERMISSION_MAP[\w] =` mutation pattern |
| Negative-stock flag flipped off when batches already negative | Q4-C "repay existing" semantic preserves auto-repay; warning text in UI explains; admin can reverse via toggle |
| Audit write contention | `writeBatch` (NOT `runTransaction` — no read needed; <500 ops) keeps system_config + audit doc atomic |
| Permission claim sync delay (~1h) | Admin bypass works immediately; UI shows error message with reason |
| Audit `be_admin_audit` rule weakening risk | Narrow CREATE-only exception by doc-id prefix `^system-config-.*`; update + delete remain blocked entirely; read opened to isClinicStaff for panel render only |

## Verification (full flow per Rule I)

1. Admin user opens "ตั้งค่าระบบ" tab → 4 sections render
2. Set `tabOverrides.staff-schedules.hidden = true` + Save → audit doc created, "เปลี่ยน" badge appears
3. Switch to non-admin persona → sidebar omits staff-schedules tab
4. Toggle `allowNegativeStock = false` + Save → audit doc created
5. Non-admin tries treatment save with batch shortfall → save blocks with Thai error pointing to admin
6. Reverse flag → save returns to working state
7. Inspect `clinic_settings/system_config` doc shape; `be_admin_audit` has 4 system-config-* docs from steps 2-6
8. All 107 phase16.3-* tests + V34/V35/V36 regression banks pass + build clean ✅

## Out of scope (deferred)

- 16.2 Clinic Report (next after 16.3 ships + V15 #9 deploy)
- 16.1 Smart Audience (depends on 16.2 cohort patterns)
- 16.4 Order tab (intel failed `MODULE_NOT_FOUND`; defer until scraper deps fixed)
- 16.7 Google Calendar OAuth (optional)
- 16.8 audit-all (LAST step before pre-launch)
- Pre-launch H-bis cleanup (LOCKED OFF per memory)

## Lessons (for future sub-phases)

1. **Per-tab override merge MUST NOT mutate the frozen static map** — pure helper `applyTabOverride` with Set-dedup is the canonical pattern. Source-grep test V36-style guards against future regressions.
2. **Feature-flag toggle for safety-critical runtime behaviour needs an asymmetric semantic**. Q4-C ("block new, repay existing") is the transition-friendly pattern; outright "block all" or "no-op toggle" both have trade-offs the user weighed explicitly.
3. **Audit emit via writeBatch + narrow rules-prefix exception** keeps audit ledger tamper-resistant while admitting legitimate client-side writes — pattern reusable for future audit-emit features.
4. **Default-value merge layer** (`mergeSystemConfigDefaults`) protects all consumers from Firestore null/missing-field surprises — every helper that reads system_config returns a fully-populated object.
