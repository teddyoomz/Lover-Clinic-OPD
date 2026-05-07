# Staff / Doctor Hide-From-Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `isHidden` flag to `be_staff` + `be_doctors` so admin can soft-archive a person (login + permissions intact, but excluded from every dropdown/picker/list system-wide). Hidden persons remain visible only in StaffTab/DoctorsTab admin lists (with badge) + past-record name labels via opt-in lookup.

**Architecture:** Default-filter at the lib lister (`listStaff()` / `listDoctors()` filter `!isHidden` by default; `{ includeHidden: true }` opt returns all). Mirror existing `isHidden` precedent on `be_products` (`src/lib/backendClient.js:10273`). Audit-stamp `hiddenAt` + `hiddenBy` on transition. Checkbox at top of StaffFormModal + DoctorFormModal. Multi-reader-sweep migration of consumers that build past-record lookup maps. Pure-ESM helpers, Firestore admin-SDK paths unchanged.

**Tech Stack:** Firebase Firestore (web SDK + admin SDK), React 19 + Vite 8, Vitest 4.1, Tailwind 3.4. Existing patterns reused: `isHidden` on be_products, BSA Layer-2 `scopedDataLayer.js` pass-through, V40 RTL test scaffold, V40 admin-SDK live e2e pattern.

**Spec:** `docs/superpowers/specs/2026-05-08-staff-doctor-hide-from-lists-design.md` (10 sections, 3 brainstorming sections approved + 3 Q&A locked). Read first.

**Conventions in force**:
- Rule K (work-first-test-last): Phase 1 helpers TDD per-task; Phase 2 UI builds source first, batch tests in Phase 3.
- Rule M (data ops via admin-SDK + audit + idempotent): live e2e in Phase 3.3 follows V40 template.
- Rule I (full-flow simulate at sub-phase end): Phase 3 e2e mandatory; tests against TEST-prefixed real-prod fixtures.
- V37 lock: `git add <specific files>` only — never `git add -A`.
- V18 lock: NO deploy unless user explicitly says "deploy" THIS turn.
- Rule N (targeted-test-only for small bugfixes): full suite ONLY at end-of-batch (Task 4.2). Per-task focused vitest runs.
- AV20 (NEW from this plan): lookup-map consumers MUST opt-in `{ includeHidden: true }`.

---

## Context

User asked 2026-05-08 (verbatim): "ใน tab=staff และ tab=doctors เพิ่มปุ่มใหม่คือ 'ไม่แสดงรายชื่อ' ... ยังมีชื่ออยู่ในระบบ login ได้ ทำทุกอย่างได้ตามสิทธิ์เหมือนคนอื่นๆ แต่จะไม่ไปโผล่ในดรอปดาวน์ การดึงรายชื่อในเมนูใดๆ ... ไม่ปรากฎที่ไหนเลย".

Why now: clinics have staff who should retain login access (on leave, on probation, in a non-list role) but should not clutter daily picker dropdowns the front-desk uses minute-to-minute. Today admin's only options are delete (lose audit + login) or leave them in pickers (clutter + misclick risk).

Outcome: 1 schema field + 2 lister filters + 2 modal checkboxes + 2 tab badges + ~6 consumer migrations + 4 test files + AV20 audit invariant. Production-deployable. No deploy on first commit; user authorizes deploy later.

---

## File Structure

```
NEW Files (~4):
  tests/staff-doctor-hidden-filter.test.js       # Phase 1 helper unit tests (TDD)
  tests/staff-doctor-hide-modal-rtl.test.jsx     # Phase 3 UI behavior tests
  tests/staff-doctor-hide-consumer-sweep.test.js # Phase 3 multi-reader-sweep audit
  scripts/e2e-staff-doctor-hide.mjs              # Phase 3 live admin-SDK e2e

MODIFIED Files (~10):
  src/lib/backendClient.js                                # listStaff/listDoctors {includeHidden} + saveStaff/saveDoctor audit-stamp
  src/lib/scopedDataLayer.js                              # (verify) pass-through opt for new param
  src/lib/staffValidation.js                              # emptyStaffForm + normalizeStaff + validateStaff: include isHidden
  src/lib/doctorValidation.js                             # emptyDoctorForm + normalizeDoctor + validateDoctor: include isHidden
  src/components/backend/StaffFormModal.jsx               # Checkbox UI at top + state binding
  src/components/backend/DoctorFormModal.jsx              # Checkbox UI at top + state binding
  src/components/backend/StaffTab.jsx                     # Opt-in {includeHidden:true} + row badge
  src/components/backend/DoctorsTab.jsx                   # Opt-in {includeHidden:true} + row badge
  src/components/backend/CustomerDetailView.jsx           # Opt-in for past-record lookup map
  src/components/TreatmentFormPage.jsx                    # Split: opt-in for map, default-filter for picker
  src/pages/AdminDashboard.jsx                            # Split for loadDepositOptions + loadTodaysPractitioners
  src/components/backend/AppointmentCalendarView.jsx      # Split for past appointment display
  .claude/rules/00-session-start.md                       # V41 compact V-entry
  .claude/rules/v-log-archive.md                          # V41 verbose entry
  .agents/skills/audit-anti-vibe-code/SKILL.md            # AV20 invariant + AV1–AV20 header
```

---

## Phase 1 — Helpers (TDD per-task)

### Task 1.1: `listStaff()` + `listDoctors()` `{ includeHidden }` filter

**Files:**
- Modify: `src/lib/backendClient.js:9675-9701` (listStaff) + `:9745-9770` (listDoctors)
- Create test: `tests/staff-doctor-hidden-filter.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/staff-doctor-hidden-filter.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase imports — listStaff/listDoctors fetch via getDocs(...).
// We replace the underlying Firestore snap with a stub that returns
// the docs array we control, then assert the filter behavior at the
// public function boundary.

const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    getDocs: (...args) => mockGetDocs(...args),
    collection: (...args) => ({ __mock: 'collection', args }),
    doc: (...args) => ({ __mock: 'doc', args }),
    getDoc: vi.fn(),
    setDoc: vi.fn(async () => undefined),
    deleteDoc: vi.fn(async () => undefined),
    serverTimestamp: () => '__SERVER_TS__',
  };
});

vi.mock('../src/firebase.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-admin-uid' } },
}));

// Import AFTER mocks
const { listStaff, listDoctors } = await import('../src/lib/backendClient.js');

function makeSnap(docs) {
  return {
    docs: docs.map(d => ({
      id: d.id,
      data: () => ({ ...d }),
    })),
  };
}

describe('H1 — listStaff / listDoctors {includeHidden} filter', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
  });

  it('H1.1 — listStaff() default returns only docs where !isHidden', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      { id: 'S1', firstname: 'A', lastname: 'A', isHidden: false },
      { id: 'S2', firstname: 'B', lastname: 'B', isHidden: true },
      { id: 'S3', firstname: 'C', lastname: 'C' /* undefined isHidden = visible */ },
    ]));
    const out = await listStaff();
    expect(out.map(s => s.id).sort()).toEqual(['S1', 'S3']);
  });

  it('H1.2 — listStaff({ includeHidden: true }) returns all docs', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      { id: 'S1', firstname: 'A', lastname: 'A', isHidden: false },
      { id: 'S2', firstname: 'B', lastname: 'B', isHidden: true },
    ]));
    const out = await listStaff({ includeHidden: true });
    expect(out.map(s => s.id).sort()).toEqual(['S1', 'S2']);
  });

  it('H1.3 — listStaff() backward-compat: docs without isHidden field are visible', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      { id: 'S1', firstname: 'A', lastname: 'A' },
      { id: 'S2', firstname: 'B', lastname: 'B' },
    ]));
    const out = await listStaff();
    expect(out).toHaveLength(2);
  });

  it('H1.4 — listDoctors() default filter mirrors listStaff', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      { id: 'D1', firstname: 'Dr', lastname: 'A', isHidden: false },
      { id: 'D2', firstname: 'Dr', lastname: 'B', isHidden: true },
    ]));
    const out = await listDoctors();
    expect(out.map(d => d.id)).toEqual(['D1']);
  });

  it('H1.5 — listDoctors({ includeHidden: true }) returns all', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      { id: 'D1', firstname: 'Dr', lastname: 'A', isHidden: false },
      { id: 'D2', firstname: 'Dr', lastname: 'B', isHidden: true },
    ]));
    const out = await listDoctors({ includeHidden: true });
    expect(out).toHaveLength(2);
  });

  it('H1.6 — listDoctors() preserves backward-compat for assistant doctors (position: ผู้ช่วยแพทย์)', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      { id: 'D1', position: 'แพทย์', firstname: 'A', lastname: 'A' },
      { id: 'D2', position: 'ผู้ช่วยแพทย์', firstname: 'B', lastname: 'B', isHidden: true },
      { id: 'D3', position: 'ผู้ช่วยแพทย์', firstname: 'C', lastname: 'C' },
    ]));
    const out = await listDoctors();
    expect(out.map(d => d.id).sort()).toEqual(['D1', 'D3']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd F:/LoverClinic-app && npx vitest run tests/staff-doctor-hidden-filter.test.js 2>&1 | tail -10
```
Expected: FAIL — `listStaff()` ignores `{ includeHidden }` opt; H1.1/H1.4/H1.5/H1.6 fail.

