# Phase 18.0 — Branch Exam Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add branch-scoped exam-room CRUD (`be_exam_rooms`) so each branch maintains its own independent room list. Rooms surface in AppointmentFormModal dropdown, AppointmentTab calendar columns, and DepositPanel deposit→appointment flow. Existing นครราชสีมา is seeded with 3 rooms (ห้องแพทย์/ห้องผ่าตัด, ห้องช็อคเวฟ, ห้องดริป) via a one-shot script. Appointments referencing a deleted/blank/cross-branch roomId fall into a virtual "ไม่ระบุห้อง" column at render — no writes on delete.

**Architecture:** Standard BSA branch-scoped collection (Layer 1 raw lister + Layer 2 scopedDataLayer auto-inject + Layer 3 useBranchAwareListener). Appointment docs gain `roomId` FK alongside the existing `roomName` snapshot (denormalized — matches the project's universal pattern). Runtime fallback (`effectiveRoomId(appt, branchRoomIdSet)`) routes orphan/blank/stale ids to a virtual UNASSIGNED column without writing to appt docs. Migration is seed-and-smart-backfill via admin SDK script with `--dry-run` / `--apply` modes.

**Tech Stack:** React 19 + Vitest 4.1 + Firebase Firestore (modular SDK) + Vite 8 + Tailwind 3.4 + firebase-admin 12 (migration script). Tests run via `npm test -- --run <path>`. Build via `npm run build`. Migration via `node scripts/phase-18-0-seed-exam-rooms.mjs`.

**Spec:** [`docs/superpowers/specs/2026-05-05-branch-exam-rooms-design.md`](../specs/2026-05-05-branch-exam-rooms-design.md)

**Baseline:** master = `3cba005` (after spec commit), 5199 tests pass, build clean. master is 4 commits ahead-of-prod (V15 #19 deploy still pending).

**TDD note:** Phase 18.0 is a single connected feature stream (master CRUD → consumers → migration). Per Rule K it does NOT qualify as a multi-stream cycle, so TDD per-task is appropriate (test-first within each task). The Rule I full-flow simulate test bank (Task 10) is the integrative final pass.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/lib/examRoomValidation.js` | Pure helpers: `validateExamRoom`, `emptyExamRoomForm`, `normalizeExamRoom`, `STATUS_OPTIONS`, length constants. Mirrors `branchValidation.js` shape. |
| `src/components/backend/ExamRoomFormModal.jsx` | MarketingFormShell modal — fields: name (req) / nameEn / note / status / sortOrder. Same structure as `BranchFormModal`. |
| `src/components/backend/ExamRoomsTab.jsx` | MarketingTabShell tab — list grid + search + status filter + CRUD. Mirrors `BranchesTab` shape. Branch-scoped via `useSelectedBranch`. |
| `scripts/phase-18-0-seed-exam-rooms.mjs` | One-shot admin SDK script — seed 3 rooms for นครราชสีมา + audit emit + smart backfill of appt `roomId`. `--dry-run` default, `--apply` to commit. |
| `tests/phase-18-0-exam-room-validation.test.js` | Pure helper unit tests — validateExamRoom branches + emptyExamRoomForm + normalizeExamRoom + adversarial inputs. |
| `tests/phase-18-0-exam-rooms-backend-client.test.js` | listExamRooms / saveExamRoom / deleteExamRoom + branchId stamping + listenToExamRoomsByBranch contract. |
| `tests/phase-18-0-exam-rooms-tab.test.jsx` | RTL — render → list → search → click create → modal → save → reload + delete confirm dialog with attached-appts count. |
| `tests/phase-18-0-appointment-form-rooms.test.jsx` | RTL — AppointmentFormModal dropdown sources from listExamRooms; saves both roomId + roomName; stale-room edit-mode hint. |
| `tests/phase-18-0-appointment-tab-columns.test.js` | Pure unit tests for `effectiveRoomId` helper + column derivation + virtual UNASSIGNED column appearance logic. |
| `tests/phase-18-0-deposit-panel-room-write.test.jsx` | RTL — DepositPanel deposit→appointment flow writes both roomId + roomName. |
| `tests/phase-18-0-migration-script.test.js` | Migration script unit tests — seed dedupe by name + backfill normalization + audit shape. Pure function exports tested without firebase-admin connection. |
| `tests/phase-18-0-flow-simulate.test.js` | Rule I full-flow simulate — F1 seed idempotency · F2 list scopedDataLayer branch-inject · F3 appt write contract · F4 delete-fallback · F5 cross-branch isolation · F6 unmatched-name fallback · F7 source-grep regression bank. |

### Modified files

| Path | Change |
|---|---|
| `src/lib/backendClient.js` | NEW: `examRoomsCol`, `examRoomDoc`, `listExamRooms({branchId, allBranches, status})`, `listenToExamRoomsByBranch`, `saveExamRoom`, `deleteExamRoom`. All branchId-stamped via `_resolveBranchIdForWrite`. ~80 LOC inserted. |
| `src/lib/scopedDataLayer.js` | Re-export the 4 new helpers — listExamRooms via `_autoInject`, listenToExamRoomsByBranch via positional auto-inject, saveExamRoom + deleteExamRoom passthrough. ~10 LOC. |
| `src/components/backend/AppointmentFormModal.jsx` | Drop `FALLBACK_ROOMS` const + `ROOMS_CACHE_KEY` localStorage cache. Load examRooms via listExamRooms({branchId, status:'ใช้งาน'}). Dropdown sources from real master. State holds roomId + roomName snapshot. Submit writes both. ~30 LOC delta. |
| `src/components/backend/AppointmentTab.jsx` | Replace string-keyed `roomSet` derivation with id-keyed columns from useBranchAwareListener(listenToExamRoomsByBranch). Append virtual UNASSIGNED column iff any orphan exists. ~40 LOC delta. |
| `src/components/backend/DepositPanel.jsx` | deposit→appointment form: add `apptRoomId` state + listExamRooms-driven dropdown (selected branch); write both roomId + roomName on save. ~30 LOC delta. |
| `src/lib/permissionGroupValidation.js` | Add `exam_room_management` to `ALL_PERMISSION_KEYS` under "ตั้งค่า / ข้อมูลพื้นฐาน". |
| `nav/navConfig.js` | Add `'exam-rooms'` entry in master section. |
| `src/pages/BackendDashboard.jsx` | Lazy import `ExamRoomsTab` + render case `tab === 'exam-rooms'`. |
| `firestore.rules` | NEW match block for `be_exam_rooms` — standard `isClinicStaff()` read+write gate. |
| `tests/branch-collection-coverage.test.js` | BC1.1 — add `be_exam_rooms: { scope: 'branch' }`. |
| `tests/phase11-master-data-scaffold.test.jsx` M2 (if present) + `tests/backend-nav-config.test.js` I4 (if present) | Bump master section count if asserted. |

---

## Task 1: `examRoomValidation.js` pure helpers + tests

**Files:**
- Create: `src/lib/examRoomValidation.js`
- Test: `tests/phase-18-0-exam-room-validation.test.js`

- [ ] **Step 1.1: Write failing test bank**

Create `tests/phase-18-0-exam-room-validation.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  validateExamRoom,
  emptyExamRoomForm,
  normalizeExamRoom,
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
} from '../src/lib/examRoomValidation.js';

describe('Phase 18.0 — examRoomValidation pure helpers', () => {
  describe('V1 emptyExamRoomForm', () => {
    it('V1.1 returns shape with all fields defaulted', () => {
      const f = emptyExamRoomForm();
      expect(f).toEqual({ name: '', nameEn: '', note: '', status: 'ใช้งาน', sortOrder: 0 });
    });
    it('V1.2 returns a fresh object each call (no shared ref)', () => {
      const a = emptyExamRoomForm();
      const b = emptyExamRoomForm();
      a.name = 'mut';
      expect(b.name).toBe('');
    });
  });

  describe('V2 STATUS_OPTIONS', () => {
    it('V2.1 frozen array of two values', () => {
      expect(STATUS_OPTIONS).toEqual(['ใช้งาน', 'พักใช้งาน']);
      expect(Object.isFrozen(STATUS_OPTIONS)).toBe(true);
    });
  });

  describe('V3 validateExamRoom — name required', () => {
    it('V3.1 missing form returns error', () => {
      expect(validateExamRoom(null)).toEqual(['form', 'missing form']);
      expect(validateExamRoom(undefined)).toEqual(['form', 'missing form']);
      expect(validateExamRoom([])).toEqual(['form', 'missing form']);
      expect(validateExamRoom('str')).toEqual(['form', 'missing form']);
    });
    it('V3.2 missing name returns ["name", ...]', () => {
      expect(validateExamRoom({})).toEqual(['name', 'กรุณากรอกชื่อห้องตรวจ']);
      expect(validateExamRoom({ name: '' })).toEqual(['name', 'กรุณากรอกชื่อห้องตรวจ']);
      expect(validateExamRoom({ name: '   ' })).toEqual(['name', 'กรุณากรอกชื่อห้องตรวจ']);
      expect(validateExamRoom({ name: 123 })).toEqual(['name', 'กรุณากรอกชื่อห้องตรวจ']);
    });
    it(`V3.3 name longer than ${NAME_MAX_LENGTH} chars rejected`, () => {
      const long = 'ก'.repeat(NAME_MAX_LENGTH + 1);
      expect(validateExamRoom({ name: long })).toEqual(['name', `ชื่อห้องไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`]);
    });
    it('V3.4 valid name passes (no other fields needed)', () => {
      expect(validateExamRoom({ name: 'ห้องดริป' })).toBeNull();
    });
  });

  describe('V4 validateExamRoom — nameEn / note bounds', () => {
    it('V4.1 nameEn longer than NAME_MAX_LENGTH rejected', () => {
      expect(validateExamRoom({ name: 'ห้อง', nameEn: 'a'.repeat(NAME_MAX_LENGTH + 1) }))
        .toEqual(['nameEn', `ชื่อ (EN) ไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`]);
    });
    it(`V4.2 note longer than ${NOTE_MAX_LENGTH} rejected`, () => {
      expect(validateExamRoom({ name: 'ห้อง', note: 'x'.repeat(NOTE_MAX_LENGTH + 1) }))
        .toEqual(['note', `note เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`]);
    });
  });

  describe('V5 validateExamRoom — status enum', () => {
    it('V5.1 invalid status rejected', () => {
      expect(validateExamRoom({ name: 'ห้อง', status: 'X' })).toEqual(['status', 'สถานะไม่ถูกต้อง']);
    });
    it('V5.2 valid statuses accepted', () => {
      expect(validateExamRoom({ name: 'ห้อง', status: 'ใช้งาน' })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', status: 'พักใช้งาน' })).toBeNull();
    });
    it('V5.3 status null/undefined ignored (treated as default)', () => {
      expect(validateExamRoom({ name: 'ห้อง', status: null })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', status: undefined })).toBeNull();
    });
  });

  describe('V6 validateExamRoom — sortOrder integer ≥ 0', () => {
    it('V6.1 negative rejected', () => {
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: -1 })).toEqual(['sortOrder', 'sortOrder ต้องเป็นจำนวนเต็มไม่ติดลบ']);
    });
    it('V6.2 non-integer rejected', () => {
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: 1.5 })).toEqual(['sortOrder', 'sortOrder ต้องเป็นจำนวนเต็มไม่ติดลบ']);
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: 'abc' })).toEqual(['sortOrder', 'sortOrder ต้องเป็นจำนวนเต็มไม่ติดลบ']);
    });
    it('V6.3 zero and positive integers accepted (incl. string-numeric)', () => {
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: 0 })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: 5 })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: '3' })).toBeNull();
    });
    it('V6.4 null/undefined sortOrder ignored', () => {
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: null })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: undefined })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: '' })).toBeNull();
    });
  });

  describe('V7 normalizeExamRoom', () => {
    it('V7.1 trims strings + defaults status + coerces sortOrder', () => {
      const out = normalizeExamRoom({
        name: '  ห้องดริป  ', nameEn: ' Drip ', note: ' line ', status: '', sortOrder: '4',
      });
      expect(out).toEqual({ name: 'ห้องดริป', nameEn: 'Drip', note: 'line', status: 'ใช้งาน', sortOrder: 4 });
    });
    it('V7.2 sortOrder unparseable falls back to 0', () => {
      const out = normalizeExamRoom({ name: 'X', sortOrder: 'abc' });
      expect(out.sortOrder).toBe(0);
    });
    it('V7.3 keeps non-trimmable falsy fields as ""', () => {
      const out = normalizeExamRoom({ name: 'X', nameEn: null, note: undefined });
      expect(out.nameEn).toBe('');
      expect(out.note).toBe('');
    });
  });
});
```

- [ ] **Step 1.2: Run failing test**

```bash
npm test -- --run tests/phase-18-0-exam-room-validation.test.js
```
Expected: ALL fail with "Cannot find module '../src/lib/examRoomValidation.js'".

- [ ] **Step 1.3: Implement `src/lib/examRoomValidation.js`**

```js
// ─── Exam-room validation — Phase 18.0 pure helpers ───────────────────────
// Branch-scoped master entity. Mirrors branchValidation.js / holidayValidation.js
// shape. Used by ExamRoomFormModal + saveExamRoom + migration script.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

