// V33-customer-create — HN counter pure-helper tests.
// Verifies the format `LC-YY{0000NNN}` + the year-prefix-rollover semantics
// without hitting Firestore (transaction shape is mocked).

import { describe, it, expect, vi, beforeEach } from 'vitest';

let counterDocRef = null;
let counterStore = null;
let mockTxGet = null;
let mockTxSet = null;
let runTxCalls = 0;
let nowYear = 2026;

vi.mock('../src/firebase.js', () => ({
  db: { __mock: true },
  appId: 'test-app',
}));

vi.mock('firebase/firestore', () => ({
  doc: (db, ...path) => ({ __doc: path.join('/') }),
  collection: (db, ...path) => ({ __col: path.join('/') }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) })),
  runTransaction: vi.fn(async (db, fn) => {
    runTxCalls += 1;
    return fn({ get: mockTxGet, set: mockTxSet });
  }),
  onSnapshot: vi.fn(),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  counterStore = null;
  runTxCalls = 0;
  nowYear = 2026;  // RESET — K4 mutates this
  mockTxGet = vi.fn(async (ref) => {
    counterDocRef = ref;
    if (counterStore == null) return { exists: () => false, data: () => undefined };
    return { exists: () => true, data: () => counterStore };
  });
  mockTxSet = vi.fn((ref, data) => {
    counterStore = data;
  });
  vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(nowYear);
});

describe('V33.K — generateCustomerHN format', () => {
  it('K1 — first call returns LC-26000001', async () => {
    const { generateCustomerHN } = await import('../src/lib/backendClient.js');
    const hn = await generateCustomerHN();
    expect(hn).toBe('LC-26000001');
  });
  it('K2 — second call (same year) increments to LC-26000002', async () => {
    const { generateCustomerHN } = await import('../src/lib/backendClient.js');
    await generateCustomerHN();
    const hn2 = await generateCustomerHN();
    expect(hn2).toBe('LC-26000002');
  });
  it('K3 — counter doc shape', async () => {
    const { generateCustomerHN } = await import('../src/lib/backendClient.js');
    await generateCustomerHN();
    expect(counterStore).toMatchObject({ year: '26', seq: 1 });
    expect(typeof counterStore.updatedAt).toBe('string');
  });
  it('K4 — year change resets sequence', async () => {
    const { generateCustomerHN } = await import('../src/lib/backendClient.js');
    await generateCustomerHN();   // LC-26000001
    await generateCustomerHN();   // LC-26000002
    nowYear = 2027;
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(nowYear);
    const hn = await generateCustomerHN();
    expect(hn).toBe('LC-27000001');
    expect(counterStore.year).toBe('27');
  });
  it('K5 — 7-digit zero pad holds at LC-26000099 → LC-26000100', async () => {
    const { generateCustomerHN } = await import('../src/lib/backendClient.js');
    counterStore = { year: '26', seq: 99 };
    const hn = await generateCustomerHN();
    expect(hn).toBe('LC-26000100');
  });
  it('K6 — large seq holds 6-digit (LC-26-999999)', async () => {
    const { generateCustomerHN } = await import('../src/lib/backendClient.js');
    counterStore = { year: '26', seq: 999998 };
    const hn = await generateCustomerHN();
    expect(hn).toBe('LC-26999999');
  });
  it('K7 — runTransaction was called for each HN', async () => {
    const { generateCustomerHN } = await import('../src/lib/backendClient.js');
    await generateCustomerHN();
    await generateCustomerHN();
    await generateCustomerHN();
    expect(runTxCalls).toBe(3);
  });
  it('K8 — counter ref points at be_customer_counter/counter', async () => {
    const { generateCustomerHN } = await import('../src/lib/backendClient.js');
    await generateCustomerHN();
    expect(counterDocRef.__doc).toContain('be_customer_counter/counter');
  });
});

describe('V33.K source-grep regression guards', () => {
  it('K9 — counter doc collection name locked', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf-8');
    expect(src).toMatch(/be_customer_counter/);
    expect(src).toMatch(/customerCounterDoc/);
  });
  it('K10 — addCustomer + generateCustomerHN both exported', async () => {
    const mod = await import('../src/lib/backendClient.js');
    expect(typeof mod.generateCustomerHN).toBe('function');
    expect(typeof mod.addCustomer).toBe('function');
  });
});