- [ ] **Step 3: Modify `listStaff` to accept `{ includeHidden }`**

In `src/lib/backendClient.js` find the existing `listStaff()` definition (line ~9675). Change the function signature and add filter step:

```js
export async function listStaff({ includeHidden = false } = {}) {
  const snap = await getDocs(staffCol());
  // Phase 15.7-octies (2026-04-29) — compose `name` field at source
  // (mirror of listDoctors Phase 15.7-bis fix). be_staff stores
  // firstname/lastname/nickname (lowercase, ProClinic schema) but
  // consumers (AppointmentFormModal advisor picker, ActorPicker, etc.)
  // render `{s.name}` directly. Pre-fix s.name was undefined → empty
  // dropdown options (user report 2026-04-29: "ที่ปรึกษา ตอนนี้บั๊ค
  // ไม่แสดงอะไรเลย"). Source-level fix benefits every caller.
  // Composition order mirrors mergeSellersWithBranchFilter:8245-8250.
  //
  // V41 (2026-05-08) — `isHidden` filter. Default-filter `!isHidden` so
  // every picker auto-secures; opt in `{ includeHidden: true }` from
  // StaffTab + past-record lookup-map builders. Mirror be_products
  // isHidden precedent (line 10273). See AV20 audit invariant.
  const items = snap.docs.map(d => {
    const data = d.data();
    const parts = [data.firstname || data.firstName || '', data.lastname || data.lastName || ''].filter(Boolean);
    const composed = parts.join(' ').trim();
    const composedName = data.name || composed || data.nickname || data.fullName || '';
    return { id: d.id, ...data, name: composedName };
  });
  const visible = includeHidden ? items : items.filter(s => !s.isHidden);
  visible.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return visible;
}
```

- [ ] **Step 4: Modify `listDoctors` mirror change**

In `src/lib/backendClient.js` find `listDoctors()` (line ~9745). Change signature + filter + sort identically:

```js
export async function listDoctors({ includeHidden = false } = {}) {
  const snap = await getDocs(doctorsCol());
  // Phase 15.7-bis (2026-04-28) — compose `name` field at source. be_doctors
  // stores firstname/lastname/nickname (ProClinic schema, lowercase) but
  // consumers (AppointmentFormModal picker, AppointmentTab grid via
  // doctorMap, DepositPanel picker, TreatmentFormPage assistants picker)
  // render `{d.name}` directly. Pre-fix d.name was undefined → empty
  // checkboxes in pickers (user report 2026-04-28: "ไม่แสดงชื่อแพทย์และ
  // ผู้ช่วยเลย ในการนัดหมาย"). Source-level fix benefits every caller.
  // Composition order mirrors mergeSellersWithBranchFilter:7937-7942.
  //
  // V41 (2026-05-08) — `isHidden` filter (mirror listStaff). Both regular
  // doctors (position:'แพทย์') and assistant doctors (position:'ผู้ช่วยแพทย์')
  // share the same flag.
  const items = snap.docs.map(d => {
    const data = d.data();
    const parts = [data.firstname || data.firstName || '', data.lastname || data.lastName || ''].filter(Boolean);
    const composed = parts.join(' ').trim();
    const composedName = data.name || composed || data.nickname || data.fullName || '';
    return { id: d.id, ...data, name: composedName };
  });
  const visible = includeHidden ? items : items.filter(d => !d.isHidden);
  visible.sort((a, b) => {
    const ua = a.updatedAt || '';
    const ub = b.updatedAt || '';
    if (ua !== ub) return ub.localeCompare(ua);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return visible;
}
```

(Note: copy the existing tail of `listDoctors` after the `.map(...)` line — the existing version may not have the sort block; if the existing function ends with `return items;` directly, replace that with the `visible` block above.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd F:/LoverClinic-app && npx vitest run tests/staff-doctor-hidden-filter.test.js 2>&1 | tail -10
```
Expected: PASS (6 H1 assertions).

- [ ] **Step 6: Commit**

```bash
cd F:/LoverClinic-app && git add src/lib/backendClient.js tests/staff-doctor-hidden-filter.test.js && git commit -m "feat(staff-doctor-hide): listStaff + listDoctors {includeHidden} filter (Task 1.1)"
```

---

### Task 1.2: `saveStaff` + `saveDoctor` audit-stamp on transition

**Files:**
- Modify: `src/lib/backendClient.js` (`saveStaff` at line ~9701, `saveDoctor` at line ~9884)
- Modify: `tests/staff-doctor-hidden-filter.test.js` (extend with H2 group)

- [ ] **Step 1: Write failing tests for audit-stamp transition**

Append to `tests/staff-doctor-hidden-filter.test.js` (after the H1 describe block, before closing the file):

```js
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn(async () => undefined);
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    getDocs: (...args) => mockGetDocs(...args),
    getDoc: (...args) => mockGetDoc(...args),
    setDoc: (...args) => mockSetDoc(...args),
    deleteDoc: vi.fn(async () => undefined),
    collection: (...args) => ({ __mock: 'collection', args }),
    doc: (...args) => ({ __mock: 'doc', args }),
    serverTimestamp: () => '__SERVER_TS__',
  };
});

// Mock validators to no-op pass-through for these tests
vi.mock('../src/lib/staffValidation.js', () => ({
  normalizeStaff: (data) => data,
  validateStaff: () => null,
  STATUS_OPTIONS: [],
  POSITION_OPTIONS: [],
  emptyStaffForm: () => ({}),
  generateStaffId: () => 'STAFF-TEST',
}));
vi.mock('../src/lib/doctorValidation.js', () => ({
  normalizeDoctor: (data) => data,
  validateDoctor: () => null,
  STATUS_OPTIONS: [],
  POSITION_OPTIONS: [],
  DF_PAID_TYPE_OPTIONS: [],
  emptyDoctorForm: () => ({}),
  generateDoctorId: () => 'DOCTOR-TEST',
}));

const { saveStaff, saveDoctor } = await import('../src/lib/backendClient.js');

