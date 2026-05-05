# Phase 20.0 — Frontend rewire to be_* + BranchSelector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution mode (this session)**: inline auto-execute per user directive 2026-05-06 ("approve ไม่ต้อง review จัดการทำได้เลย" + "apply migration ตั้งแต่ก่อน deploy เลย ถ้า pull env ลงมาแล้วทำได้"). HALT before `vercel --prod` / `firebase deploy --only firestore:rules` per V18.

**Goal:** Rewire AdminDashboard (queue + booking + appointment) from ProClinic (`brokerClient` + `/api/proclinic/*` + `pc_appointments`) to `be_*` Firestore via `scopedDataLayer`/`backendClient`. Add BranchSelector. Migrate historical `pc_appointments` → `be_appointments`.

**Architecture:** Per-flow phased migration. Phase BSA Layer 1 (`_resolveBranchIdForWrite` auto-stamp) + Layer 2 (`scopedDataLayer.js` auto-inject `resolveSelectedBranchId()`) + Layer 3 (`useBranchAwareListener`) provide branch-awareness for free once the rewire lands. Modal extraction follows `BackendDashboard/AppointmentFormModal` pattern (Rule C1 share). Migration via Rule M admin-SDK script with dry-run/--apply two-phase. Test depth Q4 calibrated: Flow A grep+sim, Flow B/C/D full Rule I (a-e), Misc grep+build.

**Tech Stack:** React 19 + Vite 8 + Firestore + firebase-admin SDK (script) + Vitest 4.1 + RTL.