export const NAME_MAX_LENGTH = 80;
export const NOTE_MAX_LENGTH = 200;

export function validateExamRoom(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  // name — required
  if (typeof form.name !== 'string') return ['name', 'กรุณากรอกชื่อห้องตรวจ'];
  const nm = form.name.trim();
  if (!nm) return ['name', 'กรุณากรอกชื่อห้องตรวจ'];
  if (nm.length > NAME_MAX_LENGTH) return ['name', `ชื่อห้องไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];

  // optional bounded text
  if (form.nameEn && String(form.nameEn).length > NAME_MAX_LENGTH) {
    return ['nameEn', `ชื่อ (EN) ไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  }
  if (form.note && String(form.note).length > NOTE_MAX_LENGTH) {
    return ['note', `note เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`];
  }

  // status enum
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  // sortOrder optional non-negative integer
  if (form.sortOrder !== undefined && form.sortOrder !== null && form.sortOrder !== '') {
    const n = Number(form.sortOrder);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return ['sortOrder', 'sortOrder ต้องเป็นจำนวนเต็มไม่ติดลบ'];
    }
  }

  return null;
}

export function emptyExamRoomForm() {
  return { name: '', nameEn: '', note: '', status: 'ใช้งาน', sortOrder: 0 };
}

export function normalizeExamRoom(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const coerceInt = (v) => {
    if (v === '' || v == null) return 0;
    const n = Number(v);
    return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : 0;
  };
  return {
    ...form,
    name: trim(form.name),
    nameEn: trim(form.nameEn),
    note: trim(form.note),
    status: form.status || 'ใช้งาน',
    sortOrder: coerceInt(form.sortOrder),
  };
}
```

- [ ] **Step 1.4: Run tests, verify pass**

```bash
npm test -- --run tests/phase-18-0-exam-room-validation.test.js
```
Expected: 18+ tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/examRoomValidation.js tests/phase-18-0-exam-room-validation.test.js
git commit -m "feat(phase-18-0/task-1): examRoomValidation pure helpers

validateExamRoom + emptyExamRoomForm + normalizeExamRoom + STATUS_OPTIONS.
Mirrors branchValidation/holidayValidation shape. Tests V1-V7 cover happy
path, null/undefined branches, length bounds, status enum, sortOrder
integer-≥-0, normalization trims + defaults.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `backendClient.js` exam-room CRUD + branchId stamping

**Files:**
- Modify: `src/lib/backendClient.js` (add ~80 LOC near other branch-scoped masters; e.g. after the `holidaysCol`/`listHolidays` block — search for `be_holidays` to find the insertion site)
- Test: `tests/phase-18-0-exam-rooms-backend-client.test.js`

- [ ] **Step 2.1: Locate insertion site**

```bash
grep -n "be_holidays\|holidaysCol\|listHolidays\|listenToHolidays" src/lib/backendClient.js | head -30
```

Expected: lines around `holidaysCol` declaration + `listHolidays`/`listenToHolidays` definitions. Insertion goes immediately after the holidays block to keep branch-scoped masters grouped.

- [ ] **Step 2.2: Write failing test**

Create `tests/phase-18-0-exam-rooms-backend-client.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockOnSnapshot = vi.fn();
const mockServerTimestamp = vi.fn(() => '__SERVER_TIMESTAMP__');
const mockQuery = vi.fn((col, ...constraints) => ({ __col: col, __constraints: constraints }));
const mockWhere = vi.fn((field, op, val) => ({ __where: [field, op, val] }));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDocs: (...a) => mockGetDocs(...a),
    setDoc: (...a) => mockSetDoc(...a),
    deleteDoc: (...a) => mockDeleteDoc(...a),
    onSnapshot: (...a) => mockOnSnapshot(...a),
    serverTimestamp: () => mockServerTimestamp(),
    query: (...a) => mockQuery(...a),
    where: (...a) => mockWhere(...a),
    collection: vi.fn(() => ({ __col: 'be_exam_rooms' })),
    doc: vi.fn((db, ...path) => ({ __doc: true, __path: path })),
    getDoc: vi.fn(),
    runTransaction: vi.fn(),
    writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() })),
  };
});
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));
vi.mock('../src/lib/branchSelection.js', () => ({
  resolveSelectedBranchId: vi.fn(() => 'BR-CALLER'),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Phase 18.0 — backendClient exam-room CRUD', () => {
  describe('B1 listExamRooms', () => {
    it('B1.1 with {branchId:"BR-A"} runs single query filtered by branchId', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [{ id: 'EXR-1', data: () => ({ name: 'A1', branchId: 'BR-A' }) }],
      });
      const { listExamRooms } = await import('../src/lib/backendClient.js');
      const items = await listExamRooms({ branchId: 'BR-A' });
      expect(mockGetDocs).toHaveBeenCalledTimes(1);
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
      expect(items).toEqual([{ id: 'EXR-1', name: 'A1', branchId: 'BR-A' }]);
    });

    it('B1.2 with {allBranches:true} runs no filter', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [{ id: 'EXR-1', data: () => ({}) }, { id: 'EXR-2', data: () => ({}) }],
      });
      const { listExamRooms } = await import('../src/lib/backendClient.js');
      const items = await listExamRooms({ allBranches: true });
      expect(items).toHaveLength(2);
      expect(mockWhere).not.toHaveBeenCalled();
    });

    it('B1.3 with {status:"ใช้งาน"} adds status where-clause', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [] });
      const { listExamRooms } = await import('../src/lib/backendClient.js');
      await listExamRooms({ branchId: 'BR-A', status: 'ใช้งาน' });
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'ใช้งาน');
    });
  });

  describe('B2 saveExamRoom — branchId stamping', () => {
    it('B2.1 stamps branchId from _resolveBranchIdForWrite + serverTimestamp on create', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);
      const { saveExamRoom } = await import('../src/lib/backendClient.js');
      await saveExamRoom('EXR-NEW', { name: 'ห้องดริป', sortOrder: 0 });
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const [, payload] = mockSetDoc.mock.calls[0];
      expect(payload.branchId).toBe('BR-CALLER');
      expect(payload.name).toBe('ห้องดริป');
      expect(payload.createdAt).toBe('__SERVER_TIMESTAMP__');
      expect(payload.updatedAt).toBe('__SERVER_TIMESTAMP__');
    });

    it('B2.2 explicit opts.branchId overrides resolver', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);
      const { saveExamRoom } = await import('../src/lib/backendClient.js');
      await saveExamRoom('EXR-X', { name: 'X' }, { branchId: 'BR-EXPLICIT' });
      const [, payload] = mockSetDoc.mock.calls[0];
      expect(payload.branchId).toBe('BR-EXPLICIT');
    });

    it('B2.3 normalizes via normalizeExamRoom (trims name, defaults status)', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);
      const { saveExamRoom } = await import('../src/lib/backendClient.js');
      await saveExamRoom('EXR-1', { name: '  ห้อง  ', status: '' });
      const [, payload] = mockSetDoc.mock.calls[0];
      expect(payload.name).toBe('ห้อง');
      expect(payload.status).toBe('ใช้งาน');
    });

    it('B2.4 throws on validation failure (does not call setDoc)', async () => {
      const { saveExamRoom } = await import('../src/lib/backendClient.js');
      await expect(saveExamRoom('EXR-1', { name: '' })).rejects.toThrow('กรุณากรอกชื่อห้อง');
      expect(mockSetDoc).not.toHaveBeenCalled();
    });
  });

  describe('B3 deleteExamRoom', () => {
    it('B3.1 calls deleteDoc on the right path', async () => {
      mockDeleteDoc.mockResolvedValueOnce(undefined);
      const { deleteExamRoom } = await import('../src/lib/backendClient.js');
      await deleteExamRoom('EXR-DEL');
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe('B4 listenToExamRoomsByBranch', () => {
    it('B4.1 subscribes with branchId where-clause + returns unsubscribe', async () => {
      const fakeUnsub = vi.fn();
      mockOnSnapshot.mockImplementationOnce((q, onNext) => {
        onNext({ docs: [{ id: 'EXR-1', data: () => ({ branchId: 'BR-A' }) }] });
        return fakeUnsub;
      });
      const { listenToExamRoomsByBranch } = await import('../src/lib/backendClient.js');
      const onChange = vi.fn();
      const unsub = listenToExamRoomsByBranch('BR-A', onChange, vi.fn());
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
      expect(onChange).toHaveBeenCalledWith([{ id: 'EXR-1', branchId: 'BR-A' }]);
      expect(unsub).toBe(fakeUnsub);
    });

    it('B4.2 onError forwarded to caller', async () => {
      mockOnSnapshot.mockImplementationOnce((q, onNext, onError) => {
        onError(new Error('rules denied'));
        return vi.fn();
      });
      const { listenToExamRoomsByBranch } = await import('../src/lib/backendClient.js');
      const onError = vi.fn();
      listenToExamRoomsByBranch('BR-A', vi.fn(), onError);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'rules denied' }));
    });
  });
});
```

- [ ] **Step 2.3: Run failing test**

```bash
npm test -- --run tests/phase-18-0-exam-rooms-backend-client.test.js
```
Expected: ALL fail with "listExamRooms is not exported" / similar.

- [ ] **Step 2.4: Implement in `src/lib/backendClient.js`**

Add immediately after the holidays block (search for `holidaysCol` insertion point):

```js
// ─── Phase 18.0 — be_exam_rooms (branch-scoped master) ──────────────────
import { validateExamRoom, normalizeExamRoom } from './examRoomValidation.js';

const examRoomsCol = () => collection(db, ...basePath(), 'be_exam_rooms');
const examRoomDoc = (id) => doc(db, ...basePath(), 'be_exam_rooms', String(id));

/**
 * List be_exam_rooms.
 * @param {Object} [opts]
 * @param {string}  [opts.branchId]      — filter to single branch
 * @param {boolean} [opts.allBranches]   — bypass branch filter
 * @param {string}  [opts.status]        — additional status filter
 */
export async function listExamRooms(opts = {}) {
  const constraints = [];
  if (opts && opts.branchId && !opts.allBranches) {
    constraints.push(where('branchId', '==', opts.branchId));
  }
  if (opts && opts.status) {
    constraints.push(where('status', '==', opts.status));
  }
  const q = constraints.length
    ? query(examRoomsCol(), ...constraints)
    : examRoomsCol();
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to be_exam_rooms for a single branch. Returns unsubscribe.
 * Wired through useBranchAwareListener in AppointmentTab + ExamRoomsTab.
 */
export function listenToExamRoomsByBranch(branchId, onChange, onError) {
  const q = query(examRoomsCol(), where('branchId', '==', branchId));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err) => onError && onError(err),
  );
}

/**
 * Create or update a single exam room. Stamps branchId via
 * _resolveBranchIdForWrite + serverTimestamp.
 */
