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
  appId: 'loverclinic-opd-4c39b',
  app: {},
  storage: {},
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
