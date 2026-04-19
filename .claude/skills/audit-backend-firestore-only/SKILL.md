---
name: audit-backend-firestore-only
description: Audit that backend UI tabs + components (src/components/backend/**, BackendDashboard.jsx) read/write Firestore ONLY — no brokerClient imports and no /api/proclinic/* calls, except for MasterDataTab.jsx which is the sanctioned one-way sync point. Enforces rule 03-stack.md "Backend ใช้ข้อมูลจาก Firestore เท่านั้น" after the Phase 9 violation (2026-04-19).
user-invocable: true
allowed-tools: "Read, Grep, Glob, Bash"
---

# Audit: Backend must stay Firestore-only (except MasterDataTab)

## Context

**Rule**: `.claude/rules/03-stack.md` Backend Dashboard section.
**Anti-example**: `.claude/rules/00-session-start.md` V2 (Phase 9 violation).
**Scope**: `src/components/backend/**/*.{js,jsx}`, `src/pages/BackendDashboard.jsx`.

Only these files may import `brokerClient` — both are one-way sync points (ProClinic → Firestore):
- `MasterDataTab.jsx` — pulls products/doctors/staff/courses/promotions into `master_data/*`
- `CloneTab.jsx` — pulls customer list into `be_customers/*` via `cloneOrchestrator`
- `CustomerDetailView.jsx` — triggers per-customer resync (same pattern)

Every other backend file must stay Firestore-only.

## Invariants (run on any change to src/components/backend/**)

### BF1 — No `brokerClient` import in non-sync backend files
Whitelist: `MasterDataTab.jsx`, `CloneTab.jsx`, `CustomerDetailView.jsx` (sync flows only).
```bash
grep -rn "from ['\"]\\.\\./\\.\\./lib/brokerClient" src/components/backend/ \
  | grep -vE "MasterDataTab\\.jsx|CloneTab\\.jsx|CustomerDetailView\\.jsx"
```
**Expected**: empty. Any match = **violation** → delete the import + refactor to use `backendClient` directly.

### BF2 — No `/api/proclinic/*` fetch/URL strings in backend UI files
```bash
grep -rn "api/proclinic" src/components/backend/ src/pages/BackendDashboard.jsx
```
**Expected**: empty (MasterDataTab uses `brokerClient.listItems` / `syncProducts` which internally hits `/api/proclinic/master|treatment`; direct URL construction in UI = violation).

### BF3 — No new `api/proclinic/<entity>.js` for OUR backend-owned entities
Expected serverless endpoints in `api/proclinic/`: `customer.js`, `deposit.js`, `connection.js`, `appointment.js`, `courses.js`, `treatment.js`, `master.js`, `_lib/*`.
```bash
ls api/proclinic/ | grep -v '^\(_lib\|customer\|deposit\|connection\|appointment\|courses\|treatment\|master\)\\.js$'
```
**Expected**: empty. New entity file = **violation** unless it's a ProClinic-sourced entity being pulled into master_data.

### BF4 — No `pc_<be-entity>` Firestore rules for OUR entities
`pc_*` rules are for ProClinic-synced mirrors only (pc_appointments, pc_customers, pc_courses, pc_treatments, pc_treatment_history, pc_chart_templates, pc_form_options, pc_inventory, pc_doctors).
```bash
grep -nE "^\\s*match /pc_" firestore.rules
```
**Expected**: only the 9 sanctioned mirrors above. `pc_promotions`, `pc_coupons`, `pc_vouchers`, `pc_sales`, `pc_deposits`, etc = **violation**.

### BF5 — No broker wrapper functions named `create<BackendEntity>` / `update<BackendEntity>` / `delete<BackendEntity>InProClinic`
These were the Phase 9 violation pattern.
```bash
grep -nE "export function (create|update)(Promotion|Coupon|Voucher|Sale|Deposit)\\b" src/lib/brokerClient.js
grep -nE "^export function delete.*InProClinic" src/lib/brokerClient.js
```
**Expected**: empty. Any match = **violation** → remove the wrapper + grep callers to ensure nothing breaks.

### BF6 — `FormModal` components in backend MUST NOT import brokerClient
```bash
grep -rln "brokerClient" src/components/backend/*FormModal.jsx
```
**Expected**: empty.

### BF7 — Tab files MUST NOT import brokerClient (except MasterDataTab)
```bash
grep -rln "brokerClient" src/components/backend/*Tab.jsx | grep -v MasterDataTab
```
**Expected**: empty.

## Priority

P0 — these violations leaked through Phase 9 and the user was "wasting time" due to the drift. Treat as release-blocking.

## Integration

- `/audit-all` runs this.
- PostToolUse hook in settings.json can invoke this on any Edit/Write touching `src/components/backend/**`.
- `feedback_backend_firestore_only.md` memory mirrors this rule for human-readable reference.
