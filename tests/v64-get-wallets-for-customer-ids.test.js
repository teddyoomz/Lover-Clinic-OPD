import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDocs = vi.fn();
const mockQuery = vi.fn((...args) => ({ args }));
const mockWhere = vi.fn((field, op, val) => ({ field, op, val }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  getDocs: (...args) => mockGetDocs(...args),
  documentId: () => '__name__',
}));
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

import { getWalletsForCustomerIds } from '../src/lib/backendClient.js';

describe('V64.W1 getWalletsForCustomerIds — bulk fetch via in-query (≤30 chunks)', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
    mockWhere.mockClear();
  });

  it('W1.1 empty array returns empty array (no Firestore call)', async () => {
    const out = await getWalletsForCustomerIds([]);
    expect(out).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('W1.2 single customerId → one in-query chunk', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 'C1', data: () => ({ balance: 100 }) }],
    });
    const out = await getWalletsForCustomerIds(['C1']);
    expect(out).toEqual([{ id: 'C1', balance: 100 }]);
    expect(mockWhere).toHaveBeenCalledWith('__name__', 'in', ['C1']);
  });

  it('W1.3 31 customerIds → 2 chunks (30 + 1)', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `C${i}`);
    mockGetDocs.mockResolvedValue({ docs: [] });
    await getWalletsForCustomerIds(ids);
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    const chunk1 = mockWhere.mock.calls.find(c => c[2] && c[2].length === 30);
    const chunk2 = mockWhere.mock.calls.find(c => c[2] && c[2].length === 1);
    expect(chunk1).toBeTruthy();
    expect(chunk2).toBeTruthy();
  });

  it('W1.4 chunks are flattened to a single output array', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `C${i}`);
    mockGetDocs
      .mockResolvedValueOnce({ docs: ids.slice(0, 30).map(id => ({ id, data: () => ({ balance: 1 }) })) })
      .mockResolvedValueOnce({ docs: [{ id: 'C30', data: () => ({ balance: 2 }) }] });
    const out = await getWalletsForCustomerIds(ids);
    expect(out).toHaveLength(31);
  });

  it('W1.5 deduplicates input customerIds before chunking', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    await getWalletsForCustomerIds(['C1', 'C1', 'C2']);
    const inClause = mockWhere.mock.calls.find(c => c[1] === 'in');
    expect(inClause[2]).toEqual(expect.arrayContaining(['C1', 'C2']));
    expect(inClause[2]).toHaveLength(2);
  });

  it('W1.6 source-grep — function exported + V64 marker', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+getWalletsForCustomerIds/);
    expect(src).toMatch(/V64/);
  });
});