**Predecessor:** Phase 19.0 (V15 #22 LIVE 2026-05-06) — appointment 4-type taxonomy + 15-min slots.

**Spec**: `docs/superpowers/specs/2026-05-06-phase-20-0-frontend-be-rewire-and-branch-selector-design.md`

---

## File structure

### Created files

```
scripts/
  phase-20-0-migrate-pc-appointments-to-be.mjs    [Phase 0]

tests/helpers/
  testAppointment.js                              [Phase 0 — V33.13]
  testDeposit.js                                  [Phase 0 — V33.14]

tests/
  v33-13-test-appointment-prefix.test.js          [Phase 0]
  v33-14-test-deposit-prefix.test.js              [Phase 0]
  phase-20-0-migration-script.test.js             [Phase 0]
  phase-20-0-flow-a-queue-read-source.test.jsx    [Phase 1]
  phase-20-0-flow-d-appointment-modal-flow-simulate.test.jsx  [Phase 2]
  phase-20-0-flow-c-no-deposit-flow-simulate.test.jsx  [Phase 3]
  phase-20-0-flow-b-deposit-flow-simulate.test.jsx  [Phase 4]
  phase-20-0-flow-misc-broker-strip.test.js       [Phase 5]
  phase-20-0-task-6-branch-selector-frontend.test.jsx  [Phase 6]

src/components/frontend/
  DepositBookingModal.jsx                         [Phase 4]
  NoDepositBookingModal.jsx                       [Phase 3]
  AppointmentModal.jsx                            [Phase 2]
  AppointmentEditModal.jsx                        [Phase 2]
```

### Modified files

```
src/pages/AdminDashboard.jsx                      [Phase 1, 2, 3, 4, 5, 6]
.claude/rules/02-workflow.md                      [Phase 0 — V33.13/14 sections]
```

### Out of scope

- `src/lib/brokerClient.js` (kept; just unimported from Frontend)
- `api/proclinic/*` (kept for MasterDataTab dev sync)
- `cookie-relay/` (kept)
- BackendDashboard tabs

---

## Task 0: Migration prep + V33.13/14 helpers + DRY-RUN + --APPLY

**Files:**
- Create: `tests/helpers/testAppointment.js` · `tests/helpers/testDeposit.js`
- Create: `scripts/phase-20-0-migrate-pc-appointments-to-be.mjs`
- Create: `tests/v33-13-test-appointment-prefix.test.js` · `tests/v33-14-test-deposit-prefix.test.js` · `tests/phase-20-0-migration-script.test.js`
- Modify: `.claude/rules/02-workflow.md` (append V33.13/14 sections)

### Step 0.1: Write `tests/helpers/testAppointment.js` (V33.13)

```javascript
// V33.13 (2026-05-06) — TEST-/E2E- appointment-doc ID prefix enforcement helper.
//
// Mirrors V33.10/11/12 for the appointment domain. Use this in any test that
// creates a real Firestore appointment doc (be_appointments) so admin-side
// cleanup can identify + batch-delete test artifacts safely.
//
// Phase 20.0 (2026-05-06) introduced this when Frontend rewired from
// brokerClient → be_appointments. preview_eval write-paths (Flows B/C/D)
// require this helper.
//
// Mock-only tests don't need it — they never hit real production data.

const VALID_PREFIXES = Object.freeze(['TEST', 'E2E']);
const PREFIX_PATTERN = /^(TEST-APPT-|E2E-APPT-)/;

function _validatePrefix(prefix) {
  if (!VALID_PREFIXES.includes(prefix)) {
    throw new Error(
      `testAppointment: prefix must be one of ${VALID_PREFIXES.join(' | ')}; ` +
      `got ${JSON.stringify(prefix)}`
    );
  }
}

function _validateSuffix(suffix) {
  if (suffix && !/^[a-zA-Z0-9_-]+$/.test(suffix)) {
    throw new Error(
      `testAppointment: suffix must match [a-zA-Z0-9_-]; got ${JSON.stringify(suffix)}`
    );
  }
}

/**
 * Generate a test appointment doc ID: `<PREFIX>-APPT-<ts>[-<suffix>]`.
 *   createTestAppointmentId()                  → "TEST-APPT-1777310877957"
 *   createTestAppointmentId({ prefix: 'E2E' }) → "E2E-APPT-1777310877957"
 *   createTestAppointmentId({ suffix: 'multi' }) → "TEST-APPT-1777310877957-multi"
 */
export function createTestAppointmentId(opts = {}) {
  const prefix = opts.prefix === undefined ? 'TEST' : opts.prefix;
  _validatePrefix(prefix);
  const suffix = String(opts.suffix || '').trim();
  _validateSuffix(suffix);
  const ts = Number.isFinite(opts.timestamp) ? opts.timestamp : Date.now();
  return suffix ? `${prefix}-APPT-${ts}-${suffix}` : `${prefix}-APPT-${ts}`;
}

export function isTestAppointmentId(id) {
  return PREFIX_PATTERN.test(String(id || ''));
}

export function getTestAppointmentPrefix(id) {
  const s = String(id || '');
  if (!PREFIX_PATTERN.test(s)) return null;
  return s.startsWith('TEST-APPT-') ? 'TEST' : 'E2E';
}

export const TEST_APPOINTMENT_PREFIXES = VALID_PREFIXES;
```

### Step 0.2: Write `tests/helpers/testDeposit.js` (V33.14)

Same shape as V33.13 but `DEPOSIT` token + `TEST-DEPOSIT-`/`E2E-DEPOSIT-` prefix pattern.

### Step 0.3: Write `scripts/phase-20-0-migrate-pc-appointments-to-be.mjs`

Mirror Phase 19.0 script. Key differences:
- Source = `pc_appointments/{YYYY-MM}` documents (monthly summary docs holding embedded appointment array)
- Target = `be_appointments/{appointmentId}` (one doc per appointment)
- Map embedded appointment → be_appointments shape via `migratePcAppointmentToBe(pcAppt, monthDocId)` pure helper (exported for tests)
- Default `branchId = 'BR-1777095572005-ae97f911'` (นครราชสีมา)
- Map ProClinic 2-type → BE 4-type: `'sales'`/`'follow'`/`'consult'`/`'treatment'`/null → `'no-deposit-booking'`; `'followup'` → `'follow-up'`
- Forensic-trail fields: `migratedFromPc=true`, `pcMonthDocId='YYYY-MM'`, `migratedAt=serverTimestamp`
- Idempotency: skip if `be_appointments/{id}` already exists OR target doc has `migratedFromPc=true`
- Audit doc: `be_admin_audit/phase-20-0-migrate-pc-appointments-{ts}-{rand}` shape `{phase, op, scanned, migrated, skipped, monthsProcessed, beforeShapeDistribution, afterDistribution, appliedAt}`

### Step 0.4: Write tests
- `tests/v33-13-test-appointment-prefix.test.js`: 12 tests (prefix validation, suffix, isTest, getPrefix, frozen const, drift catcher)
- `tests/v33-14-test-deposit-prefix.test.js`: 12 tests (mirror)
- `tests/phase-20-0-migration-script.test.js`: M1 mapPcAppointmentToBe shape · M2 type-map sales→no-deposit-booking · M3 type-map followup→follow-up · M4 default branchId=นครราชสีมา · M5 forensic-trail fields stamped · M6 unknown type fallback · M7 audit doc shape · M8 randHex export

### Step 0.5: Update `.claude/rules/02-workflow.md` with V33.13 + V33.14 sections (mirror V33.10/11/12 prose).

### Step 0.6: `npm test -- --run tests/v33-13-test-appointment-prefix tests/v33-14-test-deposit-prefix tests/phase-20-0-migration-script` → ALL PASS.

### Step 0.7: `vercel env pull .env.local.prod --environment=production`

### Step 0.8: `node scripts/phase-20-0-migrate-pc-appointments-to-be.mjs` (DRY-RUN). Capture output: scanned/would-migrate/would-skip distribution.

### Step 0.9: Sanity-check distribution. Confirm:
- Total scanned = sum of pc_appointments embedded items across all month docs
- No surprising values in beforeShapeDistribution
- Default-branch stamping logic looks right

### Step 0.10: `node scripts/phase-20-0-migrate-pc-appointments-to-be.mjs --apply`. Capture audit doc ID.

### Step 0.11: Re-run `--apply` for idempotency check (expect 0 writes).

### Step 0.12: Commit

```bash
git add tests/helpers/testAppointment.js tests/helpers/testDeposit.js \
  scripts/phase-20-0-migrate-pc-appointments-to-be.mjs \
  tests/v33-13-test-appointment-prefix.test.js \
  tests/v33-14-test-deposit-prefix.test.js \
  tests/phase-20-0-migration-script.test.js \
  .claude/rules/02-workflow.md
git commit -m "feat(phase-20-0/task-0): migration script + V33.13/14 prefix helpers + --apply

Migration: pc_appointments/{YYYY-MM} embedded → be_appointments/{id}
Default branchId = นครราชสีมา (Phase 17.2 newest-default)
Forensic-trail: migratedFromPc + pcMonthDocId + migratedAt
Type-map: ProClinic 2-type → BE 4-type per Phase 19.0 Option B uniform

V33.13/V33.14 helpers mirror V33.10/11/12 shape.

Audit doc: <captured-from-step-0.10>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin master
```

---

## Task 1: Flow A — Queue read-source swap

**Files:**
- Modify: `src/pages/AdminDashboard.jsx` — replace `pc_appointments` getDoc + `broker.syncAppointments` calls with `listenToAppointmentsByDate`
- Test: `tests/phase-20-0-flow-a-queue-read-source.test.jsx`

### Step 1.1: Read AdminDashboard.jsx lines 484, 753, 1141, 1219 (pc_appointments getDoc) + 484, 500, 517, 571, 803, 1111, 1209 (broker.syncAppointments).

### Step 1.2: Identify the queue calendar's data structure. Currently:
- Reads `pc_appointments/{YYYY-MM}` → embedded array per month
- Counts/displays per-day cells

After swap:
- Subscribe to `listenToAppointmentsByDate(dateStr)` per visible date OR a month-range listener if available
- Aggregate within Frontend (since be_appointments is per-doc)

### Step 1.3: Import from scopedDataLayer (NOT backendClient direct, per Rule L BS-1):

```javascript
import { listenToAppointmentsByDate } from '../lib/scopedDataLayer.js';
import useBranchAwareListener from '../hooks/useBranchAwareListener.js';
```

### Step 1.4: Replace each `pc_appointments` getDoc call with a `listenToAppointmentsByDate` subscription wrapped via `useBranchAwareListener`.

### Step 1.5: Remove all `broker.syncAppointments(month)` calls and the manual-refresh button handlers — be_* listener auto-refreshes.

### Step 1.6: Delete `pc_appointments` import statements + the entire month-doc fetch helper if no other consumer remains.

### Step 1.7: Write `tests/phase-20-0-flow-a-queue-read-source.test.jsx`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ADMIN_DASHBOARD = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

describe('Phase 20.0 Flow A — queue read-source swap', () => {
  it('A1: AdminDashboard does NOT read pc_appointments collection', () => {
    expect(ADMIN_DASHBOARD).not.toMatch(/pc_appointments/);
  });
  it('A2: AdminDashboard does NOT call broker.syncAppointments', () => {
    expect(ADMIN_DASHBOARD).not.toMatch(/syncAppointments\s*\(/);
  });
  it('A3: AdminDashboard imports listenToAppointmentsByDate from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(/listenToAppointmentsByDate.*from.*scopedDataLayer/s);
  });
  it('A4: AdminDashboard uses useBranchAwareListener for branch-scoped subscriptions', () => {
    expect(ADMIN_DASHBOARD).toMatch(/useBranchAwareListener/);
  });
  // A5-A6: simulate render with be_appointments fixture (jsdom + RTL)
});
```

### Step 1.8: `npm test -- --run tests/phase-20-0-flow-a` → ALL PASS.

### Step 1.9: `npm run build` → clean.

### Step 1.10: Commit + push: `feat(phase-20-0/task-1): Flow A queue reads be_appointments via scopedDataLayer`

---

## Task 2: Flow D — Appointment modal CRUD + extract

**Files:**
- Create: `src/components/frontend/AppointmentModal.jsx`
- Create: `src/components/frontend/AppointmentEditModal.jsx`
- Modify: `src/pages/AdminDashboard.jsx` — replace inline JSX with extracted component imports + swap broker.list/create/update/delete to be_*
- Test: `tests/phase-20-0-flow-d-appointment-modal-flow-simulate.test.jsx`

### Step 2.1: Read AdminDashboard.jsx around lines 668-695 (modal view) + 1704-1777 (modal edit) to capture inline JSX.

### Step 2.2: Create `AppointmentModal.jsx` — view-mode appointment modal. Props: `{ open, customerId, onClose, onEdit, onDelete }`. Fetches via `listenToAppointmentsByDate` filtered to customerId OR `getAppointmentsByCustomer(customerId)` if helper exists.

### Step 2.3: Create `AppointmentEditModal.jsx` — create/edit-mode modal. Props: `{ open, mode: 'create'|'edit', appointmentId?, customerId, onClose, onSaved }`. Submits via `createBackendAppointment` / `updateBackendAppointment`.

### Step 2.4: In AdminDashboard.jsx, replace inline modal JSX with:

```javascript
import AppointmentModal from '../components/frontend/AppointmentModal.jsx';
import AppointmentEditModal from '../components/frontend/AppointmentEditModal.jsx';
// ...
{showAppointmentModal && (
  <AppointmentModal
    open={true}
    customerId={apptModalCustomerId}
    onClose={() => setShowAppointmentModal(false)}
    onEdit={(id) => { setEditingAppointmentId(id); setShowEditModal(true); }}
    onDelete={(id) => handleDeleteAppointment(id)}
  />
)}
```

### Step 2.5: Replace `broker.listCustomerAppointments(customerId)` (lines 610, 678, 694) with appropriate be_* read. If `listAppointmentsByCustomer` doesn't exist in backendClient, use `getAppointmentsByDate({allBranches:true})` filtered client-side OR add the helper.

### Step 2.6: Replace `broker.createAppointment(payload)` (line 671) with `createBackendAppointment(payload)`.

### Step 2.7: Replace `broker.updateAppointment(id, payload)` (line 669) with `updateBackendAppointment(id, payload)`.

### Step 2.8: Replace `broker.deleteAppointment(id)` (lines 690, 1864) with `deleteBackendAppointment(id)`.

### Step 2.9: Update payload mapping — broker payload shape may differ from be_appointments shape. Map fields: `customerId`, `customerName`, `doctorId`, `doctorName`, `date`, `startTime`, `endTime`, `appointmentType`, `appointmentColor`, `note`, `branchId` (auto-stamped), `roomId` (Phase 18.0).

### Step 2.10: Write tests `tests/phase-20-0-flow-d-appointment-modal-flow-simulate.test.jsx` D1-D10 covering Rule I full (a+b+c+d+e). Source-grep: AdminDashboard + 2 new modals have NO `brokerClient` import.

### Step 2.11: `npm test -- --run tests/phase-20-0-flow-d` → ALL PASS.

### Step 2.12: `npm run build` → clean.

### Step 2.13: preview_eval verification (Rule I item-b NON-NEGOTIABLE for write paths). Spawn dev server, create appointment with `TEST-APPT-{ts}` ID, verify branchId stamp + appointmentType valid + cleanup via admin endpoint.

### Step 2.14: Commit + push: `feat(phase-20-0/task-2): Flow D appointment modal CRUD on be_*`

---

## Task 3: Flow C — No-deposit booking modal + extract

**Files:**
- Create: `src/components/frontend/NoDepositBookingModal.jsx`
- Modify: `src/pages/AdminDashboard.jsx`
- Test: `tests/phase-20-0-flow-c-no-deposit-flow-simulate.test.jsx`

### Step 3.1: Read AdminDashboard.jsx around lines 1625-1701 (no-deposit modal inline JSX).

### Step 3.2: Create `NoDepositBookingModal.jsx` mirroring AppointmentEditModal pattern from Task 2 but with no-deposit-specific fields (e.g. defaults `appointmentType='no-deposit-booking'`, opd_sessions linking).

### Step 3.3: Replace inline JSX in AdminDashboard.jsx with `<NoDepositBookingModal />`.

### Step 3.4: Replace `broker.createAppointment` (line 1664) with `createBackendAppointment` + opd_sessions update (preserve existing anon-auth path; per V23 hasOnly whitelist).

### Step 3.5: Replace `broker.updateAppointment` (line 1746) with `updateBackendAppointment`.

### Step 3.6: Replace retry `broker.createAppointment` (line 1754) with `createBackendAppointment`.

### Step 3.7: Confirm opd_sessions doc gets `linkedAppointmentId` set on success (via Firestore dotted-path update — V32-tris-quater pattern).

### Step 3.8: Write tests C1-C9 + source-grep + adversarial + lifecycle. preview_eval with `TEST-APPT-{ts}` + TEST customer.

### Step 3.9: `npm test -- --run tests/phase-20-0-flow-c` → ALL PASS.

### Step 3.10: `npm run build` → clean.

### Step 3.11: Commit + push: `feat(phase-20-0/task-3): Flow C no-deposit booking on be_*`

---

## Task 4: Flow B — Deposit booking modal + extract

**Files:**
- Create: `src/components/frontend/DepositBookingModal.jsx`
- Modify: `src/pages/AdminDashboard.jsx`
- Test: `tests/phase-20-0-flow-b-deposit-flow-simulate.test.jsx`

### Step 4.1: Read AdminDashboard.jsx around line 1568 (deposit booking modal inline JSX + broker.getDepositOptions call).

### Step 4.2: Create `DepositBookingModal.jsx`. Replace `broker.getDepositOptions()` with parallel:

```javascript
import { listStaff, listDoctors, listExamRooms } from '../../lib/scopedDataLayer.js';

const [sellers, doctors, rooms] = await Promise.all([
  listStaff(),
  listDoctors(),
  listExamRooms(),
]);
```

### Step 4.3: Confirm deposit submission goes through `createDeposit(...)` (be_*). If AdminDashboard wrote via broker, swap.

### Step 4.4: Update appointmentType default to `'deposit-booking'` (Phase 19.0).

### Step 4.5: Replace inline JSX in AdminDashboard.jsx with `<DepositBookingModal />`.

### Step 4.6: Write tests B1-B9 + source-grep + adversarial + lifecycle. preview_eval with `TEST-DEPOSIT-{ts}` + `TEST-APPT-{ts}` + TEST customer.

### Step 4.7: `npm test -- --run tests/phase-20-0-flow-b` → ALL PASS.

### Step 4.8: `npm run build` → clean.

### Step 4.9: Commit + push: `feat(phase-20-0/task-4): Flow B deposit booking on be_*`

---

## Task 5: Misc broker strip + dead UI removal

**Files:**
- Modify: `src/pages/AdminDashboard.jsx`
- Test: `tests/phase-20-0-flow-misc-broker-strip.test.js`

### Step 5.1: Replace `broker.searchCustomers(q)` (line 594) — check if `listCustomers` filter or new `searchBackendCustomers` helper needed. Likely needs filter on hn / phone / nationalId across be_customers (helper at backendClient if missing).

### Step 5.2: Replace `broker.getCourses(proClinicId)` (line 1473) — direct `customer.courses[]` read from already-loaded customer doc.

### Step 5.3: Remove `broker.getLivePractitioners` (line 148) — confirm all consumers replaced via Phase 2-4.

### Step 5.4: Remove `broker.getProClinicCredentials` (line 441) + the "ทดสอบเชื่อมต่อ" button + settings panel test section.

### Step 5.5: Remove session-expired banner + `ensureExtensionHasCredentials` + `requestExtensionSync` calls in AdminDashboard.

### Step 5.6: Remove `import` of brokerClient from AdminDashboard.jsx entirely.

### Step 5.7: Write `tests/phase-20-0-flow-misc-broker-strip.test.js`:
- X1: AdminDashboard.jsx + frontend modals have ZERO `brokerClient` references
- X2: ZERO `from .*brokerClient` imports in src/pages/AdminDashboard.jsx + src/components/frontend/*
- X3: ZERO `broker\.` calls
- X4: build pass

### Step 5.8: `npm test -- --run tests/phase-20-0-flow-misc` → ALL PASS.

### Step 5.9: `npm run build` → clean.

### Step 5.10: Commit + push: `feat(phase-20-0/task-5): Misc broker strip + dead UI removal`

---

## Task 6: BranchSelector in AdminDashboard header

**Files:**
- Modify: `src/pages/AdminDashboard.jsx`
- Test: `tests/phase-20-0-task-6-branch-selector-frontend.test.jsx`

### Step 6.1: Import existing BranchSelector component (verify path):

```javascript
import BranchSelector from '../components/backend/BranchSelector.jsx';
import { useSelectedBranch } from '../lib/BranchContext.jsx';
```

### Step 6.2: Render `<BranchSelector/>` in AdminDashboard header (next to logout/settings buttons).

### Step 6.3: Confirm BranchProvider mounted at App.jsx — already verified Phase 17.2.

### Step 6.4: Audit all onSnapshots in AdminDashboard tree — confirm wrapped via `useBranchAwareListener` for branch-scoped collections (`be_appointments`).

### Step 6.5: Write tests Z1-Z6 — branch render, switch resubscribes, write payload uses selectedBranchId, source-grep, lifecycle 2-branch fixture.

### Step 6.6: `npm test -- --run tests/phase-20-0-task-6` → ALL PASS.

### Step 6.7: `npm run build` → clean.

### Step 6.8: Commit + push: `feat(phase-20-0/task-6): BranchSelector in AdminDashboard header (Item 2)`

---

## Task 7: Full verification

### Step 7.1: `npm test -- --run` → ALL 5463+ tests pass (~5538 expected).

### Step 7.2: `npm run build` → clean (bundle size shrink expected from modal extraction).

### Step 7.3: Run audit-branch-scope: `npm test -- --run tests/audit-branch-scope` → BS-1..BS-9 pass.

### Step 7.4: `git status` → working tree clean (all phases committed).

### Step 7.5: Update `.agents/active.md` + `SESSION_HANDOFF.md` with Phase 20.0 status.

### Step 7.6: Commit handoff updates: `docs(agents): Phase 20.0 source-only complete; awaiting V15 #23-26 deploy auth`.

### Step 7.7: HALT. Report to user:
- All 6 phases shipped to master + pushed (no deploy yet)
- Migration --apply done with audit doc ID
- Tests passing
- Build clean
- Awaiting "deploy" THIS turn for V15 #23 (per V18 + Rule B per-turn auth)

---

## Self-review checklist

- [x] Spec coverage: 6 phases + Phase 0 prep + verification → maps to spec sections 1-7.
- [x] No placeholders: all code samples concrete; file paths explicit.
- [x] Type consistency: V33.13 `createTestAppointmentId` matches V33.10/11/12 shape; migration script mirrors Phase 19.0 template.
- [x] Rule K respected: each phase = source first, then test bank, then verify+commit.
- [x] Rule I item-b NON-NEGOTIABLE for write paths (Phases 2-4) preserved.
- [x] Rule M migration script template (Phase 19.0 canonical) applied verbatim with Phase 20.0 path mapping.
- [x] HALT before vercel/firebase deploys per V18.
