import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDocs = vi.fn();
const mockQuery = vi.fn((...args) => ({ __mocked: true, args }));
const mockWhere = vi.fn((field, op, val) => ({ field, op, val }));
const mockCollection = vi.fn();
vi.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  getDocs: (...args) => mockGetDocs(...args),
  documentId: () => '__name__',
  Timestamp: { fromDate: (d) => ({ __ts: d.getTime() }) },
}));

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

vi.mock('../src/lib/branchSelection.js', () => ({
  resolveSelectedBranchId: () => 'BR-A',
}));

import { getAppointmentsByDateRange } from '../src/lib/backendClient.js';

describe('V64.B1 getAppointmentsByDateRange — branch-scope safe-by-default (V54 BS-13 mirror)', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
    mockWhere.mockClear();
    mockGetDocs.mockResolvedValue({ docs: [] });
  });

  it('B1.1 explicit branchId is honored', async () => {
    await getAppointmentsByDateRange({ from: '2026-05-01', to: '2026-05-31', branchId: 'BR-X' });
    expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-X');
    expect(mockWhere).toHaveBeenCalledWith('date', '>=', '2026-05-01');
    expect(mockWhere).toHaveBeenCalledWith('date', '<=', '2026-05-31');
  });

  it('B1.2 falsy branchId resolves via resolveSelectedBranchId', async () => {
    await getAppointmentsByDateRange({ from: '2026-05-01', to: '2026-05-31' });
    expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
  });

  it('B1.3 allBranches:true skips branchId filter', async () => {
    await getAppointmentsByDateRange({ from: '2026-05-01', to: '2026-05-31', allBranches: true });
    const branchClauses = mockWhere.mock.calls.filter(c => c[0] === 'branchId');
    expect(branchClauses).toHaveLength(0);
  });

  it('B1.4 returns array of {id, ...data} from snapshot', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'A1', data: () => ({ date: '2026-05-09', status: 'pending' }) },
        { id: 'A2', data: () => ({ date: '2026-05-10', status: 'confirmed' }) },
      ],
    });
    const out = await getAppointmentsByDateRange({ from: '2026-05-01', to: '2026-05-31', branchId: 'BR-X' });
    expect(out).toEqual([
      { id: 'A1', date: '2026-05-09', status: 'pending' },
      { id: 'A2', date: '2026-05-10', status: 'confirmed' },
    ]);
  });

  it('B1.5 missing from/to → throws', async () => {
    await expect(getAppointmentsByDateRange({ branchId: 'BR-X' })).rejects.toThrow(/from.*to/i);
  });

  it('B1.6 source-grep — function name + V54 marker comment present', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+getAppointmentsByDateRange/);
    expect(src).toMatch(/V54.*BS-13|safe-by-default/i);
  });
});