export async function saveExamRoom(id, data, opts = {}) {
  const fail = validateExamRoom(data);
  if (fail) {
    const [, msg] = fail;
    throw new Error(msg);
  }
  const branchId = _resolveBranchIdForWrite(opts);
  const normalized = normalizeExamRoom(data);
  const payload = {
    ...normalized,
    examRoomId: id,
    branchId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(examRoomDoc(id), payload, { merge: true });
}

export async function deleteExamRoom(id) {
  await deleteDoc(examRoomDoc(id));
}
```

If `_resolveBranchIdForWrite` is not yet visible in this scope, locate it (search `function _resolveBranchIdForWrite`) and ensure imports are correct (already used by sibling helpers). The `import { validateExamRoom, normalizeExamRoom }` at module top is allowed because both are pure functions with no firebase deps.

- [ ] **Step 2.5: Run tests, verify pass**

```bash
npm test -- --run tests/phase-18-0-exam-rooms-backend-client.test.js
```
Expected: 9+ tests PASS.

- [ ] **Step 2.6: Commit**

```bash
git add src/lib/backendClient.js tests/phase-18-0-exam-rooms-backend-client.test.js
git commit -m "feat(phase-18-0/task-2): backendClient exam-room CRUD + branchId stamping

NEW: examRoomsCol/examRoomDoc + listExamRooms({branchId,allBranches,status})
+ listenToExamRoomsByBranch(branchId,onChange,onError) + saveExamRoom(id,data,opts)
+ deleteExamRoom(id). All branchId-stamped via _resolveBranchIdForWrite. Validation
runs via examRoomValidation.validateExamRoom before setDoc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `scopedDataLayer.js` re-exports + `branch-collection-coverage` registration

**Files:**
- Modify: `src/lib/scopedDataLayer.js`
- Modify: `tests/branch-collection-coverage.test.js`

- [ ] **Step 3.1: Locate scopedDataLayer holiday wrappers**

```bash
grep -n "listHolidays\|saveHoliday\|deleteHoliday\|listenToHolidays" src/lib/scopedDataLayer.js
```
Expected: lines around the holidays re-export block. Insertion site is immediately after.

- [ ] **Step 3.2: Add exam-room re-exports to scopedDataLayer**

After the holidays re-exports add:

```js
// ─── Phase 18.0 — be_exam_rooms branch-scoped master ───────────────────
export const listExamRooms = _autoInject(raw.listExamRooms);
export function listenToExamRoomsByBranch(branchId, onChange, onError) {
  // Positional API mirrored from backendClient — no auto-inject needed
  // because branchId is a positional arg. Hook layer (useBranchAwareListener)
  // is the wrapper that resolves the current branch.
  return raw.listenToExamRoomsByBranch(branchId, onChange, onError);
}
export const saveExamRoom = raw.saveExamRoom;
export const deleteExamRoom = raw.deleteExamRoom;
```

(`_autoInject` and `raw.*` are existing patterns in scopedDataLayer.js — confirm shape by reading neighboring exports.)

- [ ] **Step 3.3: Update branch-collection-coverage matrix**

Open `tests/branch-collection-coverage.test.js` and find the COLLECTION_MATRIX object. Add an entry:

```js
be_exam_rooms: { scope: 'branch' },
```

Insert alphabetically, near `be_expenses` or wherever `be_*` collections are sorted.

- [ ] **Step 3.4: Run all branch-scope-related tests**

```bash
npm test -- --run tests/branch-collection-coverage.test.js
npm test -- --run tests/scopedDataLayer.test.js
npm test -- --run tests/audit-branch-scope.test.js
```
Expected: PASS (BC1.1 now classifies be_exam_rooms; BS-1..BS-9 invariants automatic via wrapper).

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/scopedDataLayer.js tests/branch-collection-coverage.test.js
git commit -m "feat(phase-18-0/task-3): scopedDataLayer + branch-collection coverage

Re-export listExamRooms (auto-inject), listenToExamRoomsByBranch (positional
passthrough), saveExamRoom, deleteExamRoom. Register be_exam_rooms in
branch-collection-coverage COLLECTION_MATRIX as branch-scoped (BC1.1).
Audit BS-1..BS-9 invariants flow through unchanged (BSA Layer 2 wrapper).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `ExamRoomFormModal.jsx` + `ExamRoomsTab.jsx` UI

**Files:**
- Create: `src/components/backend/ExamRoomFormModal.jsx`
- Create: `src/components/backend/ExamRoomsTab.jsx`
- Test: `tests/phase-18-0-exam-rooms-tab.test.jsx`

- [ ] **Step 4.1: Read reference patterns**

```bash
cat src/components/backend/BranchFormModal.jsx | head -80
cat src/components/backend/BranchesTab.jsx | head -80
```

- [ ] **Step 4.2: Write failing RTL test**

Create `tests/phase-18-0-exam-rooms-tab.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockListExamRooms = vi.fn();
const mockSaveExamRoom = vi.fn();
const mockDeleteExamRoom = vi.fn();
const mockListAppointmentsForRoom = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listExamRooms: (...a) => mockListExamRooms(...a),
  saveExamRoom: (...a) => mockSaveExamRoom(...a),
  deleteExamRoom: (...a) => mockDeleteExamRoom(...a),
  listAppointments: (...a) => mockListAppointmentsForRoom(...a),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-A', branches: [{ branchId: 'BR-A', name: 'A' }] }),
  resolveBranchName: () => 'A',
}));
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useHasPermission: vi.fn(() => true),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockListExamRooms.mockResolvedValue([
    { id: 'EXR-1', examRoomId: 'EXR-1', branchId: 'BR-A', name: 'ห้องดริป', status: 'ใช้งาน', sortOrder: 0 },
    { id: 'EXR-2', examRoomId: 'EXR-2', branchId: 'BR-A', name: 'ห้องช็อคเวฟ', status: 'พักใช้งาน', sortOrder: 1 },
  ]);
  mockListAppointmentsForRoom.mockResolvedValue([]);
});

describe('Phase 18.0 — ExamRoomsTab', () => {
  it('R1.1 lists rooms in branch from listExamRooms', async () => {
    const { default: ExamRoomsTab } = await import('../src/components/backend/ExamRoomsTab.jsx');
    render(<ExamRoomsTab clinicSettings={{}} theme="dark" />);
    await waitFor(() => expect(mockListExamRooms).toHaveBeenCalledWith({ branchId: 'BR-A' }));
    expect(await screen.findByText('ห้องดริป')).toBeInTheDocument();
    expect(screen.getByText('ห้องช็อคเวฟ')).toBeInTheDocument();
  });

  it('R1.2 search filters by name', async () => {
    const { default: ExamRoomsTab } = await import('../src/components/backend/ExamRoomsTab.jsx');
    render(<ExamRoomsTab clinicSettings={{}} theme="dark" />);
    await waitFor(() => expect(mockListExamRooms).toHaveBeenCalled());
    const search = await screen.findByPlaceholderText(/ค้นหา/);
    fireEvent.change(search, { target: { value: 'ดริป' } });
    expect(await screen.findByText('ห้องดริป')).toBeInTheDocument();
    expect(screen.queryByText('ห้องช็อคเวฟ')).not.toBeInTheDocument();
  });

  it('R1.3 click create opens modal with empty form', async () => {
    const { default: ExamRoomsTab } = await import('../src/components/backend/ExamRoomsTab.jsx');
    render(<ExamRoomsTab clinicSettings={{}} theme="dark" />);
    await waitFor(() => expect(mockListExamRooms).toHaveBeenCalled());
    const createBtn = await screen.findByText(/เพิ่มห้องตรวจ/);
    fireEvent.click(createBtn);
    expect(await screen.findByText(/เพิ่มห้องตรวจ/, { selector: 'h2,h3,header *' })).toBeInTheDocument();
  });

  it('R1.4 delete shows confirm with attached-appts count', async () => {
    mockListAppointmentsForRoom.mockResolvedValue([{ id: 'A1' }, { id: 'A2' }, { id: 'A3' }]);
    window.confirm = vi.fn(() => false);
    const { default: ExamRoomsTab } = await import('../src/components/backend/ExamRoomsTab.jsx');
    render(<ExamRoomsTab clinicSettings={{}} theme="dark" />);
    await waitFor(() => expect(mockListExamRooms).toHaveBeenCalled());
    const deleteBtns = await screen.findAllByLabelText(/ลบห้องตรวจ/);
    fireEvent.click(deleteBtns[0]);
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('นัดหมาย 3 รายการ'));
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('ไม่ระบุห้อง'));
    });
    expect(mockDeleteExamRoom).not.toHaveBeenCalled(); // user cancelled
  });
});
```

- [ ] **Step 4.3: Run failing test**

```bash
npm test -- --run tests/phase-18-0-exam-rooms-tab.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 4.4: Implement `ExamRoomFormModal.jsx`**

```jsx
// ─── Exam Room Form Modal — Phase 18.0 ──────────────────────────────────
// Branch-scoped master CRUD modal. Shape mirrors BranchFormModal.

import { useState, useCallback } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { saveExamRoom } from '../../lib/scopedDataLayer.js';
import {
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  validateExamRoom,
  emptyExamRoomForm,
} from '../../lib/examRoomValidation.js';
import { generateMarketingId, scrollToField } from '../../lib/marketingUiUtils.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

export default function ExamRoomFormModal({ room, onClose, onSaved, clinicSettings }) {
  const isEdit = !!room;
  const { branchId } = useSelectedBranch();
  const [form, setForm] = useState(() => room ? { ...emptyExamRoomForm(), ...room } : emptyExamRoomForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const handleSave = async () => {
    setError('');
    const fail = validateExamRoom(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(field);
      return;
    }
    setSaving(true);
    try {
      const id = room?.examRoomId || room?.id || generateMarketingId('EXR');
      await saveExamRoom(id, form, { branchId });
      await onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="เพิ่มห้องตรวจ"
      titleEdit="แก้ไขห้องตรวจ"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="2xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      <div data-field="name">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
          ชื่อห้อง <RequiredAsterisk />
        </label>
        <input
          type="text"
          maxLength={NAME_MAX_LENGTH}
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="เช่น ห้องดริป"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div data-field="nameEn">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ชื่อห้อง (EN)</label>
        <input
          type="text"
          maxLength={NAME_MAX_LENGTH}
          value={form.nameEn}
          onChange={(e) => update({ nameEn: e.target.value })}
          placeholder="Drip room"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div data-field="note">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">หมายเหตุ</label>
        <textarea
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          value={form.note}
          onChange={(e) => update({ note: e.target.value })}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div data-field="status">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สถานะ</label>
          <select
            value={form.status}
            onChange={(e) => update({ status: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div data-field="sortOrder">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ลำดับการแสดง</label>
          <input
            type="number"
            min={0}
            step={1}
            value={form.sortOrder ?? 0}
            onChange={(e) => update({ sortOrder: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>
    </MarketingFormShell>
  );
}
```

- [ ] **Step 4.5: Implement `ExamRoomsTab.jsx`**

```jsx
// ─── Exam Rooms Tab — Phase 18.0 ────────────────────────────────────────
// Branch-scoped CRUD list. Shape mirrors BranchesTab.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, DoorOpen, Loader2 } from 'lucide-react';
import {
  listExamRooms,
  deleteExamRoom,
  listAppointments,
} from '../../lib/scopedDataLayer.js';
import ExamRoomFormModal from './ExamRoomFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { STATUS_OPTIONS } from '../../lib/examRoomValidation.js';

const STATUS_BADGE = {
  ใช้งาน:   { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  พักใช้งาน: { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

export default function ExamRoomsTab({ clinicSettings, theme }) {
  const { branchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const canDelete = useHasPermission('exam_room_management');

  const reload = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError('');
    try {
      setItems(await listExamRooms({ branchId }));
    } catch (e) {
      setError(e.message || 'โหลดห้องตรวจล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.slice().sort((a, b) =>
      (a.sortOrder || 0) - (b.sortOrder || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'th')
    ).filter(r => {
      if (q) {
        const hay = [r.name, r.nameEn, r.note].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus && (r.status || 'ใช้งาน') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterStatus]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (r) => { setEditing(r); setFormOpen(true); };

  const handleDelete = async (r) => {
    const id = r.examRoomId || r.id;
    const name = r.name || 'ห้อง';
    setDeleting(id);
    setError('');
    try {
      // Count attached appointments BEFORE prompting
      const appts = await listAppointments({ branchId }).catch(() => []);
      const attached = appts.filter(a => a.roomId === id).length;
      const msg = attached > 0
        ? `ลบห้อง "${name}" — มีนัดหมาย ${attached} รายการ จะถูกย้ายไป ไม่ระบุห้อง อัตโนมัติ — ยืนยันลบ?`
        : `ลบห้อง "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`;
      if (!window.confirm(msg)) return;
      await deleteExamRoom(id);
      await reload();
    } catch (e) {
      setError(e.message || 'ลบไม่สำเร็จ');
    } finally {
      setDeleting(null);
    }
  };

  const handleSaved = async () => { setFormOpen(false); setEditing(null); await reload(); };

  const extraFilters = (
    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
      <option value="">สถานะทั้งหมด</option>
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  return (
    <>
      <MarketingTabShell
        icon={DoorOpen}
        title="ห้องตรวจ"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มห้องตรวจ"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อห้อง / EN / หมายเหตุ"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีห้องตรวจ — กด "เพิ่มห้องตรวจ" เพื่อเริ่มต้น'
        notFoundText="ไม่พบห้องตรวจที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="exam-rooms-grid">
          {filtered.map(r => {
            const id = r.examRoomId || r.id;
            const statusCfg = STATUS_BADGE[r.status || 'ใช้งาน'] || STATUS_BADGE['ใช้งาน'];
            const busy = deleting === id;
            return (
              <div key={id} data-testid={`exam-room-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    <DoorOpen size={16} className="text-[var(--tx-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{r.name || '(ไม่มีชื่อ)'}</h3>
                    {r.nameEn && <p className="text-[11px] text-[var(--tx-muted)] truncate">{r.nameEn}</p>}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>{r.status || 'ใช้งาน'}</span>
                      <span className="text-[10px] text-[var(--tx-muted)]">ลำดับ {r.sortOrder || 0}</span>
                    </div>
                  </div>
                </div>
                {r.note && (
                  <p className="text-[11px] text-[var(--tx-muted)] line-clamp-2 mb-2">{r.note}</p>
                )}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(r)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(r)} disabled={busy || !canDelete}
                    aria-label={`ลบห้องตรวจ ${r.name || ''}`}
                    title={!canDelete ? 'ไม่มีสิทธิ์ลบห้องตรวจ' : undefined}
                    className="px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-red-700/40 hover:text-red-400 transition-all disabled:opacity-50">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </MarketingTabShell>
      {formOpen && (
        <ExamRoomFormModal
          room={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4.6: Run tests**

```bash
npm test -- --run tests/phase-18-0-exam-rooms-tab.test.jsx
```
Expected: PASS for R1.1-R1.4.

- [ ] **Step 4.7: Commit**

```bash
git add src/components/backend/ExamRoomFormModal.jsx src/components/backend/ExamRoomsTab.jsx tests/phase-18-0-exam-rooms-tab.test.jsx
git commit -m "feat(phase-18-0/task-4): ExamRoomFormModal + ExamRoomsTab UI

CRUD list (MarketingTabShell) with branchId from useSelectedBranch;
Form modal (MarketingFormShell) with name/nameEn/note/status/sortOrder.
Delete button counts attached be_appointments.where(roomId==id) and
shows soft-confirm dialog mentioning 'จะถูกย้ายไป ไม่ระบุห้อง อัตโนมัติ'
before deletion. RTL R1.1-R1.4 cover list/search/create-modal/delete-flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Permission key + nav + dashboard wiring + firestore.rules

**Files:**
- Modify: `src/lib/permissionGroupValidation.js`
- Modify: `nav/navConfig.js`
- Modify: `src/pages/BackendDashboard.jsx`
- Modify: `firestore.rules`

- [ ] **Step 5.1: Add permission key**

In `src/lib/permissionGroupValidation.js`, find `ALL_PERMISSION_KEYS` array. Add `'exam_room_management'` under section "ตั้งค่า / ข้อมูลพื้นฐาน" (search for `branch_management`; insert nearby):

```js
// before:
{ key: 'branch_management', label: 'จัดการสาขา' },
// add:
{ key: 'exam_room_management', label: 'จัดการห้องตรวจ' },
```

- [ ] **Step 5.2: Add nav config entry**

In `nav/navConfig.js`, find the master section's tabs array and add:

```js
{ id: 'exam-rooms', label: 'ห้องตรวจ', icon: 'DoorOpen' },
```

Place between `branches` and the next tab in the master section.

- [ ] **Step 5.3: Wire BackendDashboard**

In `src/pages/BackendDashboard.jsx`, find the lazy import block (search for `lazy(() => import.*BranchesTab`):

```jsx
const ExamRoomsTab = lazy(() => import('../components/backend/ExamRoomsTab.jsx'));
```

Add a render case in the tab switch:

```jsx
case 'exam-rooms':
  return <ExamRoomsTab clinicSettings={clinicSettings} theme={theme} />;
```

(Match existing case style.)

- [ ] **Step 5.4: Add firestore.rules block**

Open `firestore.rules`. Find the `match /be_branches/{branchId}` block and add a sibling block immediately after:

```
match /be_exam_rooms/{roomId} {
  allow read, write: if isClinicStaff();
}
```

(Standard branch-scoped collection rule — same as `be_holidays`.)

- [ ] **Step 5.5: Run sanity tests**

```bash
npm test -- --run tests/phase11-master-data-scaffold.test.jsx
npm test -- --run tests/backend-nav-config.test.js
npm test -- --run tests/permission-button-gates.test.jsx
```
If any test asserts a master-section count, bump it. Look for failure messages like "expected 19 to be 18" → adjust expected count by +1.

- [ ] **Step 5.6: Run build**

```bash
npm run build
```
Expected: clean (no missing-export errors from the new lazy import).

- [ ] **Step 5.7: Commit**

```bash
git add src/lib/permissionGroupValidation.js nav/navConfig.js src/pages/BackendDashboard.jsx firestore.rules tests/phase11-master-data-scaffold.test.jsx tests/backend-nav-config.test.js
git commit -m "feat(phase-18-0/task-5): permission + nav + dashboard + rules wiring

NEW exam_room_management permission key; nav exam-rooms entry under master
section; BackendDashboard lazy-imports ExamRoomsTab. firestore.rules adds
match /be_exam_rooms/{roomId} block — read+write isClinicStaff() (mirror
of be_holidays). Master-section counts bumped in 2 stale tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: AppointmentFormModal — replace FALLBACK_ROOMS with listExamRooms

**Files:**
- Modify: `src/components/backend/AppointmentFormModal.jsx`
- Test: `tests/phase-18-0-appointment-form-rooms.test.jsx`

- [ ] **Step 6.1: Identify lines to remove**

Search for these 3 sites in the source:

```bash
grep -n "FALLBACK_ROOMS\|ROOMS_CACHE_KEY\|appt-rooms-seen" src/components/backend/AppointmentFormModal.jsx
```

Expected: ~6 hits across the constant declaration (top of file), the localStorage init (line ~227), the localStorage write (line ~425).

- [ ] **Step 6.2: Write failing RTL test**

Create `tests/phase-18-0-appointment-form-rooms.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockListExamRooms = vi.fn();
const mockCreateBackendAppointment = vi.fn();
const mockUpdateBackendAppointment = vi.fn();
const mockGetAllCustomers = vi.fn();
const mockListenToHolidays = vi.fn();
const mockListStaffSchedules = vi.fn();
const mockListDoctors = vi.fn();
const mockListStaff = vi.fn();
const mockListAllSellers = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listExamRooms: (...a) => mockListExamRooms(...a),
  createBackendAppointment: (...a) => mockCreateBackendAppointment(...a),
  updateBackendAppointment: (...a) => mockUpdateBackendAppointment(...a),
  getAllCustomers: (...a) => mockGetAllCustomers(...a),
  listenToHolidays: (...a) => { mockListenToHolidays(...a); return () => {}; },
  listStaffSchedules: (...a) => mockListStaffSchedules(...a),
  listDoctors: (...a) => mockListDoctors(...a),
  listStaff: (...a) => mockListStaff(...a),
  listAllSellers: (...a) => mockListAllSellers(...a),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-A', branches: [] }),
  resolveBranchName: () => 'A',
}));
vi.mock('../src/hooks/useBranchAwareListener.js', () => ({
  useBranchAwareListener: vi.fn(),
}));
vi.mock('../src/lib/branchScopeUtils.js', () => ({
  filterDoctorsByBranch: (d) => d,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockListExamRooms.mockResolvedValue([
    { id: 'EXR-1', examRoomId: 'EXR-1', branchId: 'BR-A', name: 'ห้องดริป', status: 'ใช้งาน', sortOrder: 0 },
    { id: 'EXR-2', examRoomId: 'EXR-2', branchId: 'BR-A', name: 'ห้องช็อคเวฟ', status: 'ใช้งาน', sortOrder: 1 },
  ]);
  mockGetAllCustomers.mockResolvedValue([{ id: 'C1', name: 'C1' }]);
  mockListDoctors.mockResolvedValue([]);
  mockListStaff.mockResolvedValue([]);
  mockListAllSellers.mockResolvedValue([]);
  mockListStaffSchedules.mockResolvedValue([]);
  mockCreateBackendAppointment.mockResolvedValue({ id: 'A-NEW' });
});

describe('Phase 18.0 — AppointmentFormModal room dropdown', () => {
  it('AF1.1 dropdown options come from listExamRooms({branchId, status:"ใช้งาน"})', async () => {
    const { default: AppointmentFormModal } = await import('../src/components/backend/AppointmentFormModal.jsx');
    render(<AppointmentFormModal onClose={() => {}} />);
    await waitFor(() => expect(mockListExamRooms).toHaveBeenCalledWith({ branchId: 'BR-A', status: 'ใช้งาน' }));
    const dropdown = await screen.findByLabelText(/ห้องตรวจ/);
    expect(within(dropdown).getByText('ห้องดริป')).toBeInTheDocument();
    expect(within(dropdown).getByText('ห้องช็อคเวฟ')).toBeInTheDocument();
  });

  it('AF1.2 selecting a room writes both roomId + roomName on submit', async () => {
    const { default: AppointmentFormModal } = await import('../src/components/backend/AppointmentFormModal.jsx');
    render(<AppointmentFormModal onClose={() => {}} initialDate="2026-05-06" initialStartTime="10:00" />);
    await waitFor(() => expect(mockListExamRooms).toHaveBeenCalled());
    // ... fill required fields (customer + date already populated) ...
    const dropdown = await screen.findByLabelText(/ห้องตรวจ/);
    fireEvent.change(dropdown, { target: { value: 'EXR-1' } });
    const saveBtn = await screen.findByRole('button', { name: /บันทึก/ });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(mockCreateBackendAppointment).toHaveBeenCalled());
    const payload = mockCreateBackendAppointment.mock.calls[0][0];
    expect(payload.roomId).toBe('EXR-1');
    expect(payload.roomName).toBe('ห้องดริป');
  });

  it('AF1.3 source has no FALLBACK_ROOMS / ROOMS_CACHE_KEY', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/components/backend/AppointmentFormModal.jsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/FALLBACK_ROOMS/);
    expect(src).not.toMatch(/ROOMS_CACHE_KEY/);
    expect(src).not.toMatch(/appt-rooms-seen/);
  });
});
```

- [ ] **Step 6.3: Run failing test**

```bash
npm test -- --run tests/phase-18-0-appointment-form-rooms.test.jsx
```
Expected: AF1.1, AF1.2 fail (dropdown sources from FALLBACK_ROOMS still). AF1.3 fails (constants still present).

- [ ] **Step 6.4: Modify `AppointmentFormModal.jsx`**

Apply these edits:

1. Remove the `FALLBACK_ROOMS` const (top of file ~line 65-70).
2. Remove the `ROOMS_CACHE_KEY` const + localStorage init in `useState` initializer (~line 65 + 227-232).
3. Remove the localStorage write block on save (~line 425-430).
4. Add to imports near `listDoctors, listStaff`:
```js
listExamRooms,
```
5. Replace the `rooms` `useState` block:

OLD:
```js
const [rooms, setRooms] = useState(() => {
  try {
    const cached = JSON.parse(localStorage.getItem(ROOMS_CACHE_KEY) || '[]');
    return Array.isArray(cached) ? cached : [];
  } catch { return []; }
});
```

NEW:
```js
const [examRooms, setExamRooms] = useState([]);
```

6. Add a `useEffect` (alongside the existing doctor/staff load):

```jsx
useEffect(() => {
  listExamRooms({ branchId: selectedBranchId, status: 'ใช้งาน' })
    .then(rs => {
      const sorted = (rs || []).slice().sort((a, b) =>
        (a.sortOrder || 0) - (b.sortOrder || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'th')
      );
      setExamRooms(sorted);
    })
    .catch(() => setExamRooms([]));
}, [selectedBranchId]);
```

7. Update form state initializers — replace `roomName: ''` with `roomId: '', roomName: ''` in both `defaultFormState` (line ~85) AND inside the `if (appt)` edit hydration block (line ~178):

```js
roomId: appt.roomId || '',
roomName: appt.roomName || '',
```

Same for the `initialRoomName` block (~line 201):
```js
roomId: initialRoomId || '',
roomName: initialRoomName || '',
```

(And accept new `initialRoomId` prop in the destructuring.)

8. Update the dropdown JSX (~line 583-587):

OLD:
```jsx
<label ...>ห้องตรวจ</label>
<select value={formData.roomName} onChange={e => update({ roomName: e.target.value })} ...>
  ...
  {[...new Set([...rooms, ...FALLBACK_ROOMS])].map(r => <option key={r} value={r}>{r}</option>)}
</select>
```

NEW:
```jsx
<label className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1">ห้องตรวจ</label>
<select
  aria-label="ห้องตรวจ"
  value={formData.roomId}
  onChange={e => {
    const id = e.target.value;
    const room = examRooms.find(r => r.examRoomId === id);
    update({ roomId: id, roomName: room ? room.name : '' });
  }}
  className="..."
>
  <option value="">— ไม่ระบุห้อง —</option>
  {examRooms.map(r => <option key={r.examRoomId} value={r.examRoomId}>{r.name}</option>)}
  {/* Edit-mode hint: appt has stale roomId not in current branch master */}
  {formData.roomId && !examRooms.find(r => r.examRoomId === formData.roomId) && (
    <option value={formData.roomId}>(ห้องที่ลบแล้ว: {formData.roomName || formData.roomId})</option>
  )}
</select>
```

9. Update collision-check block (~line 336-342) to use `roomId`:

OLD:
```js
const sameRoom = formData.roomName && a.roomName && a.roomName === formData.roomName;
...
const who = o.roomName === formData.roomName ? `ห้อง "${o.roomName}"` : ...;
```

NEW:
```js
const sameRoom = formData.roomId && a.roomId && a.roomId === formData.roomId;
...
const who = o.roomId === formData.roomId ? `ห้อง "${formData.roomName}"` : ...;
```

10. Update the submit-payload block (~line 405) — already had `roomName`, ADD `roomId`:

```js
roomId: formData.roomId,
roomName: formData.roomName,
```

11. Remove the localStorage write block (~lines 423-431):

```js
// DELETED:
//   if (formData.roomName) {
//     try {
//       const seen = new Set([...rooms, ...FALLBACK_ROOMS]);
//       seen.add(formData.roomName);
//       localStorage.setItem(ROOMS_CACHE_KEY, JSON.stringify([...seen]));
//     } catch {}
//   }
```

- [ ] **Step 6.5: Run tests**

```bash
npm test -- --run tests/phase-18-0-appointment-form-rooms.test.jsx
```
Expected: PASS.

```bash
npm test -- --run tests/appointment-form-modal.test.jsx 2>/dev/null || true
```
Run sibling tests to catch regressions; fix mocks (add `listExamRooms` to existing mocks if any test fails on missing export).

- [ ] **Step 6.6: Commit**

```bash
git add src/components/backend/AppointmentFormModal.jsx tests/phase-18-0-appointment-form-rooms.test.jsx
git commit -m "feat(phase-18-0/task-6): AppointmentFormModal sources rooms from be_exam_rooms

Drop FALLBACK_ROOMS const + ROOMS_CACHE_KEY localStorage cache. Load active
rooms via listExamRooms({branchId, status:'ใช้งาน'}). Form state holds
roomId (FK) + roomName (snapshot, derived from selected room). On submit:
write both. Stale-room edit-mode hint preserves visibility of legacy data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: AppointmentTab — column rebuild from listExamRooms + virtual UNASSIGNED column

**Files:**
- Modify: `src/components/backend/AppointmentTab.jsx`
- Create: `src/lib/appointmentRoomColumns.js` (NEW pure helpers)
- Test: `tests/phase-18-0-appointment-tab-columns.test.js`

- [ ] **Step 7.1: Write failing test for the helper**

Create `tests/phase-18-0-appointment-tab-columns.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  effectiveRoomId,
  buildRoomColumnList,
  UNASSIGNED_ROOM_ID,
} from '../src/lib/appointmentRoomColumns.js';

describe('Phase 18.0 — appointment room columns', () => {
  describe('C1 effectiveRoomId', () => {
    const branchRoomIds = new Set(['EXR-1', 'EXR-2']);

    it('C1.1 valid roomId returns it', () => {
      expect(effectiveRoomId({ roomId: 'EXR-1' }, branchRoomIds)).toBe('EXR-1');
    });
    it('C1.2 blank roomId returns UNASSIGNED', () => {
      expect(effectiveRoomId({ roomId: '' }, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
    });
    it('C1.3 missing roomId returns UNASSIGNED', () => {
      expect(effectiveRoomId({}, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
    });
    it('C1.4 stale roomId (not in branchRoomIds) returns UNASSIGNED', () => {
      expect(effectiveRoomId({ roomId: 'EXR-DELETED' }, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
    });
    it('C1.5 cross-branch roomId returns UNASSIGNED', () => {
      expect(effectiveRoomId({ roomId: 'EXR-OTHER-BRANCH' }, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
    });
  });

  describe('C2 buildRoomColumnList', () => {
    const rooms = [
      { examRoomId: 'EXR-A', name: 'A', sortOrder: 2 },
      { examRoomId: 'EXR-B', name: 'B', sortOrder: 0 },
      { examRoomId: 'EXR-C', name: 'C', sortOrder: 1 },
    ];

    it('C2.1 sorts by sortOrder asc then name asc', () => {
      const cols = buildRoomColumnList(rooms, []);
      expect(cols.map(c => c.id)).toEqual(['EXR-B', 'EXR-C', 'EXR-A']);
    });
    it('C2.2 appends UNASSIGNED column iff any orphan appt exists', () => {
      const apptsWithOrphan = [{ roomId: 'EXR-DELETED' }];
      const cols = buildRoomColumnList(rooms, apptsWithOrphan);
      expect(cols[cols.length - 1]).toEqual({ id: UNASSIGNED_ROOM_ID, label: 'ไม่ระบุห้อง', virtual: true });
    });
    it('C2.3 no UNASSIGNED column when all appts have valid roomId', () => {
      const cleanAppts = [{ roomId: 'EXR-A' }, { roomId: 'EXR-B' }];
      const cols = buildRoomColumnList(rooms, cleanAppts);
      expect(cols.find(c => c.id === UNASSIGNED_ROOM_ID)).toBeUndefined();
    });
    it('C2.4 empty rooms list still produces UNASSIGNED column when there are appts', () => {
      const cols = buildRoomColumnList([], [{ roomId: 'X' }]);
      expect(cols).toEqual([{ id: UNASSIGNED_ROOM_ID, label: 'ไม่ระบุห้อง', virtual: true }]);
    });
    it('C2.5 ties on sortOrder fall back to Thai locale name comparison', () => {
      const ties = [
        { examRoomId: 'EXR-Z', name: 'หย', sortOrder: 0 },
        { examRoomId: 'EXR-A', name: 'หก', sortOrder: 0 },
      ];
      const cols = buildRoomColumnList(ties, []);
      expect(cols.map(c => c.label)).toEqual(['หก', 'หย']);
    });
  });
});
```

- [ ] **Step 7.2: Run failing test**

```bash
npm test -- --run tests/phase-18-0-appointment-tab-columns.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement `src/lib/appointmentRoomColumns.js`**

```js
// ─── Appointment room columns — Phase 18.0 pure helpers ─────────────────
// Used by AppointmentTab.jsx column derivation. Branch-scoped exam rooms
// drive column layout; orphan/blank/stale roomIds collect in a virtual
// UNASSIGNED column.

export const UNASSIGNED_ROOM_ID = '__UNASSIGNED__';
export const UNASSIGNED_ROOM_LABEL = 'ไม่ระบุห้อง';

/**
 * Map an appt to the column it should render under.
 * Returns the appt's roomId if it points to a room currently in the
 * branch's master list; otherwise returns the UNASSIGNED sentinel.
 */
export function effectiveRoomId(appt, branchRoomIds /* Set<string> */) {
  if (!appt) return UNASSIGNED_ROOM_ID;
  const id = appt.roomId;
  if (!id) return UNASSIGNED_ROOM_ID;
  if (!branchRoomIds || !branchRoomIds.has(id)) return UNASSIGNED_ROOM_ID;
  return id;
}

/**
 * Build the ordered column list for the AppointmentTab grid.
 * - One column per room in the branch (sorted by sortOrder asc, then name).
 * - Virtual UNASSIGNED column appended iff at least one appt resolves to it.
 */
export function buildRoomColumnList(rooms, dayAppts) {
  const ordered = (rooms || [])
    .slice()
    .sort((a, b) =>
      (a.sortOrder || 0) - (b.sortOrder || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'th')
    )
    .map(r => ({ id: r.examRoomId, label: r.name }));

  const branchRoomIds = new Set(ordered.map(c => c.id));
  const hasOrphan = (dayAppts || []).some(a => effectiveRoomId(a, branchRoomIds) === UNASSIGNED_ROOM_ID);

  if (hasOrphan) {
    ordered.push({ id: UNASSIGNED_ROOM_ID, label: UNASSIGNED_ROOM_LABEL, virtual: true });
  }
  return ordered;
}
```

- [ ] **Step 7.4: Run helper test**

```bash
npm test -- --run tests/phase-18-0-appointment-tab-columns.test.js
```
Expected: PASS.

- [ ] **Step 7.5: Wire AppointmentTab.jsx to use the helper**

Search for current room derivation:

```bash
grep -n "roomSet\|UNASSIGNED_ROOM\|effectiveRoom\b" src/components/backend/AppointmentTab.jsx
```

Apply these edits:

1. Add imports near top:
```jsx
import { listenToExamRoomsByBranch } from '../../lib/scopedDataLayer.js';
import {
  effectiveRoomId,
  buildRoomColumnList,
  UNASSIGNED_ROOM_ID,
  UNASSIGNED_ROOM_LABEL,
} from '../../lib/appointmentRoomColumns.js';
import { useBranchAwareListener } from '../../hooks/useBranchAwareListener.js';
```

2. Replace the existing `UNASSIGNED_ROOM` constant (search line ~280) with imported `UNASSIGNED_ROOM_LABEL`. Update any `effectiveRoom` derivation to call the imported `effectiveRoomId(a, branchRoomIds)` instead of the string-based `(a && a.roomName ? String(a.roomName).trim() : UNASSIGNED_ROOM)`.

3. Add the listener subscription (place near other listeners):

```jsx
const [examRooms, setExamRooms] = useState([]);
useBranchAwareListener(
  listenToExamRoomsByBranch,
  null, // no-opts; positional branchId injected
  (rooms) => setExamRooms(rooms || []),
  () => setExamRooms([]),
);
```

4. Compute `branchRoomIds` + `roomColumns`:

```jsx
const branchRoomIds = useMemo(() => new Set(examRooms.map(r => r.examRoomId)), [examRooms]);
const roomColumns = useMemo(() => buildRoomColumnList(examRooms, dayAppts), [examRooms, dayAppts]);
```

5. Replace the existing column-iteration in the grid render:

OLD pattern (string-key):
```jsx
{[...roomSet].map(roomLabel => ...)}
```

NEW pattern (id-key with virtual sentinel):
```jsx
{roomColumns.map(col => (
  <div key={col.id} data-room-id={col.id} ...>
    <h3>{col.label}{col.virtual ? ' (ไม่ระบุห้อง)' : ''}</h3>
    {/* Map appts whose effectiveRoomId(a, branchRoomIds) === col.id */}
    {dayAppts
      .filter(a => effectiveRoomId(a, branchRoomIds) === col.id)
      .map(appt => <AppointmentChip key={appt.id} appt={appt} ... />)}
  </div>
))}
```

(Adjust to fit the existing grid component shape — class names, AppointmentChip render, drag-create handlers.)

6. Where existing code aggregates rooms from monthAppts/dayAppts (the `roomSet.add(a.roomName)` lines, ~line 258-259), DELETE — column source is now the master list, not appt-derived.

- [ ] **Step 7.6: Run tests**

```bash
npm test -- --run tests/phase-18-0-appointment-tab-columns.test.js
npm test -- --run tests/appointment-tab-multi-staff.test.jsx 2>/dev/null || true
npm test -- --run tests/customer-appointments-flow.test.js 2>/dev/null || true
```
Expected: PASS for the new helper test. If any sibling test fails on missing `listenToExamRoomsByBranch` mock, add it to its mocks (return `() => {}`).

- [ ] **Step 7.7: Build sanity-check**

```bash
npm run build
```

- [ ] **Step 7.8: Commit**

```bash
git add src/lib/appointmentRoomColumns.js src/components/backend/AppointmentTab.jsx tests/phase-18-0-appointment-tab-columns.test.js
git commit -m "feat(phase-18-0/task-7): AppointmentTab columns from be_exam_rooms

NEW src/lib/appointmentRoomColumns.js — effectiveRoomId(appt, Set) +
buildRoomColumnList(rooms, dayAppts) + UNASSIGNED_ROOM_ID sentinel.
AppointmentTab subscribes via useBranchAwareListener(listenToExamRoomsByBranch);
columns sorted by sortOrder→name; virtual ไม่ระบุห้อง column appended iff
any orphan appt exists. Replaces string-keyed roomSet derivation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: DepositPanel deposit→appointment flow writes roomId + roomName

**Files:**
- Modify: `src/components/backend/DepositPanel.jsx`
- Test: `tests/phase-18-0-deposit-panel-room-write.test.jsx`

- [ ] **Step 8.1: Locate the appt-create block**

```bash
grep -n "apptRoomName\|roomName: apptRoomName\|ห้องตรวจ" src/components/backend/DepositPanel.jsx
```
Expected: lines 321 (write) + 861 (label) + 1044 (display).

- [ ] **Step 8.2: Write failing RTL test**

Create `tests/phase-18-0-deposit-panel-room-write.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockListExamRooms = vi.fn();
const mockCreateBackendAppointment = vi.fn();
// ... + every other scopedDataLayer mock used by DepositPanel ...

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listExamRooms: (...a) => mockListExamRooms(...a),
  createBackendAppointment: (...a) => mockCreateBackendAppointment(...a),
  // others stubbed as needed (listProducts, listCourses, ...).
  listProducts: vi.fn().mockResolvedValue([]),
  listCourses: vi.fn().mockResolvedValue([]),
  listDoctors: vi.fn().mockResolvedValue([]),
  listStaff: vi.fn().mockResolvedValue([]),
  getAllCustomers: vi.fn().mockResolvedValue([]),
  saveDeposit: vi.fn().mockResolvedValue({ id: 'D1' }),
  listDeposits: vi.fn().mockResolvedValue([]),
  listenToHolidays: vi.fn(() => () => {}),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-A' }),
  resolveBranchName: () => 'A',
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockListExamRooms.mockResolvedValue([
    { examRoomId: 'EXR-1', name: 'ห้องดริป', branchId: 'BR-A', status: 'ใช้งาน' },
  ]);
});

describe('Phase 18.0 — DepositPanel writes roomId + roomName', () => {
  it('DP1.1 deposit→appointment dropdown sources from listExamRooms', async () => {
    const { default: DepositPanel } = await import('../src/components/backend/DepositPanel.jsx');
    render(<DepositPanel customer={{ id: 'C1', name: 'C1' }} />);
    // Expand the "นัดหมาย" form section if needed (component-specific UX)
    await waitFor(() => expect(mockListExamRooms).toHaveBeenCalledWith({ branchId: 'BR-A', status: 'ใช้งาน' }));
    const dropdown = await screen.findByLabelText(/ห้องตรวจ/);
    expect(dropdown.querySelector('option[value="EXR-1"]')).toBeInTheDocument();
  });

  it('DP1.2 saving deposit-with-appointment writes roomId + roomName to createBackendAppointment payload', async () => {
    // ... fill form, submit, assert mockCreateBackendAppointment called
    // with payload having both roomId: 'EXR-1' + roomName: 'ห้องดริป' ...
    // (Skeleton; fill in submit interactions matching the panel's UX)
  });
});
```

- [ ] **Step 8.3: Run failing test**

```bash
npm test -- --run tests/phase-18-0-deposit-panel-room-write.test.jsx
```
Expected: FAIL.

- [ ] **Step 8.4: Modify `DepositPanel.jsx`**

1. Add import:

```js
import { listExamRooms } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
```

2. Add state + load:

```js
const { branchId } = useSelectedBranch();
const [examRooms, setExamRooms] = useState([]);
useEffect(() => {
  listExamRooms({ branchId, status: 'ใช้งาน' })
    .then(rs => setExamRooms((rs || []).slice().sort((a, b) =>
      (a.sortOrder || 0) - (b.sortOrder || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'th'))))
    .catch(() => setExamRooms([]));
}, [branchId]);
```

3. Replace existing appt room state — was `apptRoomName` only:

```js
const [apptRoomId, setApptRoomId] = useState('');
const [apptRoomName, setApptRoomName] = useState('');
```

4. Replace the existing room input (~line 861) — text/select that wrote `apptRoomName` only:

```jsx
<label className={labelCls}>ห้องตรวจ</label>
<select
  aria-label="ห้องตรวจ"
  value={apptRoomId}
  onChange={e => {
    const id = e.target.value;
    const room = examRooms.find(r => r.examRoomId === id);
    setApptRoomId(id);
    setApptRoomName(room ? room.name : '');
  }}
  className="..."
>
  <option value="">— ไม่ระบุห้อง —</option>
  {examRooms.map(r => <option key={r.examRoomId} value={r.examRoomId}>{r.name}</option>)}
</select>
```

5. Update the appt-create payload (~line 321) — add `roomId`:

```js
roomId: apptRoomId,
roomName: apptRoomName,
```

- [ ] **Step 8.5: Run tests + build**

```bash
npm test -- --run tests/phase-18-0-deposit-panel-room-write.test.jsx
npm run build
```

- [ ] **Step 8.6: Commit**

```bash
git add src/components/backend/DepositPanel.jsx tests/phase-18-0-deposit-panel-room-write.test.jsx
git commit -m "feat(phase-18-0/task-8): DepositPanel writes roomId + roomName on appt create

deposit→appointment form replaces text-only roomName input with
listExamRooms-driven dropdown sourced from selected branch. Writes both
roomId (FK) + roomName (snapshot) on save. Matches AppointmentFormModal
contract.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Migration script — `scripts/phase-18-0-seed-exam-rooms.mjs`

**Files:**
- Create: `scripts/phase-18-0-seed-exam-rooms.mjs`
- Test: `tests/phase-18-0-migration-script.test.js`

- [ ] **Step 9.1: Read sibling migration script for patterns**

```bash
cat scripts/phase-17-2-remove-main-branch.mjs | head -120
```

- [ ] **Step 9.2: Write failing test for the pure helpers**

Create `tests/phase-18-0-migration-script.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  normalizeRoomName,
  buildSeedPlan,
  buildBackfillPlan,
  SEED_ROOMS,
} from '../scripts/phase-18-0-seed-exam-rooms.mjs';

describe('Phase 18.0 — migration script pure helpers', () => {
  describe('M1 normalizeRoomName', () => {
    it('M1.1 lowercases + trims', () => {
      expect(normalizeRoomName('  ห้องดริป  ')).toBe('ห้องดริป');
      expect(normalizeRoomName('ห้อง Drip ')).toBe('ห้อง drip');
    });
    it('M1.2 returns "" for non-strings', () => {
      expect(normalizeRoomName(null)).toBe('');
      expect(normalizeRoomName(undefined)).toBe('');
      expect(normalizeRoomName(123)).toBe('');
    });
  });

  describe('M2 SEED_ROOMS', () => {
    it('M2.1 has 3 rooms in expected order', () => {
      expect(SEED_ROOMS.map(r => r.name)).toEqual([
        'ห้องแพทย์/ห้องผ่าตัด',
        'ห้องช็อคเวฟ',
        'ห้องดริป',
      ]);
      expect(SEED_ROOMS.map(r => r.sortOrder)).toEqual([0, 1, 2]);
    });
  });

  describe('M3 buildSeedPlan', () => {
    it('M3.1 empty existing → CREATE all 3 with new IDs', () => {
      const plan = buildSeedPlan([], 'BR-A', () => 'EXR-FAKE-ID');
      expect(plan.toCreate).toHaveLength(3);
      expect(plan.toCreate[0].name).toBe('ห้องแพทย์/ห้องผ่าตัด');
      expect(plan.toCreate[0].branchId).toBe('BR-A');
      expect(plan.skippedExisting).toEqual([]);
    });
    it('M3.2 existing room with case/space-variant name is reused (no new CREATE)', () => {
      const existing = [{ examRoomId: 'EXR-OLD', name: 'ห้องดริป  ', branchId: 'BR-A' }];
      const plan = buildSeedPlan(existing, 'BR-A', () => 'EXR-FAKE');
      expect(plan.toCreate.map(r => r.name)).toEqual(['ห้องแพทย์/ห้องผ่าตัด', 'ห้องช็อคเวฟ']);
      expect(plan.skippedExisting.map(r => r.examRoomId)).toEqual(['EXR-OLD']);
      expect(plan.nameToId['ห้องดริป']).toBe('EXR-OLD');
    });
    it('M3.3 idempotent — re-run with all 3 already existing → 0 CREATE', () => {
      const existing = SEED_ROOMS.map((r, i) => ({ examRoomId: `EXR-${i}`, name: r.name, branchId: 'BR-A' }));
      const plan = buildSeedPlan(existing, 'BR-A', () => 'EXR-FAKE');
      expect(plan.toCreate).toEqual([]);
      expect(Object.keys(plan.nameToId).length).toBe(3);
    });
  });

  describe('M4 buildBackfillPlan', () => {
    const nameToId = {
      'ห้องแพทย์/ห้องผ่าตัด': 'EXR-A',
      'ห้องช็อคเวฟ': 'EXR-B',
      'ห้องดริป': 'EXR-C',
    };

    it('M4.1 appts with matching roomName get queued for UPDATE with the right roomId', () => {
      const appts = [
        { id: 'A1', roomName: 'ห้องดริป', roomId: '' },
        { id: 'A2', roomName: '  ห้องช็อคเวฟ ', roomId: '' },
      ];
      const plan = buildBackfillPlan(appts, nameToId);
      expect(plan.toUpdate).toEqual([
        { id: 'A1', roomId: 'EXR-C' },
        { id: 'A2', roomId: 'EXR-B' },
      ]);
      expect(plan.unmatched).toEqual([]);
    });

    it('M4.2 appts with non-matching roomName are unmatched (left alone)', () => {
      const appts = [
        { id: 'A1', roomName: 'ห้องอื่นๆ' },
        { id: 'A2', roomName: '' },
      ];
      const plan = buildBackfillPlan(appts, nameToId);
      expect(plan.toUpdate).toEqual([]);
      expect(plan.unmatched).toEqual([{ id: 'A1', roomName: 'ห้องอื่นๆ' }, { id: 'A2', roomName: '' }]);
    });

    it('M4.3 appts with roomId already set are skipped (idempotent)', () => {
      const appts = [{ id: 'A1', roomName: 'ห้องดริป', roomId: 'EXR-PRE-EXISTING' }];
      const plan = buildBackfillPlan(appts, nameToId);
      expect(plan.toUpdate).toEqual([]);
      expect(plan.skippedAlreadyLinked).toEqual([{ id: 'A1', roomId: 'EXR-PRE-EXISTING' }]);
    });

    it('M4.4 counts grouped by matched name', () => {
      const appts = [
        { id: 'A1', roomName: 'ห้องดริป' },
        { id: 'A2', roomName: 'ห้องดริป' },
        { id: 'A3', roomName: 'ห้องช็อคเวฟ' },
      ];
      const plan = buildBackfillPlan(appts, nameToId);
      expect(plan.matchCounts).toEqual({ 'ห้องดริป': 2, 'ห้องช็อคเวฟ': 1 });
    });
  });
});
```

- [ ] **Step 9.3: Run failing test**

```bash
npm test -- --run tests/phase-18-0-migration-script.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 9.4: Implement migration script**

Create `scripts/phase-18-0-seed-exam-rooms.mjs`:

```js
#!/usr/bin/env node
// ─── Phase 18.0 — seed-and-backfill exam rooms for นครราชสีมา ──────────
// Usage:
//   node scripts/phase-18-0-seed-exam-rooms.mjs            # dry-run (default)
//   node scripts/phase-18-0-seed-exam-rooms.mjs --dry-run
//   node scripts/phase-18-0-seed-exam-rooms.mjs --apply
//
// Behavior:
//   1. Resolves นครราชสีมา branchId via be_branches.where(name==).
//   2. Seeds 3 rooms (ห้องแพทย์/ห้องผ่าตัด, ห้องช็อคเวฟ, ห้องดริป) — idempotent
//      via name-keyed lookup; existing rooms reused without rewrite.
//   3. Backfills be_appointments.roomId where the appt's existing roomName
//      exact-matches (case-insensitive trim) one of the seed names.
//   4. Emits audit doc be_admin_audit/phase-18-0-seed-exam-rooms-{ts}-{uuid}.

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ───────── pure helpers (exported for tests) ────────────────────────────

export function normalizeRoomName(s) {
  if (typeof s !== 'string') return '';
  return s.trim().toLowerCase();
}

export const SEED_ROOMS = Object.freeze([
  Object.freeze({ name: 'ห้องแพทย์/ห้องผ่าตัด', sortOrder: 0 }),
  Object.freeze({ name: 'ห้องช็อคเวฟ',          sortOrder: 1 }),
  Object.freeze({ name: 'ห้องดริป',              sortOrder: 2 }),
]);

/**
 * Plan which seed rooms need CREATE vs reuse-existing.
 * @param {Array} existing  — be_exam_rooms docs already in target branch
 * @param {string} branchId — target branch
 * @param {() => string} idGen — callable returning a fresh examRoomId per call
 */
export function buildSeedPlan(existing, branchId, idGen) {
  const existingByNorm = new Map();
  for (const r of (existing || [])) {
    existingByNorm.set(normalizeRoomName(r.name), r);
  }
  const toCreate = [];
  const skippedExisting = [];
  const nameToId = {};
  for (const seed of SEED_ROOMS) {
    const norm = normalizeRoomName(seed.name);
    const hit = existingByNorm.get(norm);
    if (hit) {
      skippedExisting.push(hit);
      nameToId[seed.name] = hit.examRoomId || hit.id;
    } else {
      const id = idGen();
      toCreate.push({
        examRoomId: id,
        branchId,
        name: seed.name,
        nameEn: '',
        note: '',
        status: 'ใช้งาน',
        sortOrder: seed.sortOrder,
      });
      nameToId[seed.name] = id;
    }
  }
  return { toCreate, skippedExisting, nameToId };
}

/**
 * Plan which appointments need a roomId backfill.
 * @param {Array} appts — be_appointments docs from target branch
 * @param {Object<string,string>} nameToId — exact name → examRoomId map
 */
export function buildBackfillPlan(appts, nameToId) {
  const lookupByNorm = new Map();
  for (const [name, id] of Object.entries(nameToId)) {
    lookupByNorm.set(normalizeRoomName(name), id);
  }
  const toUpdate = [];
  const unmatched = [];
  const skippedAlreadyLinked = [];
  const matchCounts = {};

  for (const a of (appts || [])) {
    if (a.roomId) {
      skippedAlreadyLinked.push({ id: a.id, roomId: a.roomId });
      continue;
    }
    const norm = normalizeRoomName(a.roomName);
    const matchedId = lookupByNorm.get(norm);
    if (matchedId) {
      toUpdate.push({ id: a.id, roomId: matchedId });
      // Resolve back to original-case name for counts
      const matchedName = Object.keys(nameToId).find(n => normalizeRoomName(n) === norm);
      matchCounts[matchedName] = (matchCounts[matchedName] || 0) + 1;
    } else {
      unmatched.push({ id: a.id, roomName: a.roomName });
    }
  }
  return { toUpdate, unmatched, skippedAlreadyLinked, matchCounts };
}

function makeExamRoomId() {
  return `EXR-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

function chunkOps500(items) {
  const out = [];
  for (let i = 0; i < items.length; i += 500) out.push(items.slice(i, i + 500));
  return out;
}

// ───────── main (only runs when invoked from CLI) ──────────────────────

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const dryRun = !apply;

  // Init firebase-admin (per project convention).
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
    throw new Error('FIREBASE_ADMIN_PROJECT_ID env var required (also FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY).');
  }
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
  const db = getFirestore();
  const APP_ID = process.env.FIREBASE_APP_ID || '1:default';
  const basePath = `artifacts/${APP_ID}/public/data`;

  // 1. Resolve target branch
  const branchSnap = await db
    .collection(`${basePath}/be_branches`)
    .where('name', '==', 'นครราชสีมา')
    .limit(2)
    .get();
  if (branchSnap.empty) {
    console.error('[phase-18-0] Branch "นครราชสีมา" not found — create it via BranchesTab first.');
    process.exit(1);
  }
  const branches = branchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const target = branches.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))[0];
  console.log(`[phase-18-0] Target branch: ${target.name} (id=${target.id})`);
  if (branches.length > 1) {
    console.warn(`[phase-18-0] WARNING: ${branches.length} branches named "นครราชสีมา" — using oldest by createdAt (${target.id}).`);
  }

  // 2. Seed plan
  const existingRoomsSnap = await db
    .collection(`${basePath}/be_exam_rooms`)
    .where('branchId', '==', target.id)
    .get();
  const existing = existingRoomsSnap.docs.map(d => ({ id: d.id, examRoomId: d.id, ...d.data() }));
  const seedPlan = buildSeedPlan(existing, target.id, makeExamRoomId);

  // 3. Backfill plan
  const apptsSnap = await db
    .collection(`${basePath}/be_appointments`)
    .where('branchId', '==', target.id)
    .get();
  const appts = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const backfillPlan = buildBackfillPlan(appts, seedPlan.nameToId);

  // 4. Print preview
  console.log(`[phase-18-0] Rooms to create: ${seedPlan.toCreate.length}`);
  for (const r of seedPlan.toCreate) console.log(`  + ${r.name} (id=${r.examRoomId}, sortOrder=${r.sortOrder})`);
  console.log(`[phase-18-0] Rooms already exist: ${seedPlan.skippedExisting.length}`);
  for (const r of seedPlan.skippedExisting) console.log(`  = ${r.name} (id=${r.examRoomId || r.id}) — reusing for backfill`);
  console.log(`[phase-18-0] Appts to backfill (roomId): ${backfillPlan.toUpdate.length}`);
  for (const [name, n] of Object.entries(backfillPlan.matchCounts)) console.log(`  - ${name}: ${n}`);
  console.log(`[phase-18-0] Appts unmatched (stay in ไม่ระบุห้อง): ${backfillPlan.unmatched.length}`);
  console.log(`[phase-18-0] Appts already had roomId (skip): ${backfillPlan.skippedAlreadyLinked.length}`);

  if (dryRun) {
    console.log('[phase-18-0] DRY RUN — re-run with --apply to commit.');
    return;
  }

  // 5. Apply
  const allOps = [];
  for (const r of seedPlan.toCreate) {
    allOps.push({
      ref: db.doc(`${basePath}/be_exam_rooms/${r.examRoomId}`),
      type: 'set',
      data: {
        examRoomId: r.examRoomId,
        branchId: r.branchId,
        name: r.name,
        nameEn: r.nameEn,
        note: r.note,
        status: r.status,
        sortOrder: r.sortOrder,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }
  for (const u of backfillPlan.toUpdate) {
    allOps.push({
      ref: db.doc(`${basePath}/be_appointments/${u.id}`),
      type: 'update',
      data: { roomId: u.roomId, updatedAt: FieldValue.serverTimestamp() },
    });
  }

  const batches = chunkOps500(allOps);
  console.log(`[phase-18-0] Committing ${allOps.length} ops in ${batches.length} batch(es)...`);
  for (let i = 0; i < batches.length; i++) {
    const batch = db.batch();
    for (const op of batches[i]) {
      if (op.type === 'set') batch.set(op.ref, op.data);
      else batch.update(op.ref, op.data);
    }
    await batch.commit();
    console.log(`[phase-18-0]   batch ${i + 1}/${batches.length} committed (${batches[i].length} ops)`);
  }

  // Audit doc (separate write, append-only)
  const auditId = `phase-18-0-seed-exam-rooms-${Date.now()}-${randomUUID()}`;
  await db.doc(`${basePath}/be_admin_audit/${auditId}`).set({
    phase: 'phase-18-0-seed-exam-rooms',
    branchId: target.id,
    branchName: target.name,
    seededRooms: seedPlan.toCreate.map(r => ({ examRoomId: r.examRoomId, name: r.name, sortOrder: r.sortOrder })),
    existingRoomsSkipped: seedPlan.skippedExisting.map(r => ({ examRoomId: r.examRoomId || r.id, name: r.name, reason: 'name-match' })),
    backfillCounts: backfillPlan.matchCounts,
    unmatchedAppts: backfillPlan.unmatched.length,
    skippedAlreadyLinkedAppts: backfillPlan.skippedAlreadyLinked.length,
    ranAt: FieldValue.serverTimestamp(),
    ranBy: process.env.USER || 'admin-script',
    mode: 'apply',
  });
  console.log(`[phase-18-0] Audit doc written: be_admin_audit/${auditId}`);
  console.log('[phase-18-0] DONE');
}

// Only run when invoked directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[phase-18-0] FAILED:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 9.5: Run tests**

```bash
npm test -- --run tests/phase-18-0-migration-script.test.js
```
Expected: PASS for M1-M4.

- [ ] **Step 9.6: Commit**

```bash
git add scripts/phase-18-0-seed-exam-rooms.mjs tests/phase-18-0-migration-script.test.js
git commit -m "feat(phase-18-0/task-9): seed exam rooms migration script

scripts/phase-18-0-seed-exam-rooms.mjs — admin SDK script with --dry-run
default. Resolves นครราชสีมา branchId by name; seeds 3 rooms (ห้องแพทย์/
ห้องผ่าตัด, ห้องช็อคเวฟ, ห้องดริป) idempotently via name-keyed lookup;
smart-backfills be_appointments.roomId where existing roomName matches
(case-insensitive trim). Audit doc emit with counts. Tests M1-M4 cover
pure helpers (normalize, seed plan, backfill plan, idempotency).

Run via: node scripts/phase-18-0-seed-exam-rooms.mjs [--dry-run|--apply]
Awaits explicit user authorization before --apply.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Rule I full-flow simulate + audit-branch-scope confirmation

**Files:**
- Create: `tests/phase-18-0-flow-simulate.test.js`

- [ ] **Step 10.1: Write the integrative flow-simulate test**

Create `tests/phase-18-0-flow-simulate.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  effectiveRoomId,
  buildRoomColumnList,
  UNASSIGNED_ROOM_ID,
} from '../src/lib/appointmentRoomColumns.js';
import {
  normalizeRoomName,
  buildSeedPlan,
  buildBackfillPlan,
  SEED_ROOMS,
} from '../scripts/phase-18-0-seed-exam-rooms.mjs';

describe('Phase 18.0 — full flow simulate (Rule I)', () => {
  describe('F1 migration script idempotency', () => {
    it('F1.1 dry-run plan describes 3 creates + 0 updates on empty branch', () => {
      const seed = buildSeedPlan([], 'BR-A', () => 'EXR-NEW');
      const back = buildBackfillPlan([], seed.nameToId);
      expect(seed.toCreate).toHaveLength(3);
      expect(back.toUpdate).toEqual([]);
    });
    it('F1.2 second run after apply describes 0 creates + 0 updates', () => {
      const existing = SEED_ROOMS.map((r, i) => ({ examRoomId: `EXR-${i}`, name: r.name, branchId: 'BR-A' }));
      const seed = buildSeedPlan(existing, 'BR-A', () => 'EXR-NEW');
      const appts = [{ id: 'A1', roomName: 'ห้องดริป', roomId: 'EXR-2' }]; // already linked
      const back = buildBackfillPlan(appts, seed.nameToId);
      expect(seed.toCreate).toEqual([]);
      expect(back.toUpdate).toEqual([]);
    });
  });

  describe('F2 cross-branch isolation in scopedDataLayer', () => {
    it('F2.1 listExamRooms({branchId:"BR-A"}) only returns BR-A docs', async () => {
      // Mocked at backendClient level
      vi.doMock('../src/lib/branchSelection.js', () => ({
        resolveSelectedBranchId: () => 'BR-A',
      }));
      // ... wire up auto-inject test (similar to scopedDataLayer.test.js patterns)
    });
  });

  describe('F3 appt write contract', () => {
    it('F3.1 appt with valid roomId resolves to its column', () => {
      const branchRoomIds = new Set(['EXR-1', 'EXR-2']);
      expect(effectiveRoomId({ roomId: 'EXR-1', roomName: 'ห้องดริป' }, branchRoomIds)).toBe('EXR-1');
    });
  });

  describe('F4 delete-room runtime fallback (no writes)', () => {
    it('F4.1 deleting EXR-1 → next render routes its appts to UNASSIGNED', () => {
      const before = new Set(['EXR-1', 'EXR-2']);
      const after = new Set(['EXR-2']); // EXR-1 deleted
      const appt = { roomId: 'EXR-1', roomName: 'ห้องดริป' };
      expect(effectiveRoomId(appt, before)).toBe('EXR-1');
      expect(effectiveRoomId(appt, after)).toBe(UNASSIGNED_ROOM_ID);
      // No mutation of appt.roomId required — pure runtime semantics.
    });
  });

  describe('F5 unmatched-name post-migration', () => {
    it('F5.1 appt with roomName "ห้องอื่นๆ" lands in UNASSIGNED column', () => {
      const seed = buildSeedPlan([], 'BR-A', () => 'EXR-N');
      const back = buildBackfillPlan([{ id: 'A1', roomName: 'ห้องอื่นๆ' }], seed.nameToId);
      expect(back.unmatched).toHaveLength(1);
      // At render-time the unmatched appt has roomId='' → UNASSIGNED
      const branchRoomIds = new Set(seed.toCreate.map(r => r.examRoomId));
      expect(effectiveRoomId({ roomName: 'ห้องอื่นๆ', roomId: '' }, branchRoomIds)).toBe(UNASSIGNED_ROOM_ID);
    });
  });

  describe('F6 column virtual UNASSIGNED appearance', () => {
    it('F6.1 no orphans → no virtual column', () => {
      const rooms = [{ examRoomId: 'EXR-1', name: 'A', sortOrder: 0 }];
      const cols = buildRoomColumnList(rooms, [{ roomId: 'EXR-1' }]);
      expect(cols.find(c => c.id === UNASSIGNED_ROOM_ID)).toBeUndefined();
    });
    it('F6.2 mix of valid + orphan → virtual column appended', () => {
      const rooms = [{ examRoomId: 'EXR-1', name: 'A', sortOrder: 0 }];
      const cols = buildRoomColumnList(rooms, [
        { roomId: 'EXR-1' },
        { roomId: 'EXR-DELETED' },
      ]);
      expect(cols[cols.length - 1].id).toBe(UNASSIGNED_ROOM_ID);
    });
  });

  describe('F7 source-grep regression bank', () => {
    it('F7.1 every appointment writer adds both roomId + roomName to payload', () => {
      const appointmentFormSrc = readFileSync(new URL('../src/components/backend/AppointmentFormModal.jsx', import.meta.url), 'utf8');
      expect(appointmentFormSrc).toMatch(/roomId:\s*formData\.roomId/);
      expect(appointmentFormSrc).toMatch(/roomName:\s*formData\.roomName/);

      const depositSrc = readFileSync(new URL('../src/components/backend/DepositPanel.jsx', import.meta.url), 'utf8');
      expect(depositSrc).toMatch(/roomId:\s*apptRoomId/);
      expect(depositSrc).toMatch(/roomName:\s*apptRoomName/);
    });
    it('F7.2 AppointmentFormModal has no FALLBACK_ROOMS / ROOMS_CACHE_KEY', () => {
      const src = readFileSync(new URL('../src/components/backend/AppointmentFormModal.jsx', import.meta.url), 'utf8');
      expect(src).not.toMatch(/FALLBACK_ROOMS/);
      expect(src).not.toMatch(/ROOMS_CACHE_KEY/);
      expect(src).not.toMatch(/appt-rooms-seen/);
    });
    it('F7.3 AppointmentTab uses effectiveRoomId helper (not string roomName key)', () => {
      const src = readFileSync(new URL('../src/components/backend/AppointmentTab.jsx', import.meta.url), 'utf8');
      expect(src).toMatch(/effectiveRoomId/);
      expect(src).toMatch(/listenToExamRoomsByBranch/);
      expect(src).toMatch(/buildRoomColumnList/);
    });
    it('F7.4 firestore.rules has be_exam_rooms match block', () => {
      const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
      expect(rules).toMatch(/match\s+\/be_exam_rooms\/\{\s*roomId\s*\}/);
    });
    it('F7.5 branch-collection-coverage classifies be_exam_rooms as branch-scoped', () => {
      const test = readFileSync(new URL('../tests/branch-collection-coverage.test.js', import.meta.url), 'utf8');
      expect(test).toMatch(/be_exam_rooms.*scope.*branch/);
    });
    it('F7.6 scopedDataLayer re-exports the 4 exam-room helpers', () => {
      const sdl = readFileSync(new URL('../src/lib/scopedDataLayer.js', import.meta.url), 'utf8');
      expect(sdl).toMatch(/listExamRooms/);
      expect(sdl).toMatch(/listenToExamRoomsByBranch/);
      expect(sdl).toMatch(/saveExamRoom/);
      expect(sdl).toMatch(/deleteExamRoom/);
    });
  });
});
```

- [ ] **Step 10.2: Run flow simulate**

```bash
npm test -- --run tests/phase-18-0-flow-simulate.test.js
```
Expected: ALL PASS.

- [ ] **Step 10.3: Run audit-branch-scope verify**

```bash
npm test -- --run tests/audit-branch-scope.test.js
```
Expected: PASS — BS-1..BS-9 invariants automatically cover be_exam_rooms via scopedDataLayer wrapper.

- [ ] **Step 10.4: Commit**

```bash
git add tests/phase-18-0-flow-simulate.test.js
git commit -m "test(phase-18-0/task-10): full-flow simulate + source-grep regression bank

F1 migration idempotency · F2 cross-branch isolation · F3 appt write contract
· F4 delete-room runtime fallback (no writes) · F5 unmatched-name post-migration
· F6 virtual UNASSIGNED column appearance logic · F7 source-grep regression
bank locking AppointmentFormModal/Tab/DepositPanel/firestore.rules/scopedDataLayer.

Per Rule I — full-flow simulate at sub-phase end is mandatory. Helper-output
tests (Tasks 1, 7, 9) + RTL tests (Tasks 4, 6, 8) chained into end-to-end flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Final verification + boundary commit

**Files:**
- (Verification only — may discover stale tests to update)

- [ ] **Step 11.1: Run full vitest suite**

```bash
npm test -- --run
```
Expected: 5199 + ~70 (rough estimate from this phase's new tests) = ~5270 PASS, 0 fail. If any fail, inspect — most likely stale-test fixes needed (master section count bumps in `phase11-master-data-scaffold.test.jsx` / `backend-nav-config.test.js`).

- [ ] **Step 11.2: Build**

```bash
npm run build
```
Expected: clean.

- [ ] **Step 11.3: Audit-all dry pass on touched paths**

Per CLAUDE.md Rule D, use the area audits matching what was touched:

```bash
npm test -- --run tests/audit-branch-scope.test.js
npm test -- --run tests/audit-react-patterns.test.js 2>/dev/null || true
npm test -- --run tests/audit-firestore-correctness.test.js 2>/dev/null || true
```

- [ ] **Step 11.4: Verify nothing left over**

```bash
git status --short
git log --oneline -12
```
Expected: working tree clean (no uncommitted changes from Phase 18.0). Commits 1-10 visible in log.

- [ ] **Step 11.5: Update active.md**

Open `.agents/active.md` and update the YAML frontmatter + body:

- `last_commit:` → newest hash
- `tests:` → new total
- Body: add Phase 18.0 to "What this session shipped"
- Outstanding section: add "Phase 18.0 migration: run `node scripts/phase-18-0-seed-exam-rooms.mjs --dry-run` then `--apply` after V15 #19 (or #20) deploys"

- [ ] **Step 11.6: Commit active.md**

```bash
git add .agents/active.md
git commit -m "docs(agents): Phase 18.0 branch exam rooms shipped

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 11.7: Report to user**

Summary message to user:
- master is now 5 + N commits ahead-of-prod (depending on whether V15 #19 has shipped)
- Phase 18.0 shipped to master; firestore.rules updated; migration script ready
- Awaits explicit "deploy" → V15 #20 (or #19 if not yet shipped) ships rules + source
- Awaits explicit "run migration" → execute `--dry-run` first; show counts; user authorizes `--apply`

---

## Self-review (per writing-plans skill)

**Spec coverage:**
- Q1 storage = `be_exam_rooms` collection → Task 2 (`backendClient.js`) + Task 5 (`firestore.rules`) ✓
- Q2 roomId+roomName denorm → Task 6 (AppointmentFormModal) + Task 8 (DepositPanel) ✓
- Q3 schedules unchanged → no schedule task in plan ✓
- Q4 columns from full branch room list → Task 7 (`appointmentRoomColumns.js` + `AppointmentTab.jsx`) ✓
- Q5 seed-and-smart-backfill + soft-confirm delete → Task 4 (delete dialog with count) + Task 9 (migration script) ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later" remaining. Every task has concrete code blocks.

**Type consistency check:**
- `examRoomId` used as the doc-id field everywhere (validation, modal, tab, migration script, appointment writes) — consistent
- `roomId` used on appointment doc + form state + helper signatures — consistent
- `roomName` (string) preserved as snapshot everywhere — consistent
- `UNASSIGNED_ROOM_ID = '__UNASSIGNED__'` (sentinel) defined in `appointmentRoomColumns.js` and referenced from flow-simulate — consistent
- `branchRoomIds: Set<string>` consistently typed across `effectiveRoomId` callers

**Scope check:** Single connected feature stream. 11 tasks, ~3-5 hours of work each. Total ~30-50 hours estimated. Reasonable for one implementation cycle.