describe('H2 — saveStaff / saveDoctor audit-stamp on isHidden transition', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockSetDoc.mockReset();
  });

  it('H2.1 — saveStaff visible→hidden stamps hiddenAt + hiddenBy', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ isHidden: false }) });
    await saveStaff('S1', { firstname: 'A', lastname: 'A', isHidden: true });
    const written = mockSetDoc.mock.calls[0][1];
    expect(written.isHidden).toBe(true);
    expect(written.hiddenAt).toBe('__SERVER_TS__');
    expect(written.hiddenBy).toBe('test-admin-uid');
  });

  it('H2.2 — saveStaff hidden→visible clears hiddenAt + hiddenBy', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ isHidden: true, hiddenAt: 'past-ts', hiddenBy: 'past-uid' }) });
    await saveStaff('S1', { firstname: 'A', lastname: 'A', isHidden: false });
    const written = mockSetDoc.mock.calls[0][1];
    expect(written.isHidden).toBe(false);
    expect(written.hiddenAt).toBeNull();
    expect(written.hiddenBy).toBeNull();
  });

  it('H2.3 — saveStaff no-transition does NOT modify audit stamps (idempotent)', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ isHidden: true, hiddenAt: 'past-ts', hiddenBy: 'past-uid' }) });
    await saveStaff('S1', { firstname: 'A', lastname: 'A', isHidden: true });
    const written = mockSetDoc.mock.calls[0][1];
    // Audit stamps not modified by the save handler — caller's data shape passes through
    expect(written.hiddenAt).toBeUndefined();
    expect(written.hiddenBy).toBeUndefined();
  });

  it('H2.4 — saveDoctor mirror behavior (visible→hidden)', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ isHidden: false }) });
    await saveDoctor('D1', { firstname: 'Dr', lastname: 'A', position: 'แพทย์', isHidden: true });
    const written = mockSetDoc.mock.calls[0][1];
    expect(written.isHidden).toBe(true);
    expect(written.hiddenAt).toBe('__SERVER_TS__');
    expect(written.hiddenBy).toBe('test-admin-uid');
  });

  it('H2.5 — saveDoctor for assistant (position:ผู้ช่วยแพทย์) audit-stamps the same way', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ isHidden: false }) });
    await saveDoctor('D2', { firstname: 'Dr', lastname: 'B', position: 'ผู้ช่วยแพทย์', isHidden: true });
    const written = mockSetDoc.mock.calls[0][1];
    expect(written.isHidden).toBe(true);
    expect(written.hiddenAt).toBe('__SERVER_TS__');
  });

  it('H2.6 — saveStaff for new doc (no existing) treats undefined isHidden as visible (no transition)', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    await saveStaff('S1', { firstname: 'A', lastname: 'A', isHidden: false });
    const written = mockSetDoc.mock.calls[0][1];
    expect(written.isHidden).toBe(false);
    expect(written.hiddenAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd F:/LoverClinic-app && npx vitest run tests/staff-doctor-hidden-filter.test.js 2>&1 | tail -10
```
Expected: FAIL — saveStaff/saveDoctor don't yet stamp audit fields.

- [ ] **Step 3: Modify `saveStaff` to read existing + stamp on transition**

In `src/lib/backendClient.js` `saveStaff(staffId, data)` (line ~9701), inject the transition logic AFTER `validateStaff` succeeds and BEFORE the existing `setDoc(...)`. Replace the existing function body (the part that builds the doc + setDoc) with:

```js
export async function saveStaff(staffId, data) {
  const id = String(staffId || '');
  if (!id) throw new Error('staffId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeStaff, validateStaff } = await import('./staffValidation.js');

  const normalized = normalizeStaff(data);
  const fail = validateStaff(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }

  // Don't persist the raw password to Firestore — it's consumed by /api/admin/users
  // at the caller before saveStaff is invoked.
  const { password: _drop, ...safe } = normalized;

  // V41 (2026-05-08) — audit-stamp isHidden transition. Read the existing doc
  // BEFORE the write so we can detect transition; idempotent re-saves of the
  // same isHidden value preserve the original transition record.
  const existingSnap = await getDoc(staffDoc(id));
  const wasHidden = !!(existingSnap.exists?.() && existingSnap.data()?.isHidden);
  const willBeHidden = !!safe.isHidden;
  const auditStamps = {};
  if (wasHidden !== willBeHidden) {
    auditStamps.hiddenAt = willBeHidden ? serverTimestamp() : null;
    auditStamps.hiddenBy = willBeHidden ? (auth?.currentUser?.uid || null) : null;
  }

  const now = new Date().toISOString();
  await setDoc(staffDoc(id), {
    ...safe,
    ...auditStamps,
    staffId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}
```

Verify the imports at the top of `backendClient.js` already include `getDoc`, `setDoc`, `serverTimestamp`, and `auth`. If `auth` is not imported, add it from `../firebase.js` at the top of the file (it's likely already imported in this codebase — check first).

- [ ] **Step 4: Modify `saveDoctor` mirror change**

In `src/lib/backendClient.js` `saveDoctor(doctorId, data)` (line ~9884), apply the identical pattern:

```js
export async function saveDoctor(doctorId, data) {
  const id = String(doctorId || '');
  if (!id) throw new Error('doctorId required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data object required');
  const { normalizeDoctor, validateDoctor } = await import('./doctorValidation.js');

  const normalized = normalizeDoctor(data);
  const fail = validateDoctor(normalized);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }

  const { password: _drop, ...safe } = normalized;

  // V41 (2026-05-08) — audit-stamp isHidden transition.
  const existingSnap = await getDoc(doctorDoc(id));
  const wasHidden = !!(existingSnap.exists?.() && existingSnap.data()?.isHidden);
  const willBeHidden = !!safe.isHidden;
  const auditStamps = {};
  if (wasHidden !== willBeHidden) {
    auditStamps.hiddenAt = willBeHidden ? serverTimestamp() : null;
    auditStamps.hiddenBy = willBeHidden ? (auth?.currentUser?.uid || null) : null;
  }

  const now = new Date().toISOString();
  await setDoc(doctorDoc(id), {
    ...safe,
    ...auditStamps,
    doctorId: id,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd F:/LoverClinic-app && npx vitest run tests/staff-doctor-hidden-filter.test.js 2>&1 | tail -10
```
Expected: PASS (12 total — H1.1–1.6 + H2.1–2.6).

- [ ] **Step 6: Commit**

```bash
cd F:/LoverClinic-app && git add src/lib/backendClient.js tests/staff-doctor-hidden-filter.test.js && git commit -m "feat(staff-doctor-hide): saveStaff + saveDoctor audit-stamp transition (Task 1.2)"
```

---

### Task 1.3: scopedDataLayer pass-through verification + validators isHidden field

**Files:**
- Modify: `src/lib/scopedDataLayer.js` (verify `listStaff` + `listDoctors` re-exports; pass-through opts arg already works because they're universal lazy-export pass-through wrappers per V40 BSA Layer-2 pattern; verify nothing breaks)
- Modify: `src/lib/staffValidation.js` (add `isHidden: false` to `emptyStaffForm()`; pass through in `normalizeStaff`)
- Modify: `src/lib/doctorValidation.js` (mirror change)

- [ ] **Step 1: Verify scopedDataLayer pass-through (no code change expected)**

```bash
cd F:/LoverClinic-app && grep -n "listStaff\|listDoctors" src/lib/scopedDataLayer.js | head -5
```

The file should show `export const listStaff = (...args) => raw.listStaff(...args)` (or similar lazy re-export — V40 lazy refactor pattern). If it does, no change needed; the `{ includeHidden }` opt passes through automatically. If it has a different shape (e.g. zero-arity wrapper), STOP and report — that's a wrapper that silently drops opts (V39 pattern), and we need to fix it.

If pass-through is verified clean, this step is no-op. Skip to Step 2.

- [ ] **Step 2: Add `isHidden` field to `emptyStaffForm()` + `normalizeStaff()`**

In `src/lib/staffValidation.js`:

Find `emptyStaffForm()` (line ~143). Add `isHidden: false` to the returned shape. The function currently looks something like:

```js
export function emptyStaffForm() {
  return {
    staffId: '',
    firstname: '',
    lastname: '',
    // ... existing fields ...
  };
}
```

Add `isHidden: false` at the END of the returned object literal (preserve existing field order). The exact diff line:

```js
    isHidden: false,
```

Find `normalizeStaff(data)` in the same file. It currently returns a normalized object. Ensure it preserves `isHidden` from input data (don't drop it). If `normalizeStaff` uses an explicit field whitelist, add `isHidden: !!data.isHidden`. If it spreads input data (less common in this codebase), no change needed.

Find `validateStaff(data)` in the same file. Hidden status doesn't impose any validation constraint (no required + no max length etc.) — no change needed.

- [ ] **Step 3: Add `isHidden` field to `emptyDoctorForm()` + `normalizeDoctor()`**

In `src/lib/doctorValidation.js`:

Find `emptyDoctorForm()` (line ~160). Add `isHidden: false` at the END of the returned object literal:

```js
    isHidden: false,
```

Find `normalizeDoctor(data)`. Same instruction as Step 2 — preserve `isHidden`.

`validateDoctor` — no change needed.

- [ ] **Step 4: Run helper tests + a quick sanity build**

```bash
cd F:/LoverClinic-app && npx vitest run tests/staff-doctor-hidden-filter.test.js 2>&1 | tail -5
```
Expected: 12 PASS (H1+H2 unchanged).

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -3
```
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
cd F:/LoverClinic-app && git add src/lib/staffValidation.js src/lib/doctorValidation.js && git commit -m "feat(staff-doctor-hide): emptyStaffForm + emptyDoctorForm include isHidden (Task 1.3)"
```

---

## Phase 2 — UI (work-first per Rule K, batch tests at Phase 3)

### Task 2.1: StaffFormModal + DoctorFormModal — checkbox at top of form

**Files:**
- Modify: `src/components/backend/StaffFormModal.jsx`
- Modify: `src/components/backend/DoctorFormModal.jsx`

- [ ] **Step 1: Add checkbox to StaffFormModal**

In `src/components/backend/StaffFormModal.jsx`, find the `<MarketingFormShell>` opening tag (around line 102) and the FIRST child element/section inside it (the form body starts here). Insert this block as the FIRST child of `MarketingFormShell` (BEFORE all other field groups):

```jsx
<div className="flex flex-col gap-1 p-3 rounded-lg bg-amber-900/20 border border-amber-800/40 mb-4">
  <label className="flex items-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={!!form.isHidden}
      onChange={(e) => setForm(f => ({ ...f, isHidden: e.target.checked }))}
      data-field="isHidden"
      className="w-4 h-4"
    />
    <span className="font-medium text-amber-300">🙈 ซ่อน — ไม่แสดงรายชื่อ</span>
  </label>
  <div className="text-xs text-[var(--tx-muted)] ml-6">
    เมื่อเปิด: คนนี้ยัง login + ใช้สิทธิ์ได้ปกติ แต่จะไม่ปรากฏใน dropdown / picker / รายการ ทุกที่ในระบบ (ยกเว้นในแท็บนี้ + ประวัติเก่าที่อ้างชื่อไว้แล้ว)
  </div>
</div>
```

The state binding uses the existing `form`/`setForm` pair already in this file (`useState(() => staff ? { ...emptyStaffForm(), ...staff, password: '' } : emptyStaffForm())` at line ~22).

The `form.isHidden` value will already initialize correctly because:
- Edit mode: `staff.isHidden` (existing doc) wins via spread.
- Create mode: `emptyStaffForm().isHidden = false` (set in Task 1.3 Step 2).

- [ ] **Step 2: Verify saveStaff payload includes isHidden**

In `src/components/backend/StaffFormModal.jsx`, find the `handleSubmit` / `saveStaff` call site. The form's existing `saveStaff(staffId, form)` should already pass through the entire `form` object. No code change needed — `isHidden` travels in `form`.

If the save handler whitelists fields explicitly (uncommon — most this-codebase saves spread the form), add `isHidden` to the whitelist. Grep `saveStaff(` in StaffFormModal to confirm — if `saveStaff(id, form)` or `saveStaff(id, { ...form, ... })`, no change.

- [ ] **Step 3: Add checkbox to DoctorFormModal**

In `src/components/backend/DoctorFormModal.jsx`, find the `<MarketingFormShell>` opening tag (around line 88) and insert the same block as Step 1 as its FIRST child:

```jsx
<div className="flex flex-col gap-1 p-3 rounded-lg bg-amber-900/20 border border-amber-800/40 mb-4">
  <label className="flex items-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={!!form.isHidden}
      onChange={(e) => setForm(f => ({ ...f, isHidden: e.target.checked }))}
      data-field="isHidden"
      className="w-4 h-4"
    />
    <span className="font-medium text-amber-300">🙈 ซ่อน — ไม่แสดงรายชื่อ</span>
  </label>
  <div className="text-xs text-[var(--tx-muted)] ml-6">
    เมื่อเปิด: คนนี้ยัง login + ใช้สิทธิ์ได้ปกติ แต่จะไม่ปรากฏใน dropdown / picker / รายการ ทุกที่ในระบบ (ยกเว้นในแท็บนี้ + ประวัติเก่าที่อ้างชื่อไว้แล้ว)
  </div>
</div>
```

- [ ] **Step 4: Build clean check**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -3
```
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
cd F:/LoverClinic-app && git add src/components/backend/StaffFormModal.jsx src/components/backend/DoctorFormModal.jsx && git commit -m "feat(staff-doctor-hide): checkbox at top of StaffFormModal + DoctorFormModal (Task 2.1)"
```

---

### Task 2.2: StaffTab + DoctorsTab — opt-in `{ includeHidden: true }` + row badge

**Files:**
- Modify: `src/components/backend/StaffTab.jsx` (line ~10 import + line ~39 listStaff call + row render section)
- Modify: `src/components/backend/DoctorsTab.jsx` (line ~8 import + line ~42 listDoctors call + row render section)

- [ ] **Step 1: StaffTab — opt-in `{ includeHidden: true }`**

In `src/components/backend/StaffTab.jsx` line ~39, replace:

```js
setItems(await listStaff());
```

with:

```js
// V41 (2026-05-08) — admin tab must show hidden staff so admin can unhide.
// AV20 audit invariant: lookup-map / admin-management consumers opt in.
setItems(await listStaff({ includeHidden: true }));
```

- [ ] **Step 2: StaffTab — row badge for `isHidden`**

In `src/components/backend/StaffTab.jsx` find the row render section (likely a `.map(staff => <tr>...</tr>)` or `<div>` per row). Find where the staff name is rendered. Add the badge AFTER the name:

```jsx
{staff.isHidden && (
  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-900/30 text-amber-300 border border-amber-800/40">
    🙈 ซ่อน
  </span>
)}
```

(If the row uses a different layout — flex container, table cell, etc. — drop the `ml-2` margin and use `gap-2` on the parent if appropriate. Match existing layout patterns.)

- [ ] **Step 3: DoctorsTab — opt-in `{ includeHidden: true }`**

In `src/components/backend/DoctorsTab.jsx` line ~42, replace:

```js
setItems(await listDoctors());
```

with:

```js
// V41 (2026-05-08) — admin tab must show hidden doctors so admin can unhide.
// AV20 audit invariant: lookup-map / admin-management consumers opt in.
setItems(await listDoctors({ includeHidden: true }));
```

- [ ] **Step 4: DoctorsTab — row badge for `isHidden`**

Mirror Step 2 in `src/components/backend/DoctorsTab.jsx`. Add the same badge after the doctor name in the row render.

- [ ] **Step 5: Build clean check**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd F:/LoverClinic-app && git add src/components/backend/StaffTab.jsx src/components/backend/DoctorsTab.jsx && git commit -m "feat(staff-doctor-hide): StaffTab + DoctorsTab opt-in + row badge (Task 2.2)"
```

---

### Task 2.3: Past-record consumer migrations — split pattern

**Files:**
- Modify: `src/components/backend/CustomerDetailView.jsx`
- Modify: `src/components/TreatmentFormPage.jsx`
- Modify: `src/pages/AdminDashboard.jsx`
- Modify: `src/components/backend/AppointmentCalendarView.jsx`

For each file, find every callsite of `listStaff()` / `listDoctors()` and classify it:
- **Lookup-map context** (used to render past-record names): change to `{ includeHidden: true }`
- **Picker context** (admin selects WHO for new transactions): leave default
- **Mixed** (one call powers both): change to `{ includeHidden: true }`, then derive a `visibleX` array client-side via `.filter(d => !d.isHidden)` for the picker dropdown

- [ ] **Step 1: CustomerDetailView — opt-in for past-record lookup**

In `src/components/backend/CustomerDetailView.jsx`, find the `listStaff()` and `listDoctors()` call sites. They are used to build the doctor/staff name maps for treatment timeline + sale list display (past records). Change BOTH to `{ includeHidden: true }`:

```js
// Find lines like:
//   listStaff().catch(() => [])
//   listDoctors().catch(() => [])
// Change to:
listStaff({ includeHidden: true }).catch(() => [])
listDoctors({ includeHidden: true }).catch(() => [])
```

Add an inline comment above the change:

```js
// V41 (2026-05-08) — opt-in for past-record name lookup. AV20: hidden persons'
// names must still display on past treatments / sales / appointments.
```

- [ ] **Step 2: TreatmentFormPage — split pattern**

In `src/components/TreatmentFormPage.jsx` line ~664-680, find the `Promise.all([listDoctors().catch(() => []), listStaff().catch(() => [])])` block. This call powers BOTH the doctor/assistant pickers AND the existing-treatment-display name lookup.

Apply the split:

```js
// V41 (2026-05-08) — split: opt-in for full lookup map (handles past-record
// name display for hidden persons) + filter visible client-side for the
// picker dropdown. AV20.
const [allDoctors, allStaff] = await Promise.all([
  listDoctors({ includeHidden: true }).catch(() => []),  // universal — soft-gate below
  listStaff({ includeHidden: true }).catch(() => []),    // universal — soft-gate below
]);
const visibleDoctors = allDoctors.filter(d => !d.isHidden);
const visibleStaff = allStaff.filter(s => !s.isHidden);
```

Find the downstream consumers in this same function:
- `setDoctors(...)` / `setStaff(...)` — these likely populate the picker dropdowns. Pass the FILTERED lists: `setDoctors(visibleDoctors)` / `setStaff(visibleStaff)`.
- If a separate state holds the lookup map for displaying existing treatments: build it from `allDoctors` / `allStaff`.

If the file currently doesn't separate "picker source" from "lookup map source", leave a single state variable but ensure picker rendering filters `!isHidden` at the dropdown level.

- [ ] **Step 3: AdminDashboard — split for loadDepositOptions + loadTodaysPractitioners**

In `src/pages/AdminDashboard.jsx`:
- Line ~353-354 (`loadDepositOptions` block): apply the same split pattern as Step 2 (opt-in for full + filter for picker).
- Line ~1821-1822 (`loadTodaysPractitioners`): this loads doctors+staff for display in the today's practitioners panel. Per spec: this panel is a "today's roster display" — closer to a picker than past-record. Use DEFAULT lister (no opt-in). However if any admin clicks a name to view their past sales, we need lookup. Pragmatic choice: use `{ includeHidden: true }` because it powers the practitioner panel which DOES surface clickable rows linking to history. If unsure, default to `{ includeHidden: true }` and filter at render.

Apply:

```js
// V41 (2026-05-08) — opt-in for both contexts. Today's practitioners panel
// + deposit options builder both render past-aware data. AV20.
listDoctors({ includeHidden: true }).catch(() => []),
listStaff({ includeHidden: true }).catch(() => []),
```

For the deposit options block, after fetch, derive visible-only:

```js
const visibleDoctors = doctorList.filter(d => !d.isHidden);
const visibleStaff = staffList.filter(s => !s.isHidden);
// Use visibleDoctors / visibleStaff for the picker options;
// keep the full lists for any name-lookup map.
```

- [ ] **Step 4: AppointmentCalendarView — split for past appointment display**

In `src/components/backend/AppointmentCalendarView.jsx` line ~250, find `listDoctors()` call site. The calendar grid renders names from PAST appointments (past appointments stored with `doctorId: X`; calendar resolves name via the doctor map). Change to:

```js
// V41 (2026-05-08) — opt-in for past appointment name resolution.
// AV20: calendar grid renders names from past records.
listDoctors({ includeHidden: true })
```

Then find any picker (e.g. appointment-create modal triggered from this view) that uses the same fetched list. Filter that picker's options client-side:

```jsx
// In the picker render:
{doctors.filter(d => !d.isHidden).map(d => ...)}
```

OR if the picker is in a separate component (AppointmentFormModal), that component uses its own `listDoctors()` call — the DEFAULT filter handles it (no change needed there).

- [ ] **Step 5: Build clean check**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd F:/LoverClinic-app && git add src/components/backend/CustomerDetailView.jsx src/components/TreatmentFormPage.jsx src/pages/AdminDashboard.jsx src/components/backend/AppointmentCalendarView.jsx && git commit -m "feat(staff-doctor-hide): consumer migrations — opt-in lookup + filter picker (Task 2.3)"
```

---

## Phase 3 — Tests + live e2e

### Task 3.1: Multi-reader-sweep audit (source-grep regression guards)

**Files:**
- Create: `tests/staff-doctor-hide-consumer-sweep.test.js`

- [ ] **Step 1: Write the audit test**

Create `tests/staff-doctor-hide-consumer-sweep.test.js`:

```js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8');

describe('CS1 — Lookup-map consumers opt-in {includeHidden:true}', () => {
  it('CS1.1 — StaffTab calls listStaff({includeHidden:true})', () => {
    const code = read('src/components/backend/StaffTab.jsx');
    expect(code).toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });

  it('CS1.2 — DoctorsTab calls listDoctors({includeHidden:true})', () => {
    const code = read('src/components/backend/DoctorsTab.jsx');
    expect(code).toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });

  it('CS1.3 — CustomerDetailView opts in for both staff + doctors', () => {
    const code = read('src/components/backend/CustomerDetailView.jsx');
    expect(code).toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
    expect(code).toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });

  it('CS1.4 — TreatmentFormPage uses split pattern (opt-in + visibleX filter)', () => {
    const code = read('src/components/TreatmentFormPage.jsx');
    expect(code).toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
    expect(code).toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
    // Either visibleDoctors or visibleStaff should appear (split derivation)
    expect(code).toMatch(/(visibleDoctors|visibleStaff)/);
  });

  it('CS1.5 — AdminDashboard split pattern', () => {
    const code = read('src/pages/AdminDashboard.jsx');
    expect(code).toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
    expect(code).toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });

  it('CS1.6 — AppointmentCalendarView opts in for past appointment name resolution', () => {
    const code = read('src/components/backend/AppointmentCalendarView.jsx');
    expect(code).toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });
});

describe('CS2 — Picker-only consumers should NOT opt in (default-filter handles them)', () => {
  it('CS2.1 — AppointmentFormModal does NOT use {includeHidden:true} for its pickers', () => {
    const code = read('src/components/backend/AppointmentFormModal.jsx');
    // AppointmentFormModal is a picker-only consumer — default-filter is correct.
    // If a future change adds {includeHidden:true} here, it must be paired with
    // a justifying inline comment + filtered visibleX derivation.
    expect(code).not.toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
    expect(code).not.toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });

  it('CS2.2 — DepositPanel: same constraint (picker-only)', () => {
    const code = read('src/components/backend/DepositPanel.jsx');
    expect(code).not.toMatch(/listDoctors\(\s*\{\s*includeHidden:\s*true\s*\}/);
    expect(code).not.toMatch(/listStaff\(\s*\{\s*includeHidden:\s*true\s*\}/);
  });
});

describe('CS3 — Lib-layer source-grep', () => {
  it('CS3.1 — listStaff signature accepts {includeHidden} opt', () => {
    const code = read('src/lib/backendClient.js');
    expect(code).toMatch(/export async function listStaff\(\{?\s*includeHidden\s*=\s*false/);
  });

  it('CS3.2 — listDoctors signature accepts {includeHidden} opt', () => {
    const code = read('src/lib/backendClient.js');
    expect(code).toMatch(/export async function listDoctors\(\{?\s*includeHidden\s*=\s*false/);
  });

  it('CS3.3 — saveStaff includes V41 transition stamp logic', () => {
    const code = read('src/lib/backendClient.js');
    expect(code).toMatch(/V41.*audit-stamp/);
    expect(code).toMatch(/wasHidden\s*!==\s*willBeHidden/);
    expect(code).toMatch(/hiddenAt:\s*willBeHidden\s*\?\s*serverTimestamp/);
  });

  it('CS3.4 — saveDoctor includes V41 transition stamp logic', () => {
    const code = read('src/lib/backendClient.js');
    // Both saveStaff and saveDoctor have the same comment marker
    const matches = code.match(/V41.*audit-stamp/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('CS4 — emptyForm shapes include isHidden', () => {
  it('CS4.1 — emptyStaffForm includes isHidden:false', () => {
    const code = read('src/lib/staffValidation.js');
    expect(code).toMatch(/isHidden:\s*false/);
  });

  it('CS4.2 — emptyDoctorForm includes isHidden:false', () => {
    const code = read('src/lib/doctorValidation.js');
    expect(code).toMatch(/isHidden:\s*false/);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd F:/LoverClinic-app && npx vitest run tests/staff-doctor-hide-consumer-sweep.test.js 2>&1 | tail -10
```
Expected: PASS — all CS1-CS4 assertions green (assuming Phase 1 + 2 complete).

If any assertion fails, that consumer migration was missed in Phase 2. Go back, fix that file, then re-run.

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app && git add tests/staff-doctor-hide-consumer-sweep.test.js && git commit -m "test(staff-doctor-hide): multi-reader sweep audit (Task 3.1)"
```

---

### Task 3.2: UI RTL — modal checkbox + tab badge behavior

**Files:**
- Create: `tests/staff-doctor-hide-modal-rtl.test.jsx`

- [ ] **Step 1: Write the RTL test**

Create `tests/staff-doctor-hide-modal-rtl.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock backendClient + adminUsersClient so the modal can render without Firestore
const mockSaveStaff = vi.fn(async () => undefined);
const mockSaveDoctor = vi.fn(async () => undefined);
const mockListBranches = vi.fn(async () => []);
const mockListPermissionGroups = vi.fn(async () => []);
const mockListDfGroups = vi.fn(async () => []);
const mockListStaff = vi.fn(async () => []);
const mockListDoctors = vi.fn(async () => []);

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  saveStaff: (...a) => mockSaveStaff(...a),
  saveDoctor: (...a) => mockSaveDoctor(...a),
  listBranches: (...a) => mockListBranches(...a),
  listPermissionGroups: (...a) => mockListPermissionGroups(...a),
  listDfGroups: (...a) => mockListDfGroups(...a),
  listStaff: (...a) => mockListStaff(...a),
  listDoctors: (...a) => mockListDoctors(...a),
  deleteStaff: vi.fn(),
  deleteDoctor: vi.fn(),
}));
vi.mock('../src/lib/adminUsersClient.js', () => ({
  createAdminUser: vi.fn(async () => undefined),
  updateAdminUser: vi.fn(async () => undefined),
  setUserPermission: vi.fn(async () => undefined),
}));

// Lazy-import the modals AFTER mocks are set up
const StaffFormModal = (await import('../src/components/backend/StaffFormModal.jsx')).default;
const DoctorFormModal = (await import('../src/components/backend/DoctorFormModal.jsx')).default;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UI1 — StaffFormModal hide checkbox', () => {
  it('UI1.1 — renders the "ซ่อน" checkbox at top with helper text', () => {
    render(<StaffFormModal staff={null} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText(/🙈 ซ่อน — ไม่แสดงรายชื่อ/)).toBeInTheDocument();
    expect(screen.getByText(/ยัง login \+ ใช้สิทธิ์ได้ปกติ/)).toBeInTheDocument();
  });

  it('UI1.2 — checkbox unchecked by default for new staff', () => {
    render(<StaffFormModal staff={null} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);
  });

  it('UI1.3 — checkbox checked when editing a hidden staff', () => {
    render(<StaffFormModal staff={{ staffId: 'S1', firstname: 'A', lastname: 'A', isHidden: true }} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    expect(checkbox.checked).toBe(true);
  });

  it('UI1.4 — toggling checkbox updates state', () => {
    render(<StaffFormModal staff={null} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});

describe('UI2 — DoctorFormModal hide checkbox', () => {
  it('UI2.1 — renders the "ซ่อน" checkbox at top', () => {
    render(<DoctorFormModal doctor={null} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText(/🙈 ซ่อน — ไม่แสดงรายชื่อ/)).toBeInTheDocument();
  });

  it('UI2.2 — checkbox checked when editing a hidden doctor', () => {
    render(<DoctorFormModal doctor={{ doctorId: 'D1', firstname: 'Dr', lastname: 'A', position: 'แพทย์', isHidden: true }} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    expect(checkbox.checked).toBe(true);
  });

  it('UI2.3 — toggling checkbox updates state', () => {
    render(<DoctorFormModal doctor={null} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it('UI2.4 — checkbox state persists across position changes (ผู้ช่วยแพทย์ same flag)', () => {
    render(<DoctorFormModal doctor={{ doctorId: 'D1', firstname: 'Dr', lastname: 'A', position: 'ผู้ช่วยแพทย์', isHidden: true }} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    expect(checkbox.checked).toBe(true);
  });
});
```

- [ ] **Step 2: Run the RTL test**

```bash
cd F:/LoverClinic-app && npx vitest run tests/staff-doctor-hide-modal-rtl.test.jsx 2>&1 | tail -10
```
Expected: PASS (UI1.1–4 + UI2.1–4 = 8 assertions).

If any test fails (e.g. modal renders error because some other dependency missing), inspect the existing modal's imports — you may need to mock additional libs. Look at existing RTL tests in this codebase (`tests/branch-backup-ui-rtl.test.jsx`, `tests/customer-treatment-timeline-flow.test.js`) for the pattern.

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app && git add tests/staff-doctor-hide-modal-rtl.test.jsx && git commit -m "test(staff-doctor-hide): RTL modal checkbox behavior (Task 3.2)"
```

---

### Task 3.3: Live admin-SDK e2e on real prod (TEST-prefixed)

**Files:**
- Create: `scripts/e2e-staff-doctor-hide.mjs`

- [ ] **Step 1: Write the e2e script**

Create `scripts/e2e-staff-doctor-hide.mjs` (mirror pattern of `scripts/e2e-branch-backup-restore.mjs`):

```js
#!/usr/bin/env node
// E2E: live admin-SDK round-trip on real prod for V41 staff/doctor hide.
// Pattern mirrors scripts/e2e-branch-backup-restore.mjs (V40).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]; if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();

const TS = Date.now();
const TEST_STAFF_ID = `TEST-STAFF-V41-${TS}`;
const TEST_DOCTOR_ID = `TEST-DOCTOR-V41-${TS}`;
const TEST_ASSISTANT_ID = `TEST-ASSISTANT-V41-${TS}`;

const cleanup = [];

async function main() {
  console.log('═══ E2E: V41 staff/doctor hide round-trip ═══');
  console.log(`Test fixtures: ${TEST_STAFF_ID} / ${TEST_DOCTOR_ID} / ${TEST_ASSISTANT_ID}\n`);

  const staffRef = db.collection(`${BASE_PATH}/be_staff`).doc(TEST_STAFF_ID);
  const doctorRef = db.collection(`${BASE_PATH}/be_doctors`).doc(TEST_DOCTOR_ID);
  const assistantRef = db.collection(`${BASE_PATH}/be_doctors`).doc(TEST_ASSISTANT_ID);

  // Phase 1 — create TEST fixtures (visible)
  await staffRef.set({
    staffId: TEST_STAFF_ID,
    firstname: 'V41 Test',
    lastname: 'Staff',
    name: 'V41 Test Staff',
    position: 'ที่ปรึกษา',
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  cleanup.push(staffRef);
  await doctorRef.set({
    doctorId: TEST_DOCTOR_ID,
    firstname: 'V41 Test',
    lastname: 'Doctor',
    name: 'V41 Test Doctor',
    position: 'แพทย์',
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  cleanup.push(doctorRef);
  await assistantRef.set({
    doctorId: TEST_ASSISTANT_ID,
    firstname: 'V41 Test',
    lastname: 'Assistant',
    name: 'V41 Test Assistant',
    position: 'ผู้ช่วยแพทย์',
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  cleanup.push(assistantRef);
  console.log('✓ Created 3 TEST fixtures (1 staff + 1 doctor + 1 assistant)');

  // Phase 2 — verify present in default lister query (admin-SDK direct query)
  // Direct Firestore query mirrors the lib-layer listStaff() default-filter
  // when applied with a `where('isHidden', '==', false)` clause. We don't
  // call the lib function from Node because it depends on web-SDK Firestore
  // shim. Instead we directly verify the doc shape + filter behavior.
  const staffDoc = await staffRef.get();
  if (!staffDoc.exists || staffDoc.data().isHidden !== false) {
    throw new Error('Phase 2 FAIL: staff fixture not visible at write time');
  }
  console.log('✓ Phase 2: TEST staff present + isHidden=false');

  // Phase 3 — toggle isHidden=true via direct admin-SDK update + audit-stamp
  await staffRef.update({
    isHidden: true,
    hiddenAt: FieldValue.serverTimestamp(),
    hiddenBy: 'e2e-script',
    updatedAt: new Date().toISOString(),
  });
  await doctorRef.update({
    isHidden: true,
    hiddenAt: FieldValue.serverTimestamp(),
    hiddenBy: 'e2e-script',
    updatedAt: new Date().toISOString(),
  });
  await assistantRef.update({
    isHidden: true,
    hiddenAt: FieldValue.serverTimestamp(),
    hiddenBy: 'e2e-script',
    updatedAt: new Date().toISOString(),
  });
  console.log('✓ Phase 3: 3 fixtures updated to isHidden=true with audit stamps');

  // Phase 4 — verify audit fields stamped on all 3
  for (const [label, ref] of [['staff', staffRef], ['doctor', doctorRef], ['assistant', assistantRef]]) {
    const d = (await ref.get()).data();
    if (d.isHidden !== true) throw new Error(`Phase 4 FAIL ${label}: isHidden !== true`);
    if (!d.hiddenAt) throw new Error(`Phase 4 FAIL ${label}: hiddenAt missing`);
    if (d.hiddenBy !== 'e2e-script') throw new Error(`Phase 4 FAIL ${label}: hiddenBy mismatch`);
  }
  console.log('✓ Phase 4: audit stamps verified on all 3 (hiddenAt + hiddenBy present)');

  // Phase 5 — verify Firestore where-filter excludes hidden by default
  // (mirrors listStaff() default behavior — query with implicit non-hidden)
  // Using Node admin SDK we query for `where isHidden == false` to simulate.
  const visibleStaffSnap = await db.collection(`${BASE_PATH}/be_staff`)
    .where('isHidden', '==', false).get();
  const visibleDocIds = visibleStaffSnap.docs.map(d => d.id);
  if (visibleDocIds.includes(TEST_STAFF_ID)) {
    throw new Error('Phase 5 FAIL: hidden staff appears in where(isHidden==false) query');
  }
  console.log('✓ Phase 5: hidden TEST staff EXCLUDED from where(isHidden==false) query (default-filter semantic)');

  // Phase 6 — toggle back isHidden=false + clear audit stamps
  await staffRef.update({
    isHidden: false,
    hiddenAt: null,
    hiddenBy: null,
    updatedAt: new Date().toISOString(),
  });
  const restored = (await staffRef.get()).data();
  if (restored.isHidden !== false) throw new Error('Phase 6 FAIL: unhide did not stick');
  if (restored.hiddenAt !== null) throw new Error('Phase 6 FAIL: hiddenAt not cleared');
  if (restored.hiddenBy !== null) throw new Error('Phase 6 FAIL: hiddenBy not cleared');
  console.log('✓ Phase 6: unhide round-trip succeeded — audit stamps cleared');

  console.log('\n═══ ✓ E2E PASS — V41 staff/doctor hide round-trip ═══');
}

async function doCleanup() {
  console.log('\n🧹 Cleanup...');
  for (const ref of cleanup) {
    try { await ref.delete(); } catch (e) { console.log(`  ! cleanup error: ${e.message}`); }
  }
  console.log(`   ✓ ${cleanup.length} TEST fixtures cleaned`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(doCleanup)
    .then(() => process.exit(0))
    .catch(async (e) => { console.error('FATAL:', e); await doCleanup(); process.exit(1); });
}
```

- [ ] **Step 2: Run live e2e**

```bash
cd F:/LoverClinic-app && node scripts/e2e-staff-doctor-hide.mjs 2>&1 | tail -25
```

Expected output (verbatim required):
- `✓ Created 3 TEST fixtures (1 staff + 1 doctor + 1 assistant)`
- `✓ Phase 2: TEST staff present + isHidden=false`
- `✓ Phase 3: 3 fixtures updated to isHidden=true with audit stamps`
- `✓ Phase 4: audit stamps verified on all 3 (hiddenAt + hiddenBy present)`
- `✓ Phase 5: hidden TEST staff EXCLUDED from where(isHidden==false) query (default-filter semantic)`
- `✓ Phase 6: unhide round-trip succeeded — audit stamps cleared`
- `═══ ✓ E2E PASS — V41 staff/doctor hide round-trip ═══`
- `🧹 Cleanup... ✓ 3 TEST fixtures cleaned`

If any phase fails, the script reports `FATAL:` + cleans up + exits non-zero. Report DONE_WITH_CONCERNS with the failing phase output.

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app && git add scripts/e2e-staff-doctor-hide.mjs && git commit -m "test(staff-doctor-hide): live admin-SDK e2e on real prod (Task 3.3)"
```

---

## Phase 4 — V41 docs + AV20 + final ship

### Task 4.1: V41 + AV20 docs

**Files:**
- Modify: `.claude/rules/00-session-start.md` (V41 compact V-entry)
- Modify: `.claude/rules/v-log-archive.md` (V41 verbose entry)
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV20 invariant + AV1–AV20 header)

- [ ] **Step 1: V41 compact V-entry**

In `.claude/rules/00-session-start.md`, find the V-table (section "## 2. PAST VIOLATIONS — compact summary"). Find the V40 row. Insert a new V41 row ABOVE V40 (V-entries reverse-chronological):

```
| V41 | 2026-05-08 | **Staff/Doctor hide-from-lists shipped** — User requested a "ไม่แสดงรายชื่อ" toggle on StaffFormModal + DoctorFormModal. Hidden persons keep login + permissions but disappear from every dropdown/picker/list system-wide. Architecture: `isHidden: boolean` field on be_staff + be_doctors + audit fields (`hiddenAt`, `hiddenBy`). `listStaff()` + `listDoctors()` default-filter `!isHidden`; opt-in `{ includeHidden: true }` for StaffTab/DoctorsTab admin lists + past-record lookup-map consumers (CustomerDetailView, TreatmentFormPage, AdminDashboard, AppointmentCalendarView). Save handlers stamp `hiddenAt` (serverTimestamp) + `hiddenBy` (uid) on transition; clear on unhide; idempotent on no-transition. Mirror `isHidden` precedent on be_products. UI: amber-tinted checkbox at top of both form modals + amber "ซ่อน" badge on rows of admin tabs. **AV20**: NEW invariant — lookup-map consumers (those that build ID→entity maps for past-record name display) MUST opt-in `{ includeHidden: true }`; picker-only consumers MUST use the default lister. Source-grep regression guards in `tests/staff-doctor-hide-consumer-sweep.test.js` lock the consumer-side classification permanently. **Lessons**: (a) default-filter at lister + opt-in is the V12-multi-reader-sweep-safe pattern (NEW pickers added later auto-secure; lookup-map consumers fail at audit if forgotten). (b) Mirror existing schema patterns (be_products.isHidden) instead of inventing a new field shape — Rule of 3 alignment. (c) Audit-stamp on transition (not on every save) preserves the original transition timestamp + makes idempotent re-saves harmless. |
```

Commit:
```bash
cd F:/LoverClinic-app && git add .claude/rules/00-session-start.md && git commit -m "docs(v41): compact V-entry for staff/doctor hide ship (Task 4.1a)"
```

- [ ] **Step 2: V41 verbose archive entry**

Append to `.claude/rules/v-log-archive.md` (after the V40 verbose entry):

```markdown


---

### V41 — 2026-05-08 — Staff/Doctor hide-from-lists shipped

User asked (verbatim): "ใน tab=staff และ tab=doctors เพิ่มปุ่มใหม่คือ 'ไม่แสดงรายชื่อ' ... ยังมีชื่ออยู่ในระบบ login ได้ ทำทุกอย่างได้ตามสิทธิ์เหมือนคนอื่นๆ แต่จะไม่ไปโผล่ในดรอปดาวน์ การดึงรายชื่อในเมนูใดๆ ... ไม่ปรากฎที่ไหนเลย"

**Goal**: ship a soft-archive flag that hides a staff/doctor/assistant person from every dropdown/picker/list system-wide, while preserving login + permissions + past-record name display.

**Architecture (3 layers)**:

1. **Schema** — `be_staff` + `be_doctors` documents gain three fields:
   - `isHidden: boolean` (default undefined → falsy → visible; backward-compat for existing docs)
   - `hiddenAt: timestamp | null` (stamped on visible→hidden transition; cleared on unhide)
   - `hiddenBy: uid | null` (admin who toggled; cleared on unhide)

2. **Lister default-filter at lib layer** — `src/lib/backendClient.js`:
   - `listStaff({ includeHidden = false } = {})` — default filters `!doc.isHidden`
   - `listDoctors({ includeHidden = false } = {})` — same
   - `{ includeHidden: true }` opt returns all docs (visible + hidden)

3. **Save handler audit-stamp on transition** — `saveStaff` + `saveDoctor`:
   - Read existing doc via `getDoc` BEFORE write
   - Detect `wasHidden !== willBeHidden` (transition)
   - Stamp `hiddenAt: serverTimestamp()` + `hiddenBy: auth.currentUser.uid` if transitioning to hidden
   - Set both to `null` if transitioning to visible
   - No modification on no-transition (idempotent re-saves preserve original transition record)

**UI changes**:

- **StaffFormModal + DoctorFormModal**: amber-tinted checkbox at TOP of form labeled "🙈 ซ่อน — ไม่แสดงรายชื่อ" with helper "เมื่อเปิด: คนนี้ยัง login + ใช้สิทธิ์ได้ปกติ แต่จะไม่ปรากฏใน dropdown / picker / รายการ ทุกที่ในระบบ (ยกเว้นในแท็บนี้ + ประวัติเก่าที่อ้างชื่อไว้แล้ว)". `data-field="isHidden"` for testability.

- **StaffTab + DoctorsTab**: opt in `listStaff({ includeHidden: true })` / `listDoctors({ includeHidden: true })` so admin sees both visible + hidden rows. Hidden rows display a subtle amber "ซ่อน" badge next to the name.

**Consumer migrations (Phase 2.3 — multi-reader-sweep)**:

For each consumer that BOTH picks AND displays past-record names, apply the split pattern:

```js
const allDoctors = await listDoctors({ includeHidden: true });
const visibleDoctors = allDoctors.filter(d => !d.isHidden);
// allDoctors → lookup map for past-record name display
// visibleDoctors → picker dropdown options
```

Files touched: `CustomerDetailView.jsx`, `TreatmentFormPage.jsx`, `AdminDashboard.jsx`, `AppointmentCalendarView.jsx`. Picker-only consumers (`AppointmentFormModal`, `DepositPanel`) use the default lister — auto-filtered.

**AV20 audit invariant** (NEW from V41):

```
AV20 — Lookup-map consumers must opt-in {includeHidden: true}

Components that build an ID→entity map for past-record name display MUST
call the lister with `{ includeHidden: true }`. Picker-only components
MUST use the default lister (no opt-in).

Why: V41 (2026-05-08) — listStaff()/listDoctors() default-filter
`!isHidden`. Past records reference staff/doctors by id; if the lookup
map is built from a default-filtered lister, hidden persons' names
render as blank in past records' display labels.

Grep:
- `listStaff\(\{[^}]*\}\)` and `listDoctors\(\{[^}]*\}\)` — every opt-in
  callsite must be either StaffTab/DoctorsTab/Customer*View/
  TreatmentFormPage (lookup-map context) or carry an inline comment
  justifying the opt-in.
- Source-grep regression guard locked in tests/
  staff-doctor-hide-consumer-sweep.test.js (CS1 + CS2).
```

**Files**:
- 10 modified (backendClient.js + scopedDataLayer.js + 2 validation files + 4 consumer files + 2 form modals)
- 4 new (3 test files + 1 e2e script)
- 3 doc updates (V41 compact + verbose + AV20)

**Tests**:
- 12 helper unit (H1.1–6 + H2.1–6) in `tests/staff-doctor-hidden-filter.test.js`
- 8 RTL UI behavior (UI1.1–4 + UI2.1–4) in `tests/staff-doctor-hide-modal-rtl.test.jsx`
- 12 multi-reader-sweep audit (CS1.1–6 + CS2.1–2 + CS3.1–4) in `tests/staff-doctor-hide-consumer-sweep.test.js`
- 6 phase live admin-SDK e2e (3 fixtures × create/transition/audit/filter/unhide) in `scripts/e2e-staff-doctor-hide.mjs`

**Lessons**:

1. **Default-filter at lister + opt-in is the V12-safe pattern** — NEW pickers added later auto-secure (no risk of leak); lookup-map consumers fail loudly at audit if forgotten. This is the same pattern V40 used for branch-scoped collections (default-inject + audit-branch-scope BS-1) — generalizes to any "soft archive" / "soft hide" concept.

2. **Mirror existing schema patterns** — `be_products.isHidden` was already a Rule-C1 precedent. Reusing the field name + semantic alignment (rather than inventing `excludeFromDropdowns` or `archived`) saved the implementer from a Rule of 3 violation.

3. **Audit-stamp on transition (not every save)** preserves the original transition timestamp + makes idempotent re-saves harmless. Critical for legal/HR audit trail integrity (admin can answer "when was this person hidden?" without timestamp drift).

4. **Schema backward-compat via undefined→falsy** lets existing docs (without `isHidden`) treat as visible without a migration. Saves a deploy + audit doc + run cycle.

5. **Past-record display + audit-trail** — splitting a single fetch into "lookup map (full)" + "picker dropdown (filtered)" with one .filter() call is cheaper than two network calls + cleaner than per-component filter inversion.

Files relevant to V41:
- `src/lib/backendClient.js:9675` (listStaff) + `:9745` (listDoctors) + `:9701` (saveStaff) + `:9884` (saveDoctor)
- `src/lib/scopedDataLayer.js` — universal pass-through preserved
- `src/lib/staffValidation.js:143` (emptyStaffForm) + `src/lib/doctorValidation.js:160` (emptyDoctorForm)
- `src/components/backend/StaffFormModal.jsx:102` (MarketingFormShell first child) + `src/components/backend/DoctorFormModal.jsx:88`
- `src/components/backend/StaffTab.jsx:39` + `DoctorsTab.jsx:42` (opt-in)
- 4 consumer migrations (CustomerDetailView + TreatmentFormPage + AdminDashboard + AppointmentCalendarView)
- 3 test banks + 1 e2e script (paths above)
- `.claude/rules/00-session-start.md` — V41 compact V-entry
- `.claude/rules/v-log-archive.md` — this entry
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV20 invariant
```

Commit:
```bash
cd F:/LoverClinic-app && git add .claude/rules/v-log-archive.md && git commit -m "docs(v41): verbose V-entry archive (Task 4.1b)"
```

- [ ] **Step 3: AV20 audit invariant**

In `.agents/skills/audit-anti-vibe-code/SKILL.md`, find the existing AV19 block. Add AV20 after it. Also update the AV1–AV19 → AV1–AV20 header at the top of the file.

```markdown
### AV20 — Lookup-map consumers must opt-in `{ includeHidden: true }` (V41)

**Why**: V41 (2026-05-08) — `listStaff()` / `listDoctors()` in `src/lib/backendClient.js` default-filter `!isHidden` so every picker auto-secures (V12 multi-reader-sweep safe pattern). Past records reference staff/doctors by id; if a component's lookup map is built from a default-filtered lister, hidden persons' names render as blank in past records' display labels — silent regression.

**Grep**:
- `listStaff\(\{[^}]*\}\)` — every opt-in callsite. Must be one of: `StaffTab.jsx`, `DoctorsTab.jsx`, `CustomerDetailView.jsx`, `TreatmentFormPage.jsx`, `AdminDashboard.jsx`, `AppointmentCalendarView.jsx`. New callsites need an inline V41/AV20 comment justifying opt-in.
- `listDoctors\(\{[^}]*\}\)` — same.

**Sanctioned exception**: per-flow opt-in is allowed when (1) the component is a known lookup-map consumer (above list), or (2) the component derives a `visibleX` array client-side via `.filter(d => !d.isHidden)` for picker rendering — proving it understands the split pattern.

**Source-grep regression**: `tests/staff-doctor-hide-consumer-sweep.test.js` (CS1 + CS2) locks the consumer-side classification. CS1.* asserts opt-in present in lookup-map consumers; CS2.* asserts opt-in ABSENT in picker-only consumers.

**Anti-pattern (caught by AV20)**:
```js
// ❌ Picker-only file uses opt-in unnecessarily
// (would leak hidden persons into picker dropdown)
const doctors = await listDoctors({ includeHidden: true });

// ✅ Picker-only file uses default
const doctors = await listDoctors();

// ✅ Lookup-map context uses opt-in (with comment)
// V41 — need full map for past-record name display (AV20)
const allDoctors = await listDoctors({ includeHidden: true });
```
```

Commit:
```bash
cd F:/LoverClinic-app && git add .agents/skills/audit-anti-vibe-code/SKILL.md && git commit -m "docs(audit): AV20 lookup-map opt-in invariant (Task 4.1c)"
```

---

### Task 4.2: Final full-suite + build + push

**Files:** none (verification + push)

- [ ] **Step 1: Full test suite (Rule N: structural change → full suite)**

```bash
cd F:/LoverClinic-app && npm test -- --run 2>&1 | tail -15
```

Expected: ALL PASS. Test count = baseline 6859 + ~32 new V41 tests ≈ 6891.

If any test fails:
- Identify if V41-related (likely lookup-map oversight in a consumer) or pre-existing.
- If V41-related, GO BACK to Phase 2.3 — find the unmigrated consumer + fix it.
- If pre-existing, capture the failure + report DONE_WITH_CONCERNS.

- [ ] **Step 2: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -3
```

Expected: clean build. Pre-existing chunk-size warning OK.

- [ ] **Step 3: Verify all V41 commits present**

```bash
cd F:/LoverClinic-app && git log --oneline | head -15
```

Expected: ~10–12 V41 commits visible (Tasks 1.1 + 1.2 + 1.3 + 2.1 + 2.2 + 2.3 + 3.1 + 3.2 + 3.3 + 4.1a + 4.1b + 4.1c).

- [ ] **Step 4: Push to master**

```bash
cd F:/LoverClinic-app && git push origin master 2>&1 | tail -3
```

Expected: `master -> master` push success.

- [ ] **Step 5: Report to user**

```
✅ V41 (Staff/Doctor hide-from-lists) shipped + tested + pushed.

- 11 atomic tasks across 4 phases (~10–12 commits)
- Tests: +32 (helper 12 + RTL 8 + consumer-sweep 12) + 1 live admin-SDK e2e on real prod
- Full suite GREEN (~6891 tests)
- AV20 audit invariant added
- NO deploy executed — say "deploy" to ship V41 to prod via combined Probe-Deploy-Probe (Rule B + V40 7-endpoint list)
```

---

## Verification (E2E run-through for human reviewer)

After all 11 tasks complete:

1. **Helper tests**: `npx vitest run tests/staff-doctor-hidden-filter.test.js` → 12 PASS
2. **Consumer sweep**: `npx vitest run tests/staff-doctor-hide-consumer-sweep.test.js` → ~12 PASS
3. **RTL**: `npx vitest run tests/staff-doctor-hide-modal-rtl.test.jsx` → 8 PASS
4. **Live e2e**: `node scripts/e2e-staff-doctor-hide.mjs` → 6/6 phases PASS + cleanup verified
5. **Full suite**: `npm test -- --run` → all GREEN (~6891)
6. **Build**: `npm run build` → clean
7. **UI verification on localhost** (user-driven; admin tests UI per project convention):
   - Open localhost:5173 with admin login
   - Navigate to Staff tab → click a row to edit → see "🙈 ซ่อน" checkbox at top of modal → toggle on → save → row in list shows "🙈 ซ่อน" badge
   - Navigate to Appointment form → confirm hidden staff is NOT in the picker dropdown
   - Navigate to Customer detail → past treatment shows the hidden doctor's NAME correctly (not blank)
   - Toggle off via Staff tab → row no longer has badge → person reappears in pickers

---

## Self-review (run by writer)

**1. Spec coverage:**
- §1 Problem statement → covered by Goal + Context
- §2 Locked Q&A → cited in Phase 2 task scope (Q1 hide-scope, Q2 checkbox UI, Q3 existing permission)
- §3 Architecture → Phase 1 Tasks 1.1 (listers) + 1.2 (savers) + 1.3 (validators)
- §4 UI changes → Phase 2 Tasks 2.1 (modals) + 2.2 (tabs) + 2.3 (consumer migrations)
- §5 Audit invariants → Phase 4 Task 4.1c (AV20)
- §6 Test plan → Phase 1 (H1+H2 helper tests) + Phase 3 (RTL + sweep + e2e)
- §7 File manifest → covered exactly in §File Structure
- §8 Implementation order → matches Phase 1 → 2 → 3 → 4 here
- §9 Out of scope → respected (no bulk-toggle, no per-collection hide, no auto-hide, no new permission key)
- §10 Approval state → spec was approved 2026-05-08 ✓

**2. Placeholder scan:** no TBD / TODO / "fill in details" / "similar to Task N" / vague handwave. Tasks 4.1a–c reference exact line targets in target files (V40 row in 00-session-start.md, end of v-log-archive.md, after AV19 block in audit-anti-vibe-code/SKILL.md). Task 2.3 has explicit code snippets per file with split-pattern derivations. Task 1.2 inlines the full saveStaff body to avoid "modify only the audit logic" ambiguity.

**3. Type consistency:** mapper signatures + endpoint shapes consistent across tasks. `listStaff({ includeHidden = false } = {})` defined in Task 1.1 used identically in CS3.1 source-grep + Task 2.1/2.2 callsites. `hiddenAt`/`hiddenBy` field names defined in Task 1.2 used identically in H2 tests + Phase 4.1b verbose entry. UI checkbox `data-field="isHidden"` defined in Task 2.1 used in UI1.2/2.2/3 RTL tests.

**4. No spec gaps**: all spec items §1–§10 mapped to plan tasks. Out-of-scope items (§9) explicitly NOT in the plan — correctly deferred.

**Plan is complete and ready for execution.**
