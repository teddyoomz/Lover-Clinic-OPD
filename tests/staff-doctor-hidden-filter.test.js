import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase imports — listStaff/listDoctors fetch via getDocs(...).
// We replace the underlying Firestore snap with a stub that returns
// the docs array we control, then assert the filter behavior at the
// public function boundary.
// H2 tests additionally mock getDoc + setDoc to verify audit-stamp logic.

const mockGetDocs = vi.fn();
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

vi.mock('../src/firebase.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-admin-uid' } },
  appId: 'loverclinic-opd-4c39b',
  app: {},
  storage: {},
}));

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

// Import AFTER mocks
const { listStaff, listDoctors, saveStaff, saveDoctor } = await import('../src/lib/backendClient.js');

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

// ─── H2 tests — saveStaff / saveDoctor audit-stamp on isHidden transition ────

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
