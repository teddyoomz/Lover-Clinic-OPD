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

  it('B1.1 explicit branchId honored — server-side filter ONLY by branchId (V64-fix mirrors getAppointmentsByMonth)', async () => {
    await getAppointmentsByDateRange({ from: '2026-05-01', to: '2026-05-31', branchId: 'BR-X' });
    expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-X');
    // V64-fix (root-cause 2026-05-09): date range NOT filtered server-side
    // — composite (branchId + date) index isn't deployed; we filter date
    // client-side via normalizeApptDate (mirrors getAppointmentsByDate +
    // getAppointmentsByMonth canonical pattern).
    const dateWhereClauses = mockWhere.mock.calls.filter(c => c[0] === 'date');
    expect(dateWhereClauses).toHaveLength(0);
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

  it('B1.4 returns array of {...data, id} from snapshot — in-range rows pass', async () => {
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

  it('B1.4b client-side date-range filter drops out-of-range rows (V64-fix)', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'A1', data: () => ({ date: '2026-04-15', status: 'pending' }) },  // out: before
        { id: 'A2', data: () => ({ date: '2026-05-08', status: 'pending' }) },  // out: lower bound exclusive of 2026-05-09
        { id: 'A3', data: () => ({ date: '2026-05-09', status: 'pending' }) },  // in
        { id: 'A4', data: () => ({ date: '2026-05-15', status: 'confirmed' }) }, // in
        { id: 'A5', data: () => ({ date: '2026-06-01', status: 'pending' }) },  // out: after
      ],
    });
    const out = await getAppointmentsByDateRange({ from: '2026-05-09', to: '2026-05-15', branchId: 'BR-X' });
    expect(out.map(a => a.id)).toEqual(['A3', 'A4']);
  });

  it('B1.4c heterogeneous date shapes normalized via normalizeApptDate (V64-fix)', async () => {
    // Real prod data may carry date as plain string OR ISO with time.
    // Client-side normalizeApptDate produces plain YYYY-MM-DD for both.
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'A1', data: () => ({ date: '2026-05-09', status: 'pending' }) },
        { id: 'A2', data: () => ({ date: '2026-05-09T00:00:00.000Z', status: 'confirmed' }) },
        { id: 'A3', data: () => ({ date: 'not-a-date', status: 'pending' }) },  // dropped
      ],
    });
    const out = await getAppointmentsByDateRange({ from: '2026-05-09', to: '2026-05-09', branchId: 'BR-X' });
    expect(out.length).toBeGreaterThanOrEqual(1);
    // All rows in output have date field equal to '2026-05-09' (normalized)
    expect(out.every(a => a.date === '2026-05-09')).toBe(true);
    expect(out.find(a => a.id === 'A3')).toBeUndefined();
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

  it('B1.7 V64-fix regression-guard — function body MUST NOT use server-side date where (composite-index avoidance)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf8');
    const start = src.indexOf('export async function getAppointmentsByDateRange(');
    expect(start).toBeGreaterThan(0);
    const slice = src.slice(start, start + 2000);
    // Forbidden: server-side date predicate (would require composite index)
    expect(slice).not.toMatch(/where\s*\(\s*['"]date['"]\s*,\s*['"]>=['"]/);
    expect(slice).not.toMatch(/where\s*\(\s*['"]date['"]\s*,\s*['"]<=['"]/);
    // Required: client-side filter via normalizeApptDate
    expect(slice).toMatch(/normalizeApptDate/);
    expect(slice).toMatch(/V64-fix/);
  });
});
